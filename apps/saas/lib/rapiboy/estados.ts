// ─── Rapiboy State Mapping ───────────────────────────────────────────────────
//
// Mapeo de estados de Rapiboy a estados de TakeasyGO.
// Referencia: documentación de Rapiboy OnDemand - Enumeraciones.

/**
 * Estados de Rapiboy → OrderStatus de TakeasyGO.
 *
 * Rapiboy usa códigos numéricos. TakeasyGO usa strings.
 * Este mapping se usa en el webhook para traducir las notificaciones.
 */
export const RAPIBOY_ESTADOS_MAP: Record<number, string> = {
  10: 'confirmed',    // ProcesandoPedido — Rapiboy procesando la solicitud
  11: 'en_ruta',      // EnCamino — Repartidor en camino a buscar el pedido
  12: 'arrived',      // EnDestino — Repartidor llegó al destino del cliente
  13: 'delivered',    // Entregado — Pedido entregado exitosamente
  14: 'cancelled',    // Cancelado — Viaje cancelado
  // Estos estados son internos de Rapiboy y no se mapean directamente:
  // 15: Asignado — Rapiboy buscando repartidor (equivalente a 'pending' en nuestro sistema)
}

/**
 * Estados de Rapiboy que indican que el viaje sigue activo.
 */
export const RAPIBOY_ACTIVE_STATUSES = new Set([10, 11, 12])

/**
 * Estados de Rapiboy que indican que el viaje terminó (éxito o cancelación).
 */
export const RAPIBOY_TERMINAL_STATUSES = new Set([13, 14])

/**
 * Mapeo inverso: OrderStatus de TakeasyGO → código de Rapiboy (si aplica).
 * Útil para debugging o para enviar el estado actual de vuelta a Rapiboy.
 */
export const TAKEASYGO_TO_RAPIBOY: Record<string, number | null> = {
  confirmed: 10,
  en_ruta: 11,
  arrived: 12,
  delivered: 13,
  cancelled: 14,
  pending: null,      // No tiene equivalente directo en Rapiboy
  preparing: null,    // Rapiboy no maneja la preparación
  ready: null,        // Rapiboy no maneja el estado "listo"
  open: null,
  awaiting_payment: null,
  awaiting_confirmation: null,
}

/**
 * Traduce un código de estado de Rapiboy a un OrderStatus de TakeasyGO.
 * Si el código no existe en el mapping, retorna null.
 */
export function mapRapiboyStatus(rapiboyEstado: number): string | null {
  return RAPIBOY_ESTADOS_MAP[rapiboyEstado] ?? null
}

/**
 * Verifica si un código de estado de Rapiboy es válido.
 */
export function isRapiboyStatusValid(estado: number): boolean {
  return estado in RAPIBOY_ESTADOS_MAP
}

/**
 * Verifica si un código de estado de Rapiboy indica que el viaje terminó.
 */
export function isRapiboyTerminalStatus(estado: number): boolean {
  return RAPIBOY_TERMINAL_STATUSES.has(estado)
}
