import type { OrderStatus, TableStatus } from "@takeasygo/types"

// ============================================================================
// Transiciones de dominio — única fuente de verdad
// ============================================================================
// Extraído de apps/pos/src/services/table.ts y apps/pos/src/services/order.ts
// (tablas "selladas por Gemini"). Ahora viven en el monorepo para que el POS
// client-side y los endpoints /api/[tenant]/pos/* de apps/saas validen
// EXACTAMENTE lo mismo. Una divergencia aquí sería un bug de seguridad:
// el server no puede aceptar un salto que el POS rechaza, ni viceversa.
//
// Regla: agregar un estado o una transición es un cambio de contrato y debe
// actualizarse en AMBOS lados de esta función (es única, por eso está acá).
// ============================================================================

/** Estados de mesa y salidas permitidas desde cada uno. */
export const TABLE_TRANSITIONS: Record<TableStatus, TableStatus[]> = {
  free: ["occupied", "reserved"],
  occupied: ["free", "closed", "reserved", "needs_attention"],
  reserved: ["free", "occupied"],
  needs_attention: ["occupied", "free", "reserved", "closed"],
  closed: [],
}

/** Estados de orden y salidas permitidas desde cada uno. */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "preparing", "cancelled", "delivered"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["en_ruta", "delivered", "cancelled"],
  en_ruta: ["arrived", "cancelled"],
  arrived: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
  requires_manual_attention: [
    "confirmed",
    "preparing",
    "ready",
    "en_ruta",
    "arrived",
    "delivered",
    "cancelled",
  ],
}

/**
 * Estados en los que todavía se pueden agregar/quitar items.
 * No es una transición: es elegibilidad de edición.
 */
export const ORDER_ITEM_EDITABLE_STATUSES: readonly OrderStatus[] = [
  "pending",
  "confirmed",
]

export function isValidTableTransition(from: TableStatus, to: TableStatus): boolean {
  return TABLE_TRANSITIONS[from]?.includes(to) ?? false
}

export function isValidOrderTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false
}

// Mapas de solo lectura para consultar el grafo sin indexar el objeto con una
// clave dinámica (mismo motivo por el que no se hace `obj[key]` en rutas de API).
const TABLE_TRANSITION_MAP = new Map<string, readonly TableStatus[]>(
  Object.entries(TABLE_TRANSITIONS)
)
const ORDER_TRANSITION_MAP = new Map<string, readonly OrderStatus[]>(
  Object.entries(ORDER_TRANSITIONS)
)

/** Destinos legales desde `from`. El POS los muestra sin reimplementar el grafo. */
export function allowedTableTransitions(from: TableStatus): readonly TableStatus[] {
  return TABLE_TRANSITION_MAP.get(from) ?? []
}

export function allowedOrderTransitions(from: OrderStatus): readonly OrderStatus[] {
  return ORDER_TRANSITION_MAP.get(from) ?? []
}

export function canEditOrderItems(status: OrderStatus): boolean {
  return ORDER_ITEM_EDITABLE_STATUSES.includes(status)
}

/**
 * Lanza si la transición de mesa no está permitida.
 * Mensaje idéntico al que ya emite el POS, para no romper tests/UI.
 */
export function assertTableTransition(from: TableStatus, to: TableStatus): void {
  if (!isValidTableTransition(from, to)) {
    const allowed = TABLE_TRANSITIONS[from] ?? []
    throw new Error(
      `[table] Invalid transition: ${from} → ${to}. Allowed: [${allowed.join(", ")}]`
    )
  }
}

/**
 * Lanza si la transición de orden no está permitida.
 * Mensaje idéntico al que ya emite el POS.
 */
export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (!isValidOrderTransition(from, to)) {
    const allowed = ORDER_TRANSITIONS[from] ?? []
    throw new Error(
      `[order] Invalid transition: ${from} → ${to}. Allowed: [${allowed.join(", ")}]`
    )
  }
}
