// ─── Rapiboy State Mapping ───────────────────────────────────────────────────
//
// Catálogo oficial GET /v1/LastMile/Estados (consultado por Rapiboy el
// 02/10/2026; la guía aclara que el número NO es una progresión garantizada).
// Corrección 20/11/2026: el mapeo anterior trataba 11 como «en camino al
// cliente» y 12 como «llegó», pero 11 = EnCaminoARetirar (va al local) y
// 12 = Retirado (salió con el pedido). El 15 no existe.
//
// Cada estado se traduce a una FASE del viaje. Solo algunas fases mueven el
// estado del pedido, y nunca hacia atrás (ver nextOrderStatus).

export type RapiboyTripPhase =
  | 'searching'     // procesando / buscando repartidor
  | 'to_pickup'     // repartidor asignado, yendo al local
  | 'at_store'      // repartidor en el local
  | 'picked_up'     // retiró el pedido, va al cliente
  | 'at_customer'   // en el domicilio del cliente
  | 'delivered'
  | 'failed'        // el envío no se pudo hacer (no entregado, rechazado, dirección errónea…)
  | 'cancelled'     // viaje cancelado o eliminado en Rapiboy

export const RAPIBOY_ESTADO_NOMBRE: Record<number, string> = {
  10: 'ProcesandoPedido',
  11: 'EnCaminoARetirar',
  12: 'Retirado',
  13: 'Entregado',
  14: 'Cancelado',
  16: 'NoEntregado',
  17: 'EnDeposito',
  20: 'Eliminado',
  22: 'EnProcesoDeDevolucion',
  23: 'DireccionErronea',
  24: 'Colectado',
  28: 'EnLocal',
  29: 'EnDomicilioCliente',
  30: 'Siniestrado',
  31: 'EnRevision',
  32: 'Devuelto',
  33: 'NoDevuelto',
  43: 'Rechazado',
}

const PHASE_BY_ESTADO: Record<number, RapiboyTripPhase> = {
  10: 'searching',
  11: 'to_pickup',
  28: 'at_store',
  12: 'picked_up',
  24: 'picked_up',
  29: 'at_customer',
  13: 'delivered',
  14: 'cancelled',
  20: 'cancelled',
  16: 'failed',
  22: 'failed',
  23: 'failed',
  30: 'failed',
  32: 'failed',
  33: 'failed',
  43: 'failed',
}

/** Fase del viaje para un estado de Rapiboy (null = desconocido o sin efecto, p. ej. EnRevision). */
export function rapiboyPhase(estado: number | null | undefined): RapiboyTripPhase | null {
  if (estado == null) return null
  return PHASE_BY_ESTADO[estado] ?? null
}

/** Estado del pedido de TakeasyGO que corresponde a cada fase (null = no cambia el pedido). */
const ORDER_STATUS_BY_PHASE: Record<RapiboyTripPhase, string | null> = {
  searching: null,
  to_pickup: null,
  at_store: null,
  picked_up: 'en_ruta',
  at_customer: 'arrived',
  delivered: 'delivered',
  // Un viaje fallido o cancelado NO cancela el pedido de comida (el cliente
  // pudo haber pagado): se avisa al local para que reasigne o resuelva.
  failed: null,
  cancelled: null,
}

const ORDER_RANK: Record<string, number> = { ready: 0, en_ruta: 1, arrived: 2, delivered: 3 }

/**
 * Próximo estado del pedido según la fase del viaje, sólo si avanza. Un aviso
 * atrasado (p. ej. «Retirado» después de «Entregado») no hace retroceder el
 * pedido, y un pedido cancelado o entregado no se toca.
 */
export function nextOrderStatus(current: string, phase: RapiboyTripPhase | null): string | null {
  if (!phase) return null
  const target = ORDER_STATUS_BY_PHASE[phase]
  if (!target) return null
  if (current === 'cancelled' || current === 'delivered') return null
  const from = ORDER_RANK[current]
  const to = ORDER_RANK[target]
  // Pedidos todavía en preparación: Rapiboy puede retirar antes de que el
  // local marque «listo»; se acepta el avance.
  if (from === undefined) return ['confirmed', 'preparing'].includes(current) ? target : null
  return to > from ? target : null
}

/** Fases en las que el viaje sigue vivo (sirve para decidir si consultar). */
export const RAPIBOY_ACTIVE_PHASES = new Set<RapiboyTripPhase>(['searching', 'to_pickup', 'at_store', 'picked_up', 'at_customer'])

export function isRapiboyTerminalPhase(phase: RapiboyTripPhase | null): boolean {
  return phase === 'delivered' || phase === 'failed' || phase === 'cancelled'
}

/** Rango de una fase, para no retroceder la fase guardada con avisos viejos. */
const PHASE_RANK: Record<RapiboyTripPhase, number> = {
  searching: 0, to_pickup: 1, at_store: 2, picked_up: 3, at_customer: 4,
  delivered: 9, failed: 9, cancelled: 9,
}

/** ¿La fase nueva es un avance respecto de la guardada? (terminal nunca se pisa) */
export function isPhaseAdvance(current: RapiboyTripPhase | null | undefined, next: RapiboyTripPhase): boolean {
  if (!current) return true
  if (isRapiboyTerminalPhase(current)) return false
  return PHASE_RANK[next] > PHASE_RANK[current]
}
