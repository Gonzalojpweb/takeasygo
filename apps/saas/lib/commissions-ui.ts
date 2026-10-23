// ============================================================================
// Comisiones — reglas de aviso y textos para el comercio (puro, sin React)
// ============================================================================
// · Cuándo "golpear" la pantalla (popup + sonido) y con qué insistencia.
// · Cómo explicar, con respeto y sin afirmar nada que el pedido no respalde,
//   qué es la comisión y quién la pagó.
// ============================================================================

import type { CommissionAlertLevel } from '@/lib/commission-weeks'
import type { FeeOrigin } from '@/lib/commission-tickets'

/** Cada cuánto vuelve a aparecer el aviso si sigue igual. */
export const POPUP_REPEAT_MS: Record<CommissionAlertLevel, number | null> = {
  vencida: 2 * 3_600_000, // cada 2 horas mientras siga vencida
  pendiente: 24 * 3_600_000, // una vez por día
  acumulada: null, // sin popup: solo informativo
  none: null,
}

export interface LastPopup {
  level: CommissionAlertLevel
  cents: number
  at: number
}

/**
 * ¿Mostrar el aviso ahora? Sí si nunca se mostró, si empeoró el nivel o
 * cambió el monto, o si pasó el intervalo de repetición del nivel.
 * Pendiente: recién desde el martes (día de pago, `notifyFrom`); antes solo
 * se ve la barra. Vencida: sin espera, hasta que se pague.
 */
export function shouldPopup(level: CommissionAlertLevel, cents: number, last: LastPopup | null, now: number, notifyFrom?: string | null): boolean {
  const repeat = POPUP_REPEAT_MS[level]
  if (repeat === null || cents <= 0) return false
  if (level === 'pendiente' && notifyFrom && now < new Date(notifyFrom).getTime()) return false
  if (!last) return true
  if (last.level !== level || last.cents !== cents) return true
  return now - last.at >= repeat
}

/**
 * Vistas donde el aviso de comisiones se muestra como cartel grande con el
 * total a pagar: el dashboard (/admin) y pedidos (/admin/orders...).
 */
export function isHeadlineView(pathname: string | null | undefined, tenantSlug: string): boolean {
  if (!pathname) return false
  const base = `/${tenantSlug}/admin`
  const path = pathname.replace(/\/+$/, '')
  return path === base || path === `${base}/orders` || path.startsWith(`${base}/orders/`)
}

export function pesos(cents: number): string {
  return `$${(cents / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export const WEEK_STATUS: Record<string, { label: string; tone: 'danger' | 'warning' | 'ok' | 'info' }> = {
  vencida: { label: 'Vencida', tone: 'danger' },
  pendiente: { label: 'Pendiente de pago', tone: 'warning' },
  en_curso: { label: 'En curso (acumulando)', tone: 'info' },
  pagada: { label: 'Pagada', tone: 'ok' },
}

/** Qué es la comisión, en general (encabezado de la página y del aviso). */
export const COMMISSION_EXPLAINER = [
  'Cuando un cliente paga un pedido de delivery por transferencia, te transfiere el total directo a tu cuenta: tus productos, el envío y la comisión de TakeasyGO.',
  'Esa comisión la paga siempre el cliente, como cargo por usar la app, por encima del precio de tus productos: no toca tu precio de carta ni tu margen. Solo la recibiste en tu cuenta y le corresponde a la plataforma.',
  'Como el dinero entra a tu cuenta, una vez por semana se suma lo que corresponde a la plataforma y lo transferís con el botón «Pagar», por MercadoPago.',
]

/** Explicación de un pedido según quién pagó la comisión. Solo afirma lo que el pedido respalda. */
export function originMessage(
  origin: FeeOrigin,
  amounts: { commissionCents: number; byCustomerCents: number | null; byRestaurantCents: number | null },
): { tone: 'ok' | 'warning' | 'info'; title: string; body: string } {
  switch (origin) {
    case 'customer':
      return {
        tone: 'ok',
        title: 'No sale de tu bolsillo',
        body: `Los ${pesos(amounts.commissionCents)} de comisión los pagó el cliente como cargo por usar la app, además del precio de tus productos. No tocan tu precio de carta ni tu margen: los recibiste en la transferencia y le corresponden a la plataforma.`,
      }
    // Solo pedidos ANTERIORES al 22/10/2026: desde entonces la comisión de
    // transferencia (delivery) se le cobra siempre entera al cliente.
    case 'shared':
      return {
        tone: 'warning',
        title: 'Pedido anterior al cargo completo al cliente',
        body: `En este pedido el cliente pagó ${pesos(amounts.byCustomerCents ?? 0)} de los ${pesos(amounts.commissionCents)} de comisión. Desde el 22/10/2026 el cliente paga siempre la comisión completa: no vuelve a pasar.`,
      }
    case 'restaurant':
      return {
        tone: 'warning',
        title: 'Pedido anterior al cargo al cliente',
        body: `En este pedido la comisión de ${pesos(amounts.commissionCents)} no se le recargó al cliente. Desde el 22/10/2026 la paga siempre el cliente como cargo por usar la app: no vuelve a pasar.`,
      }
    case 'unknown':
      return {
        tone: 'info',
        title: 'Pedido anterior al detalle de comisión',
        body: 'Este pedido es de antes de que guardáramos quién pagó la comisión, así que no podemos mostrar el desglose exacto. Los pedidos nuevos ya lo traen.',
      }
  }
}

/** Texto del aviso (popup y barra) según el nivel. */
/** Nivel con el que insiste el aviso: con transferencias apagadas, como vencida. */
export function popupLevel(a: { level: CommissionAlertLevel; transferLock?: { locked: boolean } }): CommissionAlertLevel {
  return a.transferLock?.locked ? 'vencida' : a.level
}

export function alertCopy(a: {
  level: CommissionAlertLevel
  overdue: { cents: number; weeks: number }
  pending: { cents: number; weeks: number; nextDueAt: string | null }
  accrued: { cents: number }
  transferLock?: { locked: boolean; owedCents: number; thresholdCents: number }
}): { title: string; body: string } | null {
  if (a.transferLock?.locked) {
    return {
      title: `Transferencias desactivadas: debés ${pesos(a.transferLock.owedCents)} de comisiones`,
      body: `Tu deuda de comisiones supera el tope de ${pesos(a.transferLock.thresholdCents)}. Hasta que la pagues, tus clientes no pueden pagarte por transferencia (ni delivery ni take away): pueden pagar con MercadoPago. Apenas se acredita el pago, las transferencias se vuelven a habilitar solas.`,
    }
  }
  if (a.level === 'vencida') {
    const total = a.overdue.cents + a.pending.cents
    return {
      title: `Tenés comisiones vencidas: ${pesos(a.overdue.cents)}`,
      body: `${a.overdue.weeks === 1 ? 'Una semana cerrada quedó' : `${a.overdue.weeks} semanas cerradas quedaron`} sin pagar.${a.pending.cents > 0 ? ` Con la semana pendiente, el total a pagar es ${pesos(total)}.` : ''} Revisá el detalle de cada pedido y pagá por MercadoPago en un minuto.`,
    }
  }
  if (a.level === 'pendiente') {
    // nextDueAt = miércoles 00:00 → el último día para pagar es el martes.
    const payDay = a.pending.nextDueAt
      ? new Date(new Date(a.pending.nextDueAt).getTime() - 1).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Argentina/Buenos_Aires' })
      : null
    return {
      title: `Tu liquidación semanal está lista: ${pesos(a.pending.cents)}`,
      body: `Son las comisiones de los pedidos por transferencia de la semana que cerró.${payDay ? ` El día de pago es el ${payDay}.` : ''} Adentro está el ticket de cada pedido explicado.`,
    }
  }
  if (a.level === 'acumulada') {
    return {
      title: `Comisión acumulada esta semana: ${pesos(a.accrued.cents)}`,
      body: 'Se va sumando con cada pedido por transferencia. Se liquida al cerrar la semana.',
    }
  }
  return null
}
