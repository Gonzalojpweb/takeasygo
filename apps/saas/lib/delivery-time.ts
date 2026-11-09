/**
 * delivery-time.ts
 *
 * Formateador psicológico de tiempos de entrega y retiro.
 *
 * PROBLEMA:
 * Cuando un restaurante acumula demoras (ej: base 20 min + 40 min de retraso = 60-80 min),
 * mostrar "Listo en ~80 min" o "Demora informada: +40 min" genera rechazo inmediato y
 * el cliente desiste de la compra.
 *
 * SOLUCIÓN (Patrón PedidosYa / Rappi / UberEats):
 * 1. Convertir el tiempo absoluto a un rango de hora reloj ("21:15 – 21:30") redondeado
 *    a múltiplos de 5 minutos, anclando mentalmente la llegada a la rutina horaria del cliente.
 * 2. Asignar un badge psicológico positivo ("Llega rápido", "En camino", "Preparando")
 *    con microcopy que valida el esfuerzo del local sin alarmar ("Preparación artesanal en curso").
 * 3. Adaptar la ventana según la duración:
 *      ≤ 25 min → ventana de 10 min (ej: 21:15 – 21:25)  → 🟢 Llega rápido
 *      ≤ 45 min → ventana de 15 min (ej: 21:15 – 21:30)  → 🕐 En camino
 *      ≤ 70 min → ventana de 20 min (ej: 21:30 – 21:50)  → ⏳ Preparando
 *      > 70 min → ventana de 25 min (ej: 21:40 – 22:05)  → ⏳ Preparando con alta demanda
 */

export interface DeliveryTimeRange {
  /** Rango horario legible, ej: "21:15 – 21:30" */
  label: string
  /** Hora de inicio formateada, ej: "21:15" */
  startTime: string
  /** Hora de fin formateada, ej: "21:30" */
  endTime: string
  /** Etiqueta de estado, ej: "Llega rápido" */
  badge: string
  /** Emoji para acompañar el badge */
  emoji: string
  /** Tono de color para badges y fondos */
  tone: 'green' | 'yellow' | 'amber'
  /** Subtítulo contextual que tranquiliza al cliente */
  subtitle: string
  /** Total de minutos calculados */
  totalMinutes: number
}

function padTime(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function timeLabel(date: Date): string {
  return padTime(date.getHours(), date.getMinutes())
}

function roundTo5Minutes(date: Date): Date {
  const ms = 5 * 60 * 1000
  return new Date(Math.round(date.getTime() / ms) * ms)
}

/**
 * Convierte los minutos totales (base + delay) en un rango de hora reloj
 * redondeado a múltiplos de 5 minutos con badges psicológicos.
 */
export function formatDeliveryTimeRange(
  totalMinutes: number,
  now: Date = new Date()
): DeliveryTimeRange {
  const safeMinutes = Math.max(5, Math.round(totalMinutes))
  const rawStart = new Date(now.getTime() + safeMinutes * 60_000)
  const start = roundTo5Minutes(rawStart)

  let windowMins: number
  let badge: string
  let emoji: string
  let tone: DeliveryTimeRange['tone']
  let subtitle: string

  if (safeMinutes <= 25) {
    windowMins = 10
    badge = 'Llega rápido'
    emoji = '⚡'
    tone = 'green'
    subtitle = 'Tu pedido sale enseguida'
  } else if (safeMinutes <= 45) {
    windowMins = 15
    badge = 'En camino pronto'
    emoji = '🕐'
    tone = 'yellow'
    subtitle = 'Preparando los ingredientes frescos'
  } else if (safeMinutes <= 70) {
    windowMins = 20
    badge = 'Preparando'
    emoji = '⏳'
    tone = 'amber'
    subtitle = 'Cocina trabajando en tu pedido'
  } else {
    windowMins = 25
    badge = 'Alta demanda'
    emoji = '⏳'
    tone = 'amber'
    subtitle = 'El restaurante está preparando tu pedido con dedicación'
  }

  const end = new Date(start.getTime() + windowMins * 60_000)
  const startTime = timeLabel(start)
  const endTime = timeLabel(end)

  return {
    label: `${startTime} – ${endTime}`,
    startTime,
    endTime,
    badge,
    emoji,
    tone,
    subtitle,
    totalMinutes: safeMinutes,
  }
}

/**
 * Formateo para cards, listas y badges en Explore / Home.
 * Si es rápido (≤ 25 min) puede mostrar "~20 min", pero ante cualquier
 * demora o tiempo prolongado (> 25 min) pasa automáticamente a rango
 * de hora reloj ("21:15 – 21:30") para no frenar la conversión.
 */
export function formatDeliveryTimeShort(
  totalMinutes: number,
  now: Date = new Date()
): string {
  if (totalMinutes <= 25) {
    return `~${totalMinutes} min`
  }
  const { label } = formatDeliveryTimeRange(totalMinutes, now)
  return label
}

/**
 * Formateo para la pantalla de Tracking cuando ya existe una fecha estimada
 * de entrega o preparación (effectiveEstimatedReadyAt).
 */
export function formatTargetTimeRange(
  targetDateOrIso: Date | string,
  now: Date = new Date()
): DeliveryTimeRange {
  const target = typeof targetDateOrIso === 'string' ? new Date(targetDateOrIso) : targetDateOrIso
  const diffMs = target.getTime() - now.getTime()
  const remainingMinutes = Math.ceil(diffMs / 60_000)

  if (remainingMinutes <= 3) {
    const start = now
    const end = new Date(now.getTime() + 10 * 60_000)
    const startTime = timeLabel(start)
    const endTime = timeLabel(end)
    return {
      label: `${startTime} – ${endTime}`,
      startTime,
      endTime,
      badge: 'Llegando',
      emoji: '🛵',
      tone: 'green',
      subtitle: '¡Tu pedido está por llegar!',
      totalMinutes: Math.max(0, remainingMinutes),
    }
  }

  return formatDeliveryTimeRange(remainingMinutes, now)
}
