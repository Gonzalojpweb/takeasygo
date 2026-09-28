import type { Order, OrderItem, OrderStatus } from "@takeasygo/types"
import { db } from "../db/dexie"
import { posApi } from "./pos-api"
import { runMutation } from "./polling"
import { rehydrateOrder } from "./pos-wire"
import { notifyStatusToSyncLayer } from "./sync-api"

// ============================================================================
// Server-first (V1 POS Online) — órdenes
// ============================================================================
// Todo va contra /api/[tenant]/pos/orders*. El server es la única fuente de
// verdad para:
//   · totales (recalculados desde los items; un total descuadre → 400)
//   · editar items en estado que no lo permite (409)
//   · grafo de transiciones (@takeasygo/business — mismo módulo que acá)
//   · liberar la mesa al cancelar/entregar
//   · idempotencia por posId (= Idempotency-Key)
// Dexie se escribe recién con la respuesta, con las fechas rehidratadas (D10).
// El outbox ya no participa para estas escrituras.
//
// Regla de validación: las reglas de dominio (items, totales, grafo de
// transiciones, ciclo de vida) SOLO las decide el server. Del lado cliente
// quedan únicamente guardas triviales de argumentos (`quantity < 0`) que no
// pueden divergir.
//
// `notifyStatusToSyncLayer` se MANTIENE como estaba: sigue empujando el cambio
// de estado a Sync Layer para que emita por socket a cocina/otras terminales.
// M6 no lo retiró — el polling cubre la concurrencia entre terminales del POS,
// no el empuje de estado a Sync Layer. Retirarlo es D16 (decisión aparte).
//
// `runMutation` marca cada ciclo servidor+Dexie para que el polling no
// escriba por encima con una respuesta anterior.
// ============================================================================

type WireOrder = Order

async function postOrder(
  tenantId: string,
  path: string,
  body: Record<string, unknown>,
  idempotencyKey?: string
): Promise<WireOrder> {
  const { order } = await posApi<{ order: WireOrder }>(tenantId, path, {
    method: "POST",
    body,
    idempotencyKey,
  })
  return order
}

async function patchOrder(
  tenantId: string,
  path: string,
  body: Record<string, unknown>
): Promise<WireOrder> {
  const { order } = await posApi<{ order: WireOrder }>(tenantId, path, {
    method: "PATCH",
    body,
  })
  return order
}

async function saveOrder(order: WireOrder): Promise<WireOrder> {
  const rehydrated = rehydrateOrder(order)
  await db.orders.put(rehydrated)
  return rehydrated
}

/**
 * Espejo local de lo que el server ya hizo al cancelar/entregar: la mesa
 * quedó libre en Mongo, así que el read model de esta terminal también.
 * No es una escritura nueva — es el reflejo de la confirmación del server.
 */
async function releaseLocalTable(
  tableId: string | undefined,
  orderId: string
): Promise<void> {
  if (!tableId) return

  const table = await db.diningTable.get(tableId)
  if (!table || table.currentOrderId !== orderId) return

  await db.diningTable.update(tableId, {
    status: "free",
    currentOrderId: undefined,
    serverId: undefined,
    needsBill: false,
  })
}

/** Transición de estado + refresco local + notify fire-and-forget a sync. */
async function transition(
  tenantId: string,
  orderId: string,
  status: OrderStatus,
  jwt?: string
): Promise<void> {
  return runMutation(async () => {
    const order = await saveOrder(
      await patchOrder(tenantId, `/orders/${encodeURIComponent(orderId)}`, {
        status,
      })
    )

    if (status === "cancelled" || status === "delivered") {
      await releaseLocalTable(order.tableId, orderId)
    }

    if (jwt) {
      notifyStatusToSyncLayer(orderId, status, jwt).catch(() => {})
    }
  })
}

// ============================================================================
// Mutaciones
// ============================================================================

export async function createOrder(
  tenantId: string,
  tableId: string,
  items: OrderItem[],
  notes?: string,
  /**
   * Firma estable: lo sigue pasando useOrders. No tiene equivalente en el
   * contrato /pos/orders — la mesa se ocupa aparte con occupyTable().
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _serverId?: string
): Promise<Order> {
  return runMutation(async () => {
    const id = crypto.randomUUID()

    // `mostrador-<ts>` es un marcador local del Counter, no una mesa: si no
    // existe en el registro de mesas no viaja y el server la trata como
    // takeaway. Con mesa real siempre está en Dexie (es lo que eligió la UI).
    const isRealTable = Boolean(tableId) && Boolean(await db.diningTable.get(tableId))

    const order = await postOrder(
      tenantId,
      "/orders",
      {
        id,
        items,
        ...(isRealTable ? { tableId } : {}),
        ...(notes ? { notes } : {}),
      },
      id
    )

    return saveOrder(order)
  })
}

export async function addItem(
  tenantId: string,
  orderId: string,
  item: OrderItem
): Promise<void> {
  return runMutation(async () => {
    const order = await postOrder(
      tenantId,
      `/orders/${encodeURIComponent(orderId)}/items`,
      {
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.total,
        ...(item.modifiers ? { modifiers: item.modifiers } : {}),
        ...(item.notes ? { notes: item.notes } : {}),
      }
    )

    await saveOrder(order)
  })
}

export async function removeItem(
  tenantId: string,
  orderId: string,
  productId: string
): Promise<void> {
  return runMutation(async () => {
    const order = await posApi<{ order: WireOrder }>(
      tenantId,
      `/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(productId)}`,
      { method: "DELETE" }
    ).then((r) => r.order)

    await saveOrder(order)
  })
}

export async function updateItemQuantity(
  tenantId: string,
  orderId: string,
  productId: string,
  quantity: number
): Promise<void> {
  if (quantity < 0) {
    throw new Error(`[order] Quantity cannot be negative`)
  }

  return runMutation(async () => {
    const order = await patchOrder(
      tenantId,
      `/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(productId)}`,
      { quantity }
    )

    await saveOrder(order)
  })
}

export async function confirmOrder(
  tenantId: string,
  orderId: string,
  jwt?: string
): Promise<void> {
  await transition(tenantId, orderId, "confirmed", jwt)
}

export async function prepareOrder(
  tenantId: string,
  orderId: string,
  jwt?: string
): Promise<void> {
  await transition(tenantId, orderId, "preparing", jwt)
}

export async function markReady(
  tenantId: string,
  orderId: string,
  jwt?: string
): Promise<void> {
  await transition(tenantId, orderId, "ready", jwt)
}

export async function cancelOrder(
  tenantId: string,
  orderId: string,
  jwt?: string
): Promise<void> {
  await transition(tenantId, orderId, "cancelled", jwt)
}

export async function deliverOrder(
  tenantId: string,
  orderId: string,
  jwt?: string
): Promise<void> {
  await transition(tenantId, orderId, "delivered", jwt)
}

export async function setEnRuta(
  tenantId: string,
  orderId: string,
  jwt?: string
): Promise<void> {
  await transition(tenantId, orderId, "en_ruta", jwt)
}

export async function setArrived(
  tenantId: string,
  orderId: string,
  jwt?: string
): Promise<void> {
  await transition(tenantId, orderId, "arrived", jwt)
}

// ============================================================================
// Lecturas — siguen locales: Dexie es el read model y `services/polling.ts`
// lo refresca contra GET /pos/orders sin borrar nada.
// ============================================================================

export async function getOrder(
  tenantId: string,
  orderId: string
): Promise<Order | undefined> {
  const order = await db.orders.get(orderId)
  if (!order || order.tenantId !== tenantId) return undefined
  return order
}

export async function getOrdersByTable(
  tenantId: string,
  tableId: string
): Promise<Order[]> {
  return db.orders
    .where("tenantId")
    .equals(tenantId)
    .and((o) => o.tableId === tableId)
    .toArray()
}

export async function getActiveOrders(tenantId: string): Promise<Order[]> {
  return db.orders
    .where("tenantId")
    .equals(tenantId)
    .and((o) => !["delivered", "cancelled"].includes(o.status))
    .toArray()
}
