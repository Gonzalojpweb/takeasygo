import type { ItemCourse, Order, OrderItem, OrderStatus } from "@takeasygo/types"
import { pathToDelivered, DISCOUNT_REASONS as REASON_LABELS, DISCOUNT_REASON_IDS, type AllocatedPayment, type DiscountAmounts, type DiscountReason as SharedDiscountReason } from "@takeasygo/business/browser"
import { db } from "../db/dexie"
import { posApi, isPosApiError, PosApiError } from "./pos-api"
import { runMutation, resyncTablesSoon } from "./polling"
import { offlineAware } from "./offline/executor"
import { printForOfflineOp } from "./offline/local-print"
import { issueOfflineInvoice, offlineCaeaWire, offlineSaleInfo, printOfflineInvoice } from "./offline/caea"
import type { OfflineOp } from "./offline/types"
import { offlineApprovalHeaders, offlineDiscountApprovalHeaders } from "./offline/offline-auth"
import { readCachedDiscountPolicy } from "./discount-policy"
import { applyDiscount, applyVoidSentItem, distributeCents, grossOfLine, openRoundsOf, roundWeights } from "./offline/local-model"
import {
  applyAddItem,
  applyFireCourse,
  applyItemQuantity,
  applyRemoveItem,
  applyPayments,
  applyTransition,
  buildLocalOrder,
  releasesTable,
} from "./offline/local-model"
import { rehydrateOrder } from "./pos-wire"
import { notifyStatusToSyncLayer } from "./sync-api"
import type { InvoiceIntent } from "./fiscal"

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
  idempotencyKey?: string,
  headers?: Record<string, string>
): Promise<WireOrder> {
  const { order } = await posApi<{ order: WireOrder }>(tenantId, path, {
    method: "POST",
    body,
    idempotencyKey,
    headers,
  })
  return order
}

async function patchOrder(
  tenantId: string,
  path: string,
  body: Record<string, unknown>,
  headers?: Record<string, string>
): Promise<WireOrder> {
  const { order } = await posApi<{ order: WireOrder }>(tenantId, path, {
    method: "PATCH",
    body,
    headers,
  })
  return order
}

// ── POS offline (etapa 2) ────────────────────────────────────────────────────

/** «Mesa 5» o «Mostrador»: para el texto de la pantalla de sincronización. */
async function placeLabel(order: { tableId?: string; tableNumber?: number } | undefined): Promise<string> {
  if (order?.tableNumber !== undefined) return `Mesa ${order.tableNumber}`
  if (order?.tableId) {
    const t = await db.diningTable.get(order.tableId)
    if (t) return `Mesa ${t.number}`
  }
  return "Mostrador"
}

async function requireLocalOrder(orderId: string): Promise<WireOrder> {
  const order = await db.orders.get(orderId)
  if (!order) throw new PosApiError("Orden no encontrada en este equipo", "not_found", 404)
  return order
}

/**
 * Escritura de una orden «online si se puede, offline si hace falta». El
 * server devuelve `{ order }`; sin red, `local` arma el mismo registro desde
 * el que está en Dexie.
 */
async function writeOrder(params: {
  tenantId: string
  orderId: string
  label: string
  method: "POST" | "PATCH" | "DELETE"
  path: string
  body?: Record<string, unknown>
  idempotencyKey?: string
  extraKeys?: string[]
  local: (current: WireOrder, now: Date) => WireOrder
  /** Etapa 4: impresión por la red local después de aplicarla sin internet. */
  afterLocal?: (order: WireOrder, opId: string) => Promise<void>
  /** Etapa 5: trabajo extra DENTRO de la transacción local (puede completar la operación). */
  applied?: (order: WireOrder, op: OfflineOp) => Promise<void>
  /** Etapa 7: antes de aplicarla sin internet (PIN del encargado). */
  beforeLocal?: () => Promise<Record<string, string>>
}): Promise<WireOrder> {
  return runMutation(() =>
    offlineAware<WireOrder>({
      tenantId: params.tenantId,
      kind: "order.write",
      label: params.label,
      request: { method: params.method, path: params.path, body: params.body, idempotencyKey: params.idempotencyKey },
      entityKeys: [`order:${params.orderId}`, ...(params.extraKeys ?? [])],
      online: async (headers) => {
        const { order } = await posApi<{ order: WireOrder }>(params.tenantId, params.path, {
          method: params.method,
          body: params.body,
          idempotencyKey: params.idempotencyKey,
          headers,
        })
        return saveOrder(order)
      },
      applyLocal: async (op) => {
        const next = params.local(await requireLocalOrder(params.orderId), new Date())
        await db.orders.put(next)
        if (params.applied) await params.applied(next, op)
        return next
      },
      ...(params.beforeLocal ? { beforeLocal: params.beforeLocal } : {}),
      ...(params.afterLocal ? { afterLocal: (order: WireOrder, op: { id: string }) => params.afterLocal!(order, op.id) } : {}),
    })
  )
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
const STATUS_LABEL: Partial<Record<OrderStatus, string>> = {
  confirmed: "a cocina",
  preparing: "en preparación",
  ready: "lista",
  delivered: "entregada",
  cancelled: "cancelada",
  en_ruta: "en camino",
  arrived: "llegó",
}

async function transition(
  tenantId: string,
  orderId: string,
  status: OrderStatus,
  jwt?: string
): Promise<void> {
  const path = `/orders/${encodeURIComponent(orderId)}`
  const known = await db.orders.get(orderId)
  const label = `${await placeLabel(known)} · ${STATUS_LABEL[status] ?? status}`
  await runMutation(() =>
    offlineAware<void>({
      tenantId,
      kind: "order.status",
      label,
      request: { method: "PATCH", path, body: { status } },
      entityKeys: [`order:${orderId}`, ...(known?.tableId && releasesTable(status) ? [`table:${known.tableId}`] : [])],
      online: async (headers) => {
        const order = await saveOrder(await patchOrder(tenantId, path, { status }, headers))
        if (releasesTable(status)) await releaseLocalTable(order.tableId, orderId)
        if (jwt) notifyStatusToSyncLayer(orderId, status, jwt).catch(() => {})
      },
      applyLocal: async () => {
        const order = applyTransition(await requireLocalOrder(orderId), status, new Date())
        await db.orders.put(order)
        if (releasesTable(status)) await releaseLocalTable(order.tableId, orderId)
      },
      // Etapa 4: confirmar = mandar a cocina. Sin internet, la comanda sale
      // por la red local (como onOrderConfirmed en el server).
      ...(status === "confirmed"
        ? {
            afterLocal: async (_: void, op: { id: string }) => {
              const order = await db.orders.get(orderId)
              if (order) await printForOfflineOp(tenantId, op.id, { type: "comanda", order })
            },
          }
        : {}),
    })
  )
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
  /** Piloto 06/11: tiempos que esperan la marcha del mozo. */
  holdCourses?: ItemCourse[]
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
  const id = options.id ?? crypto.randomUUID()

  // `mostrador-<ts>` es un marcador local del Counter, no una mesa: si no
  // existe en el registro de mesas no viaja y el server la trata como
  // takeaway. Con mesa real siempre está en Dexie (es lo que eligió la UI).
  const table = tableId ? await db.diningTable.get(tableId) : undefined
  const isRealTable = Boolean(table)
  const body = {
    id,
    items,
    ...(isRealTable ? { tableId } : {}),
    ...(notes ? { notes } : {}),
    ...(options.status ? { status: options.status } : {}),
    ...(options.holdCourses?.length ? { holdCourses: options.holdCourses } : {}),
  }

  return runMutation(() =>
    offlineAware<Order>({
      tenantId,
      kind: "order.write",
      label: `${table ? `Mesa ${table.number}` : "Mostrador"} · ${options.status === "confirmed" ? "ronda a cocina" : "nueva ronda"}`,
      request: { method: "POST", path: "/orders", body, idempotencyKey: id },
      entityKeys: [`order:${id}`, ...(table ? [`table:${table.id}`] : [])],
      online: async (headers) => saveOrder(await postOrder(tenantId, "/orders", body, id, headers)),
      applyLocal: async () => {
        const order = buildLocalOrder(
          { id, tenantId, ...(table ? { tableId: table.id, tableNumber: table.number } : {}), items, notes, status: options.status, holdCourses: options.holdCourses },
          new Date()
        )
        await db.orders.put(order)
        return order
      },
      // Etapa 4: la ronda que nace enviada a cocina imprime su comanda por la
      // red local (con internet la arma el server).
      ...(options.status === "confirmed"
        ? { afterLocal: (order: Order, op: { id: string }) => printForOfflineOp(tenantId, op.id, { type: "comanda", order }) }
        : {}),
    })
  ).catch((err: unknown) => {
    // 30/10: «Mesa no encontrada en esta sede» ⇒ el salón se actualiza solo.
    if (tableId && isPosApiError(err) && err.status === 404) resyncTablesSoon(tenantId)
    throw err
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
  reason?: string,
  /**
   * Decisión de facturar (orden 31/10, P1.2). Con facturación activa el
   * server deja la factura pendiente al confirmar el cobro.
   */
  invoice?: InvoiceIntent
): Promise<Order> {
  const parts = payments.map((p) => ({
    id: p.id,
    method: p.method,
    amount: p.amount,
    ...(p.reference ? { reference: p.reference } : {}),
  }))
  const total = parts.reduce((sum, p) => sum + p.amount, 0)
  return writeOrder({
    tenantId,
    orderId,
    label: `${await placeLabel(await db.orders.get(orderId))} · cobro $${(total / 100).toLocaleString("es-AR")}`,
    method: "POST",
    path: `/orders/${encodeURIComponent(orderId)}/payments`,
    body: {
      ...(reason ? { reason } : {}),
      ...(invoice ? { invoice } : {}),
      payments: parts,
    },
    // Sin red: mismas reglas que el server (suma = total, no cobrar dos veces).
    local: (o, now) => {
      const next = applyPayments(o, parts, now)
      if ("error" in next) throw new PosApiError(next.error, next.code, next.code === "conflict" ? 409 : 400)
      return next
    },
    // Etapa 5: con factura pedida, se emite con CAEA en la misma transacción
    // y viaja con el cobro. Si no se puede, queda pendiente (la emite el
    // server con CAE al volver la red).
    applied: async (order, op) => {
      // Cuenta en $0: no hay importe que facturar (como el server).
      if (!invoice || !("receiver" in invoice) || order.total === 0) return
      const result = await issueOfflineInvoice(tenantId, order, invoice.receiver, offlineSaleInfo(order, parts))
      if ("reason" in result) {
        offlineInvoiceReasons.set(orderId, result.reason)
        return
      }
      const body = op.body as { invoice?: Record<string, unknown> }
      body.invoice = { ...invoice, offlineCaea: offlineCaeaWire(result) }
    },
    afterLocal: async (_order, opId) => {
      if (invoice && "receiver" in invoice) await printOfflineInvoice(tenantId, opId, orderId)
    },
  })
}

/**
 * Motivo por el que una factura pedida sin internet NO salió con CAEA (para
 * mostrarlo en el cobro). Se lee una vez.
 */
const offlineInvoiceReasons = new Map<string, string>()
export function takeOfflineInvoiceReason(orderId: string): string | null {
  const reason = offlineInvoiceReasons.get(orderId) ?? null
  offlineInvoiceReasons.delete(orderId)
  return reason
}

/**
 * «Marcha» de un tiempo en espera (piloto 06/11): la cocina imprime
 * «MARCHA PRINCIPAL» + mesa, sin repetir los platos. Idempotente en el
 * server: un doble toque no saca dos marchas.
 */
export async function fireCourse(tenantId: string, orderId: string, course: ItemCourse, firedBy?: string | null): Promise<Order> {
  // Solo marcha (e imprime) si el tiempo seguía en espera, como el server.
  let wasHeld = false
  return writeOrder({
    tenantId,
    orderId,
    label: `${await placeLabel(await db.orders.get(orderId))} · marcha ${course}`,
    method: "POST",
    path: `/orders/${encodeURIComponent(orderId)}/courses`,
    body: { course },
    local: (o, now) => {
      wasHeld = Boolean(o.heldCourses?.includes(course))
      return applyFireCourse(o, course, now)
    },
    afterLocal: async (order, opId) => {
      if (wasHeld) await printForOfflineOp(tenantId, opId, { type: "marcha", order, course, firedBy: firedBy ?? null })
    },
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
  return writeOrder({
    tenantId,
    orderId,
    label: `${await placeLabel(await db.orders.get(orderId))} · celular del cliente`,
    method: "PATCH",
    path: `/orders/${encodeURIComponent(orderId)}`,
    body: { customerPhone: phone },
    // El server lo guarda cifrado y el POS no lo muestra: localmente no cambia nada.
    local: (o, now) => ({ ...o, updatedAt: now, pendingSync: true }),
  })
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
  await writeOrder({
    tenantId,
    orderId,
    label: `${await placeLabel(await db.orders.get(orderId))} · agregar ${item.quantity} × ${item.name}`,
    method: "POST",
    path: `/orders/${encodeURIComponent(orderId)}/items`,
    body: {
      productId: item.productId,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.total,
      ...(item.modifiers ? { modifiers: item.modifiers } : {}),
      ...(item.notes ? { notes: item.notes } : {}),
      ...(item.course ? { course: item.course } : {}),
    },
    local: (o, now) => applyAddItem(o, item, now),
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
  // Etapa 7: también sin internet, con el PIN del encargado verificado en el
  // equipo (si el plato ya se mandó a cocina, como pide el server).
  const known = await db.orders.get(orderId)
  const needsApproval = known?.status === "confirmed"
  await writeOrder({
    tenantId,
    orderId,
    label: `${await placeLabel(known)} · quitar plato enviado`,
    method: "PATCH",
    path: `/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(line.productId)}`,
    body: { quantity: keepQuantity, lineId: line.lineId, reason },
    local: (o, now) => {
      const next = applyVoidSentItem(o, line.lineId, keepQuantity, now)
      if ("error" in next) throw new PosApiError(next.error, "validation", 400)
      return next
    },
    ...(needsApproval ? { beforeLocal: () => offlineApprovalHeaders(tenantId, "Quitar productos que ya se mandaron a cocina necesita la aprobación de un encargado") } : {}),
  })
}

export async function removeItem(
  tenantId: string,
  orderId: string,
  productId: string
): Promise<void> {
  await writeOrder({
    tenantId,
    orderId,
    label: `${await placeLabel(await db.orders.get(orderId))} · quitar producto`,
    method: "DELETE",
    path: `/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(productId)}`,
    local: (o, now) => applyRemoveItem(o, productId, now),
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

  await writeOrder({
    tenantId,
    orderId,
    label: `${await placeLabel(await db.orders.get(orderId))} · cantidad ${quantity}`,
    method: "PATCH",
    path: `/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(productId)}`,
    body: { quantity },
    local: (o, now) => applyItemQuantity(o, productId, quantity, now),
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
): Promise<Order & { fiscalNotice?: string | null }> {
  return runMutation(async () => {
    const { order, fiscalNotice } = await posApi<{ order: WireOrder; fiscalNotice?: string | null }>(
      tenantId,
      `/orders/${encodeURIComponent(orderId)}/void`,
      { method: "POST", body: { reason, ...(note ? { note } : {}) } }
    )
    return { ...(await saveOrder(order)), fiscalNotice }
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

// ============================================================================
// Descuentos (Fase D, 2026-10) — espejo de lib/pos-online/discounts del SaaS
// ============================================================================
// El server decide el importe (bajando el subtotal de cada línea) y, con la
// POLÍTICA DEL COMERCIO (14/11/2026), si alcanza solo o hace falta el PIN de
// alguien que lo cubra: pos-api lo resuelve con el diálogo de aprobación.
// Sin internet decide la copia de la política guardada en el equipo y el
// server la reevalúa al sincronizar. Los motivos salen de la misma lista que
// usa el server (@takeasygo/business/discount-policy).

export type DiscountReason = SharedDiscountReason

export const DISCOUNT_REASONS: readonly { id: DiscountReason; label: string }[] = DISCOUNT_REASON_IDS.map((id) => ({ id, label: REASON_LABELS[id] }))

export interface DiscountRequest {
  kind: "percent" | "amount"
  /** Porcentaje 1–100 o monto en centavos. */
  value: number
  reason: DiscountReason
  note?: string
  /**
   * Modo «importe final»: lo que se quiere cobrar (centavos). Va con
   * kind "amount" y value = base − final; el server verifica que el total
   * que queda sea exactamente este (si la cuenta cambió, rechaza).
   */
  finalCents?: number
}

/** Importes de la cuenta (rondas) para evaluar la política: bruto y descuento. */
function accountOf(rounds: WireOrder[], replaced: Map<string, WireOrder>): DiscountAmounts {
  let grossCents = 0
  let discountCents = 0
  let previousDiscountCents = 0
  for (const round of rounds) {
    const after = replaced.get(round.id) ?? round
    for (const item of round.items) {
      grossCents += grossOfLine(item)
      previousDiscountCents += item.discount?.amount ?? 0
    }
    for (const item of after.items) discountCents += item.discount?.amount ?? 0
  }
  return { grossCents, discountCents, previousDiscountCents }
}

/** Sin internet: PIN según la política (cuenta = la mesa entera si la orden es de una mesa). */
async function offlineOrderDiscountHeaders(tenantId: string, orderId: string, discount: DiscountRequest, lineId: string | null): Promise<Record<string, string>> {
  const order = await requireLocalOrder(orderId)
  const next = localDiscount(order, discount, lineId, new Date())
  const rounds = order.tableId ? openRoundsOf((await db.orders.where("tableId").equals(order.tableId).toArray()) as WireOrder[], order.tableId) : []
  const account = rounds.some((r) => r.id === order.id) ? rounds : [order]
  return offlineDiscountApprovalHeaders(tenantId, readCachedDiscountPolicy(tenantId).policy, accountOf(account, new Map([[order.id, next]])))
}

/** Lo que viaja al server (sin campos vacíos). */
function discountBody(discount: DiscountRequest): Record<string, unknown> {
  return {
    kind: discount.kind,
    value: discount.value,
    reason: discount.reason,
    ...(discount.note ? { note: discount.note } : {}),
    ...(discount.finalCents !== undefined ? { finalCents: discount.finalCents } : {}),
  }
}

/** Descuento sobre UN plato de una ronda. */
export async function discountOrderLine(
  tenantId: string,
  orderId: string,
  lineId: string,
  discount: DiscountRequest
): Promise<void> {
  await writeOrder({
    tenantId,
    orderId,
    label: `${await placeLabel(await db.orders.get(orderId))} · descuento en un plato`,
    method: "POST",
    path: `/orders/${encodeURIComponent(orderId)}/discounts`,
    body: { ...discountBody(discount), lineId },
    local: (o, now) => localDiscount(o, discount, lineId, now),
    beforeLocal: () => offlineOrderDiscountHeaders(tenantId, orderId, discount, lineId),
  })
}

function localDiscount(o: WireOrder, discount: DiscountRequest, lineId: string | null, now: Date): WireOrder {
  const next = applyDiscount(o, { kind: discount.kind, value: discount.value, reason: discount.reason }, lineId, now)
  if ("error" in next) throw new PosApiError(next.error, "conflict", 409)
  return next
}

export async function removeOrderLineDiscount(tenantId: string, orderId: string, lineId: string): Promise<void> {
  return runMutation(async () => {
    const { order } = await posApi<{ order: WireOrder }>(
      tenantId,
      `/orders/${encodeURIComponent(orderId)}/discounts?lineId=${encodeURIComponent(lineId)}`,
      { method: "DELETE" }
    )
    await saveOrder(order)
  })
}

/** Descuento a TODA la cuenta de la mesa (el server lo reparte entre rondas). */
export async function discountTable(tenantId: string, tableId: string, discount: DiscountRequest): Promise<number> {
  const path = `/tables/${encodeURIComponent(tableId)}/discount`
  const table = await db.diningTable.get(tableId)
  const rounds = openRoundsOf((await db.orders.where("tableId").equals(tableId).toArray()) as WireOrder[], tableId)
  return runMutation(() =>
    offlineAware<number>({
      tenantId,
      kind: "order.many",
      label: `Mesa ${table?.number ?? "?"} · descuento de la cuenta`,
      request: { method: "POST", path, body: discountBody(discount) },
      entityKeys: [`table:${tableId}`, ...rounds.map((o) => `order:${o.id}`)],
      online: async (headers) => {
        const res = await posApi<{ orders: WireOrder[]; discountedCents: number }>(tenantId, path, { method: "POST", body: discountBody(discount), headers })
        for (const order of res.orders) await saveOrder(order)
        return res.discountedCents
      },
      // Como el server: un MONTO se reparte entre las rondas por su bruto y
      // cada ronda lo reparte entre sus platos; un % va igual en todas.
      applyLocal: async () => {
        const current = openRoundsOf((await db.orders.where("tableId").equals(tableId).toArray()) as WireOrder[], tableId)
        if (current.length === 0) throw new PosApiError("La mesa no tiene nada sin cobrar", "conflict", 409)
        const shares = discount.kind === "amount" ? distributeCents(roundWeights(current), discount.value) : null
        const now = new Date()
        let discounted = 0
        for (const [i, round] of current.entries()) {
          if (shares && shares[i] <= 0) continue
          const before = round.total
          const next = localDiscount(round, shares ? { ...discount, value: shares[i] } : discount, null, now)
          await db.orders.put(next)
          discounted += before - next.total
        }
        return discounted
      },
      beforeLocal: async () => {
        const current = openRoundsOf((await db.orders.where("tableId").equals(tableId).toArray()) as WireOrder[], tableId)
        if (current.length === 0) throw new PosApiError("La mesa no tiene nada sin cobrar", "conflict", 409)
        const shares = discount.kind === "amount" ? distributeCents(roundWeights(current), discount.value) : null
        const now = new Date()
        const replaced = new Map<string, WireOrder>()
        current.forEach((round, i) => {
          if (shares && shares[i] <= 0) return
          replaced.set(round.id, localDiscount(round, shares ? { ...discount, value: shares[i] } : discount, null, now))
        })
        return offlineDiscountApprovalHeaders(tenantId, readCachedDiscountPolicy(tenantId).policy, accountOf(current, replaced))
      },
    })
  )
}

export async function removeTableDiscounts(tenantId: string, tableId: string): Promise<void> {
  return runMutation(async () => {
    const res = await posApi<{ orders: WireOrder[] }>(tenantId, `/tables/${encodeURIComponent(tableId)}/discount`, { method: "DELETE" })
    for (const order of res.orders) await saveOrder(order)
  })
}

/** Descuento a TODA una orden (Mostrador, Fase E). Devuelve la orden con el total nuevo. */
export async function discountOrder(tenantId: string, orderId: string, discount: DiscountRequest): Promise<Order> {
  return writeOrder({
    tenantId,
    orderId,
    label: `${await placeLabel(await db.orders.get(orderId))} · descuento de la cuenta`,
    method: "POST",
    path: `/orders/${encodeURIComponent(orderId)}/discounts`,
    body: discountBody(discount),
    local: (o, now) => localDiscount(o, discount, null, now),
    beforeLocal: () => offlineOrderDiscountHeaders(tenantId, orderId, discount, null),
  })
}

/**
 * Espejo del cálculo del server (lib/pos-online/discounts): cuánto descuenta
 * un descuento a toda la cuenta sobre líneas de importe `lineTotals`. El %
 * se redondea por línea (como el server); el monto nunca supera el total.
 * Sirve para mostrar el total ANTES de crear la orden (Mostrador); el server
 * igual decide y el cobro se valida contra su total.
 */
export function expectedDiscountCents(lineTotals: number[], discount: Pick<DiscountRequest, "kind" | "value">): number {
  const total = lineTotals.reduce((s, n) => s + n, 0)
  if (discount.kind === "amount") return Math.min(total, discount.value)
  return lineTotals.reduce((s, line) => s + Math.min(line, Math.round((line * discount.value) / 100)), 0)
}
