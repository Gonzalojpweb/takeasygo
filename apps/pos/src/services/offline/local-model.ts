import type { ItemCourse, Order, OrderItem, OrderStatus, Table } from "@takeasygo/types"
import { calculateOrderTotal } from "@takeasygo/business/browser"

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
