import type { CashChannel, CashExpenseCategory, CashMovement, CashMovementType, CashRegister, ItemCourse, Order, OrderItem, OrderPayment, OrderStatus, PaymentMethod, Table } from "@takeasygo/types"
import { calculateOrderTotal, cashExpectedDelta } from "@takeasygo/business/browser"

// ============================================================================
// Modelo local: lo que haría el server, aplicado en el equipo sin internet
// ============================================================================
// POS offline V2 — etapa 2 (12/11/2026). Funciones PURAS: reciben el registro
// de Dexie y devuelven el nuevo. Al volver la red, la respuesta del server
// reemplaza estos registros (gana el server), así que acá alcanza con que la
// pantalla muestre lo correcto mientras tanto:
//   · totales con la misma regla del server: Σ item.total, y cada item.total
//     ya trae (precio + agregados) × cantidad;
//   · mesa libre = sin orden, sin mozo, sin comensales, sin pedido de cuenta;
//   · entregar o cancelar libera la mesa de esa orden.
// `pendingSync: true` marca lo que el server todavía no confirmó.
// ============================================================================

/** Cambios que admite PATCH /pos/tables/[id] (los que usa el POS). */
export interface TablePatch {
  status?: Table["status"]
  serverId?: string
  currentOrderId?: string
  guests?: number
  needsBill?: boolean
  spaceId?: string
  capacity?: number
  layout?: Table["layout"] | null
}

export function applyTablePatch(table: Table, patch: TablePatch): Table {
  const next: Table = { ...table }
  if (patch.status !== undefined) next.status = patch.status
  if (patch.serverId !== undefined) next.serverId = patch.serverId
  if (patch.currentOrderId !== undefined) next.currentOrderId = patch.currentOrderId
  if (patch.guests !== undefined) next.guests = patch.guests
  if (patch.needsBill !== undefined) next.needsBill = patch.needsBill
  if (patch.spaceId !== undefined) next.spaceId = patch.spaceId
  if (patch.capacity !== undefined) next.capacity = patch.capacity
  if (patch.layout !== undefined) {
    if (patch.layout === null) delete next.layout
    else next.layout = patch.layout
  }
  if (patch.status === "free") {
    delete next.currentOrderId
    delete next.serverId
    delete next.serverName
    delete next.guests
    delete next.reservationId
    next.needsBill = false
  }
  return next
}

export interface LocalOrderDraft {
  id: string
  tenantId: string
  tableId?: string
  tableNumber?: number
  items: OrderItem[]
  notes?: string
  status?: "pending" | "confirmed"
  holdCourses?: ItemCourse[]
}

export function buildLocalOrder(draft: LocalOrderDraft, now: Date): Order {
  const status: OrderStatus = draft.status ?? "pending"
  return {
    id: draft.id,
    tenantId: draft.tenantId,
    source: "pos",
    status,
    ...(draft.tableId ? { tableId: draft.tableId } : {}),
    ...(draft.tableNumber !== undefined ? { tableNumber: draft.tableNumber } : {}),
    items: draft.items.map((i) => ({ ...i })),
    total: calculateOrderTotal(draft.items),
    menuVersion: 1,
    ...(draft.notes ? { notes: draft.notes } : {}),
    ...(draft.holdCourses?.length ? { heldCourses: [...draft.holdCourses] } : {}),
    ...(status === "confirmed" ? { sentToKitchenAt: now } : {}),
    createdAt: now,
    updatedAt: now,
    pendingSync: true,
  }
}

function withItems(order: Order, items: OrderItem[], now: Date): Order {
  return { ...order, items, total: calculateOrderTotal(items), updatedAt: now, pendingSync: true }
}

/** Total de la línea con la regla del server: (precio + agregados) × cantidad. */
export function lineTotal(item: Pick<OrderItem, "unitPrice" | "modifiers">, quantity: number): number {
  const extras = item.modifiers?.reduce((s, m) => s + m.price, 0) ?? 0
  return (item.unitPrice + extras) * quantity
}

export function applyAddItem(order: Order, item: OrderItem, now: Date): Order {
  return withItems(order, [...order.items, { ...item }], now)
}

/** Cambia la cantidad de las líneas de ese producto (0 = las quita), como el server. */
export function applyItemQuantity(order: Order, productId: string, quantity: number, now: Date): Order {
  const items = quantity === 0
    ? order.items.filter((i) => i.productId !== productId)
    : order.items.map((i) => (i.productId === productId ? { ...i, quantity, total: lineTotal(i, quantity) } : i))
  return withItems(order, items, now)
}

export function applyRemoveItem(order: Order, productId: string, now: Date): Order {
  return withItems(order, order.items.filter((i) => i.productId !== productId), now)
}

export function applyTransition(order: Order, status: OrderStatus, now: Date): Order {
  return {
    ...order,
    status,
    ...(status === "confirmed" && !order.sentToKitchenAt ? { sentToKitchenAt: now } : {}),
    updatedAt: now,
    pendingSync: true,
  }
}

export function applyFireCourse(order: Order, course: ItemCourse, now: Date): Order {
  if (!order.heldCourses?.includes(course)) return order
  return {
    ...order,
    heldCourses: order.heldCourses.filter((c) => c !== course),
    courseFires: [...(order.courseFires ?? []), { course, firedAt: now }],
    updatedAt: now,
    pendingSync: true,
  }
}

/** ¿Esta transición libera la mesa? (igual que el server al entregar/cancelar). */
export function releasesTable(status: OrderStatus): boolean {
  return status === "delivered" || status === "cancelled"
}

// ── Etapa 3: cobro y caja ────────────────────────────────────────────────────

/** Una parte del cobro tal como viaja a POST /orders/[id]/payments. */
export interface LocalPaymentPart {
  id: string
  method: PaymentMethod
  amount: number
  reference?: string
}

/**
 * Cobro de la orden sin internet. Mismas reglas que el server: la suma de las
 * partes tiene que ser el total de la orden, y una orden cancelada o ya
 * cobrada no se vuelve a cobrar. Devuelve el motivo del rechazo, si lo hay.
 */
export function applyPayments(order: Order, parts: LocalPaymentPart[], now: Date): Order | { error: string; code: "validation" | "conflict" } {
  if (order.status === "cancelled") return { error: "La orden está cancelada: no se puede cobrar", code: "conflict" }
  if (order.payments?.length) return { error: "La orden ya fue cobrada", code: "conflict" }
  if (parts.length === 0 || parts.some((p) => !Number.isInteger(p.amount) || p.amount <= 0)) {
    return { error: "Los montos del cobro tienen que ser positivos", code: "validation" }
  }
  const sum = parts.reduce((s, p) => s + p.amount, 0)
  if (sum !== order.total) return { error: "El cobro no cubre el total de la orden", code: "validation" }
  const payments: OrderPayment[] = parts.map((p) => ({ method: p.method, amount: p.amount, ...(p.reference ? { reference: p.reference } : {}) }))
  return { ...order, payments, paymentSource: "pos_charged", updatedAt: now, pendingSync: true }
}

export interface LocalRegisterDraft {
  id: string
  tenantId: string
  initialAmount: number
  openedBy: string
  defaultForChannel: CashChannel | null
  shiftId?: string | null
}

export function buildLocalRegister(draft: LocalRegisterDraft, now: Date): CashRegister {
  return {
    id: draft.id,
    tenantId: draft.tenantId,
    openedBy: draft.openedBy,
    openedAt: now,
    initialAmount: draft.initialAmount,
    expectedAmount: draft.initialAmount,
    movements: [],
    status: "open",
    defaultForChannel: draft.defaultForChannel,
    ...(draft.shiftId ? { shiftId: draft.shiftId } : {}),
  }
}

export interface LocalMovementDraft {
  id: string
  type: CashMovementType
  amount: number
  reason: string
  userId: string
  channel: CashChannel
  paymentMethod: PaymentMethod
  relatedOrderId?: string
  category?: CashExpenseCategory
}

/**
 * Movimiento de caja sin internet. Como el server: la caja tiene que estar
 * abierta, (relatedOrderId, tipo) no se repite y solo el efectivo mueve el
 * arqueo. Devuelve el movimiento (el existente si era repetido) y la caja.
 */
export function applyMovement(register: CashRegister, draft: LocalMovementDraft, now: Date): { register: CashRegister; movement: CashMovement } | { error: string } {
  if (register.status !== "open") return { error: "La caja está cerrada" }
  if (draft.relatedOrderId) {
    const existing = register.movements.find((m) => m.relatedOrderId === draft.relatedOrderId && m.type === draft.type)
    if (existing) return { register, movement: existing }
  }
  const movement: CashMovement = {
    id: draft.id,
    type: draft.type,
    amount: draft.amount,
    reason: draft.reason,
    userId: draft.userId,
    timestamp: now,
    channel: draft.channel,
    paymentMethod: draft.paymentMethod,
    ...(draft.relatedOrderId ? { relatedOrderId: draft.relatedOrderId } : {}),
    ...(draft.category ? { category: draft.category } : {}),
  }
  const expected = (register.expectedAmount ?? register.initialAmount) + cashExpectedDelta(draft.type, draft.paymentMethod, draft.amount)
  return { register: { ...register, movements: [...register.movements, movement], expectedAmount: expected }, movement }
}
