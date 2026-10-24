import type { Order, OrderItem, OrderStatus } from "@takeasygo/types"
import { pathToDelivered, type AllocatedPayment } from "@takeasygo/business/browser"
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

export interface CreateOrderOptions {
  /**
   * posId a usar. El Counter lo fija ANTES del primer intento de cobro: un
   * reintento después de un error de red reenvía el mismo id y el server
   * responde la orden ya creada (200) en vez de duplicarla.
   */
  id?: string
  /** `confirmed` = nace enviada a cocina (el server genera la comanda). */
  status?: "pending" | "confirmed"
}

export async function createOrder(
  tenantId: string,
  tableId: string,
  items: OrderItem[],
  notes?: string,
  /**
   * Firma estable: lo sigue pasando useOrders. No tiene equivalente en el
   * contrato /pos/orders — la mesa se ocupa aparte con occupyTable().
   */
  _serverId?: string,
  options: CreateOrderOptions = {}
): Promise<Order> {
  return runMutation(async () => {
    const id = options.id ?? crypto.randomUUID()

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
        ...(options.status ? { status: options.status } : {}),
      },
      id
    )

    return saveOrder(order)
  })
}

/**
 * Registra el cobro en la orden (POST /pos/orders/[id]/payments). El server
 * exige que la suma sea el total que él recalculó y es idempotente: el mismo
 * conjunto de partes reenviado devuelve 200 con la orden.
 */
export async function recordPayments(
  tenantId: string,
  orderId: string,
  payments: AllocatedPayment[],
  /** Concepto en la caja ("Pedido M5"): el server registra la venta con él. */
  reason?: string
): Promise<Order> {
  return runMutation(async () => {
    const order = await postOrder(
      tenantId,
      `/orders/${encodeURIComponent(orderId)}/payments`,
      {
        ...(reason ? { reason } : {}),
        payments: payments.map((p) => ({
          id: p.id,
          method: p.method,
          amount: p.amount,
          ...(p.reference ? { reference: p.reference } : {}),
        })),
      }
    )
    return saveOrder(order)
  })
}

/**
 * Celular del cliente en la orden (socio del club). El server lo guarda
 * cifrado: al entregarse, el pedido suma los puntos del club y cuenta para
 * el programa de referidos (visita al local). '' lo quita.
 */
export async function setOrderCustomerPhone(
  tenantId: string,
  orderId: string,
  phone: string
): Promise<Order> {
  return runMutation(async () =>
    saveOrder(
      await patchOrder(tenantId, `/orders/${encodeURIComponent(orderId)}`, {
        customerPhone: phone,
      })
    )
  )
}

/**
 * Lleva una orden cobrada hasta `delivered` recorriendo el grafo legal
 * (confirmed → preparing → ready → delivered). Se usa al cerrar una mesa o
 * una venta de entrega inmediata: la orden ya se sirvió. Idempotente: si ya
 * está entregada no hace nada; si está cancelada, lanza.
 */
export async function settleToDelivered(
  tenantId: string,
  orderId: string,
  jwt?: string
): Promise<void> {
  const current = await db.orders.get(orderId)
  if (!current) throw new Error(`[order] Order ${orderId} not found`)
  const path = pathToDelivered(current.status)
  if (path === null) {
    throw new Error(`[order] Order ${orderId} no puede entregarse desde ${current.status}`)
  }
  for (const status of path) {
    await transition(tenantId, orderId, status, jwt)
  }
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
        ...(item.course ? { course: item.course } : {}),
      }
    )

    await saveOrder(order)
  })
}

/** Motivos para quitar un plato ya enviado (espejo de lib/pos-online/itemVoids). */
export const ITEM_VOID_REASONS = [
  { id: "load_error", label: "Error de carga", wasted: false },
  { id: "changed_mind", label: "El cliente cambió", wasted: false },
  { id: "out_of_stock", label: "Producto agotado", wasted: false },
  { id: "delay_complaint", label: "Demora o reclamo", wasted: true },
  { id: "dropped", label: "Se cayó / rompió", wasted: true },
] as const

export type ItemVoidReason = (typeof ITEM_VOID_REASONS)[number]["id"]

/**
 * Fase C (2026-10): baja o quita UNA línea ya enviada a cocina, con motivo.
 * Va por `lineId` (dos líneas del mismo producto con distinta nota son
 * distintas). Si hace falta, pos-api pide el PIN del encargado y reintenta.
 */
export async function voidSentItem(
  tenantId: string,
  orderId: string,
  line: { productId: string; lineId: string },
  keepQuantity: number,
  reason: ItemVoidReason
): Promise<void> {
  if (keepQuantity < 0) throw new Error("[order] Quantity cannot be negative")
  return runMutation(async () => {
    const order = await patchOrder(
      tenantId,
      `/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(line.productId)}`,
      { quantity: keepQuantity, lineId: line.lineId, reason }
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

/**
 * Anula una venta COBRADA (Fase 1 de caja): el server registra la devolución
 * en la caja abierta y, si el usuario es cajero, pide el PIN del encargado
 * (lo resuelve posApi con el diálogo de aprobación).
 */
export async function voidOrder(
  tenantId: string,
  orderId: string,
  reason: "load_error" | "customer_left" | "complaint" | "other",
  note?: string
): Promise<Order> {
  return runMutation(async () => {
    const order = await postOrder(tenantId, `/orders/${encodeURIComponent(orderId)}/void`, {
      reason,
      ...(note ? { note } : {}),
    })
    return saveOrder(order)
  })
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
