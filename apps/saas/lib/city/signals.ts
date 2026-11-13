// ── Señales de la ciudad (TGO Living City) ──────────────────────────────────
//
// Lógica PURA, compartida entre el servidor (/api/explore/nearby arma las
// señales crudas) y la app (/app las traduce a «lenguaje de ciudad»).
//
// Regla del sistema (Sprint 2 + Living City System):
//   · una card muestra como máximo 1 estado operativo + 1 oportunidad;
//   · el resto de los datos (pagos, modalidad, salón, club) son «gadgets»:
//     íconos de línea, discretos, que informan sin competir con el pin;
//   · nunca se habla en lenguaje técnico: `prepTime=11` → «Listo en 11 min».
//
// Nada de este archivo toca la base ni el navegador: se puede testear solo.

export type SalonLevel = 'calm' | 'moving' | 'busy' | 'full'
export type PaceLevel = 'calm' | 'steady' | 'busy'

/** Hechos crudos que el servidor calcula por sede. Sin datos personales. */
export interface CitySignals {
  payments: { mp: boolean; cash: boolean; transfer: boolean }
  modes: { takeaway: boolean; delivery: boolean; dineIn: boolean }
  /** Ocupación del salón según las mesas del POS. null = sin POS en uso. */
  salon: { level: SalonLevel; freeTables: number } | null
  /** Ritmo de pedidos de la última hora. null = sin dato. */
  pace: PaceLevel | null
  /** Demora anunciada por el local (minutos extra). null = sin demora. */
  delayMinutes: number | null
  /** Minutos que faltan para el cierre del turno actual. null = cerrado/sin horario. */
  minutesToClose: number | null
  /** Minutos desde que abrió el turno actual. null = cerrado/sin horario. */
  minutesSinceOpen: number | null
  /** Próxima apertura «HH:MM» cuando está cerrado. */
  opensAt: string | null
  reservations: boolean
  club: { name: string | null } | null
  promo: { title: string | null; count: number } | null
}

// ── Cálculos del servidor ───────────────────────────────────────────────────

export interface TableCounts {
  free: number
  occupied: number
  reserved: number
  needsAttention: number
  /** Último movimiento de cualquier mesa de la sede. */
  lastUpdate: Date | null
}

/** Mínimo de mesas para considerar que hay un salón que informar. */
export const SALON_MIN_TABLES = 3
/** Sin movimiento de mesas en este lapso = el POS no se está usando hoy. */
export const SALON_STALE_HOURS = 14

export function salonFromTables(
  counts: TableCounts | null | undefined,
  now: Date = new Date()
): CitySignals['salon'] {
  if (!counts) return null
  const busyTables = counts.occupied + counts.reserved + counts.needsAttention
  const total = counts.free + busyTables
  if (total < SALON_MIN_TABLES) return null
  if (!counts.lastUpdate) return null
  const staleMs = SALON_STALE_HOURS * 60 * 60 * 1000
  if (now.getTime() - new Date(counts.lastUpdate).getTime() > staleMs) return null

  const ratio = busyTables / total
  const level: SalonLevel =
    counts.free === 0 ? 'full' : ratio >= 0.7 ? 'busy' : ratio >= 0.35 ? 'moving' : 'calm'
  return { level, freeTables: counts.free }
}

export function paceFromOrders(ordersLastHour: number | null | undefined): PaceLevel | null {
  // Sin pedidos en la hora no hay ritmo que contar: mejor callar que inventar.
  if (ordersLastHour == null || ordersLastHour < 1) return null
  if (ordersLastHour >= 6) return 'busy'
  if (ordersLastHour >= 3) return 'steady'
  return 'calm'
}

type Slot = { days: number[]; open: string; close: string }

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/**
 * Ventana del turno actual a partir de los horarios de servicio.
 * `now` es la hora LOCAL del local ({ day: 0=Dom, minutes: hh*60+mm }).
 */
export function openWindow(
  slots: Slot[] | null | undefined,
  now: { day: number; minutes: number }
): { minutesToClose: number | null; minutesSinceOpen: number | null; opensAt: string | null } {
  const empty = { minutesToClose: null, minutesSinceOpen: null, opensAt: null }
  if (!slots?.length) return empty

  let best: { toClose: number; sinceOpen: number } | null = null
  for (const slot of slots) {
    if (!slot.days?.includes(now.day)) continue
    const open = toMinutes(slot.open)
    const close = toMinutes(slot.close)
    if (now.minutes >= open && now.minutes <= close) {
      const candidate = { toClose: close - now.minutes, sinceOpen: now.minutes - open }
      // Con turnos solapados gana el que cierra más tarde.
      if (!best || candidate.toClose > best.toClose) best = candidate
    }
  }
  if (best) {
    return { minutesToClose: best.toClose, minutesSinceOpen: best.sinceOpen, opensAt: null }
  }

  // Cerrado: buscar la próxima apertura dentro de la semana.
  for (let offset = 0; offset < 7; offset++) {
    const day = (now.day + offset) % 7
    const openings = slots
      .filter(s => s.days?.includes(day))
      .map(s => s.open)
      .filter(open => offset > 0 || toMinutes(open) > now.minutes)
      .sort((a, b) => toMinutes(a) - toMinutes(b))
    if (openings.length > 0) {
      return { minutesToClose: null, minutesSinceOpen: null, opensAt: openings[0] }
    }
  }
  return empty
}

// ── Cercanía (Ciudad de los 15 minutos) ─────────────────────────────────────

/** Paso urbano tranquilo: 80 m por minuto (~4,8 km/h). */
export const WALK_M_PER_MIN = 80
export const CITY_15_MINUTES = 15
export const CITY_15_RADIUS_M = WALK_M_PER_MIN * CITY_15_MINUTES // 1.200 m

export function walkMinutes(distanceM: number | null | undefined): number | null {
  if (distanceM == null || !Number.isFinite(distanceM)) return null
  return Math.max(1, Math.round(distanceM / WALK_M_PER_MIN))
}

export function isWithin15(distanceM: number | null | undefined): boolean {
  return distanceM != null && distanceM <= CITY_15_RADIUS_M
}

/** «A la vuelta», «6 min a pie», «2,4 km». El tiempo a pie manda sobre los metros. */
export function proximityLabel(distanceM: number | null | undefined): string {
  if (distanceM == null || !Number.isFinite(distanceM)) return ''
  if (distanceM < 150) return 'A la vuelta'
  const minutes = walkMinutes(distanceM)!
  if (minutes <= 20) return `${minutes} min a pie`
  const km = distanceM / 1000
  return `${km.toFixed(1).replace('.', ',')} km`
}

/** Distancia en metros entre dos puntos (haversine). */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6_371_000
  const rad = (deg: number) => (deg * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(h)))
}

// ── Lenguaje de ciudad ──────────────────────────────────────────────────────

/** Lo mínimo que necesita la voz de la ciudad de un local. */
export interface CityPlace {
  type: 'network' | 'listed'
  isOpenNow: boolean | null
  isOperational: boolean
  acceptsOrders: boolean
  estimatedPickupTime: number
  isNew?: boolean
  hasWinkOffer?: boolean
  loyaltyInfo?: {
    hasClub: boolean
    clubName?: string | null
    hasActivePromo: boolean
  }
  signals?: CitySignals | null
}

/**
 * Tono del estado. Cada tono mapea a UN color semántico del sistema:
 * live=actividad · calm=actividad suave · busy=atención · warn=atención fuerte
 * · rest=inactivo · info=neutro.
 */
export type StatusTone = 'live' | 'calm' | 'busy' | 'warn' | 'rest' | 'info'

export interface CityStatus {
  tone: StatusTone
  /** Frase completa para cards y ficha. */
  text: string
  /** Versión de 1–2 palabras para la etiqueta del pin. */
  short: string
}

export interface CityOpportunity {
  kind: 'promo' | 'club' | 'new'
  text: string
  short: string
}

export type PinExpression = 'happy' | 'sleepy' | 'wink'

/** ¿El local está despierto (operando y tomando pedidos ahora)? */
export function isAwake(p: CityPlace): boolean {
  return (
    p.type === 'network' &&
    p.isOperational !== false &&
    p.acceptsOrders !== false &&
    p.isOpenNow !== false
  )
}

/**
 * ¿Tiene una oferta activa? Con señales manda `signals.promo` (solo promos de
 * venta); sin señales se usa el dato histórico.
 */
export function hasPromo(p: CityPlace): boolean {
  if (p.signals) return !!p.signals.promo
  return !!(p.hasWinkOffer || p.loyaltyInfo?.hasActivePromo)
}

export function hasClub(p: CityPlace): boolean {
  return !!(p.signals?.club || p.loyaltyInfo?.hasClub)
}

/** Las tres caras del Living City System. Nunca una cuarta. */
export function pinExpression(p: CityPlace): PinExpression {
  if (!isAwake(p)) return 'sleepy'
  return hasPromo(p) ? 'wink' : 'happy'
}

/** Estado operativo: UNA frase, en presente, la más relevante de este minuto. */
export function cityStatus(p: CityPlace): CityStatus {
  const s = p.signals ?? null

  if (p.type === 'listed') {
    if (p.isOpenNow === true) return { tone: 'info', text: 'Abierto ahora', short: 'Abierto' }
    if (p.isOpenNow === false) return { tone: 'rest', text: 'Cerrado ahora', short: 'Cerrado' }
    return { tone: 'info', text: 'En el directorio del barrio', short: '' }
  }

  if (p.isOperational === false) {
    return { tone: 'info', text: 'Por ahora, solo la carta', short: 'Carta' }
  }
  if (p.isOpenNow === false) {
    return s?.opensAt
      ? { tone: 'rest', text: `Descansando · abre ${s.opensAt}`, short: `Abre ${s.opensAt}` }
      : { tone: 'rest', text: 'Descansando', short: 'Cerrado' }
  }
  if (p.acceptsOrders === false) {
    return { tone: 'rest', text: 'No está tomando pedidos ahora', short: 'En pausa' }
  }

  const minutes = Math.max(1, Math.round(p.estimatedPickupTime || 0))

  if (s?.salon?.level === 'full') {
    return s.modes.takeaway
      ? { tone: 'warn', text: 'Salón lleno · podés pedir para retirar', short: 'Lleno' }
      : { tone: 'warn', text: 'Salón lleno ahora', short: 'Lleno' }
  }
  if (s?.delayMinutes && s.delayMinutes > 0) {
    return {
      tone: 'busy',
      text: `Con demora · unos ${minutes + s.delayMinutes} min`,
      short: `+${s.delayMinutes} min`,
    }
  }
  if (s?.minutesToClose != null && s.minutesToClose <= 30) {
    return {
      tone: 'busy',
      text: s.minutesToClose <= 1 ? 'Está cerrando' : `Cierra en ${s.minutesToClose} min`,
      short: 'Cierra ya',
    }
  }
  if (s?.minutesSinceOpen != null && s.minutesSinceOpen <= 30) {
    return { tone: 'live', text: 'Acaba de abrir', short: 'Recién abre' }
  }
  if (s?.pace === 'busy' || s?.salon?.level === 'busy') {
    return { tone: 'busy', text: `Mucho movimiento · listo en ${minutes} min`, short: `${minutes} min` }
  }
  if (s?.pace === 'calm' && s?.salon?.level !== 'moving') {
    return { tone: 'calm', text: `Está tranquilo · listo en ${minutes} min`, short: `${minutes} min` }
  }
  return { tone: 'live', text: `Preparando pedidos en ${minutes} min`, short: `${minutes} min` }
}

/** Oportunidad: como máximo UNA. Promo > recién llegó > club. */
export function cityOpportunity(p: CityPlace): CityOpportunity | null {
  if (p.type !== 'network') return null
  const s = p.signals ?? null

  if (hasPromo(p)) {
    const title = s?.promo?.title?.trim()
    const extra = s?.promo && s.promo.count > 1 ? ` +${s.promo.count - 1}` : ''
    return title
      ? { kind: 'promo', text: `${title}${extra}`, short: 'Promo' }
      : { kind: 'promo', text: 'Hoy hay promo', short: 'Promo' }
  }
  if (p.isNew) {
    return { kind: 'new', text: 'Recién llegó al barrio', short: 'Nuevo' }
  }
  if (hasClub(p)) {
    const name = s?.club?.name ?? p.loyaltyInfo?.clubName ?? null
    return { kind: 'club', text: name ? `Sumás en ${name}` : 'Sumás en su club', short: 'Club' }
  }
  return null
}

export const SALON_LABEL: Record<SalonLevel, string> = {
  calm: 'Hay lugar en el salón',
  moving: 'Salón con movimiento',
  busy: 'Salón casi lleno',
  full: 'Salón lleno',
}

/** 1–4: cuántos segmentos del medidor de salón se encienden. */
export const SALON_FILL: Record<SalonLevel, number> = { calm: 1, moving: 2, busy: 3, full: 4 }

// ── Capas del mapa (filtros) ────────────────────────────────────────────────

export type CityLayer = 'open' | 'promo' | 'club' | 'delivery' | 'salon' | 'walk15' | 'cash'

export const CITY_LAYERS: Array<{ id: CityLayer; label: string }> = [
  { id: 'open', label: 'Abiertos' },
  { id: 'walk15', label: 'A 15 min' },
  { id: 'promo', label: 'Promos' },
  { id: 'club', label: 'Club' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'salon', label: 'Con lugar' },
  { id: 'cash', label: 'Efectivo' },
]

export function matchesLayer(
  p: CityPlace & { distanceM: number | null; deliveryEnabled?: boolean; orderModes?: string[] },
  layer: CityLayer
): boolean {
  switch (layer) {
    case 'open':
      return p.type === 'network' ? isAwake(p) : p.isOpenNow === true
    case 'promo':
      return hasPromo(p)
    case 'club':
      return hasClub(p)
    case 'delivery':
      return p.signals?.modes.delivery ?? (p.deliveryEnabled === true)
    case 'salon':
      return !!p.signals?.salon && p.signals.salon.level !== 'full' && isAwake(p)
    case 'walk15':
      return isWithin15(p.distanceM)
    case 'cash':
      return p.signals?.payments.cash === true
  }
}

// ── La ciudad en una frase ──────────────────────────────────────────────────

export type DayMoment = 'morning' | 'noon' | 'afternoon' | 'evening' | 'late'

export function dayMoment(hour: number): DayMoment {
  if (hour >= 6 && hour < 11) return 'morning'
  if (hour >= 11 && hour < 15) return 'noon'
  if (hour >= 15 && hour < 19) return 'afternoon'
  if (hour >= 19 && hour < 24) return 'evening'
  return 'late'
}

export const MOMENT_GREETING: Record<DayMoment, string> = {
  morning: 'Buen día',
  noon: 'Buen mediodía',
  afternoon: 'Buenas tardes',
  evening: 'Buenas noches',
  late: 'Buenas noches',
}

const MOMENT_PLAN: Record<DayMoment, string> = {
  morning: 'para desayunar',
  noon: 'para almorzar',
  afternoon: 'para merendar',
  evening: 'para esta noche',
  late: 'a esta hora',
}

export interface CityPulse {
  open: number
  promos: number
  within15: number
  salonFree: number
  clubs: number
  busy: number
}

type PulsePlace = CityPlace & { distanceM: number | null }

export function cityPulse(places: PulsePlace[]): CityPulse {
  let open = 0, promos = 0, within15 = 0, salonFree = 0, clubs = 0, busy = 0
  for (const p of places) {
    const awake = p.type === 'network' ? isAwake(p) : p.isOpenNow === true
    if (awake) open++
    if (awake && isWithin15(p.distanceM)) within15++
    if (hasPromo(p)) promos++
    if (hasClub(p)) clubs++
    if (awake && p.signals?.salon && p.signals.salon.level !== 'full') salonFree++
    if (awake && (p.signals?.pace === 'busy' || p.signals?.salon?.level === 'busy' || p.signals?.salon?.level === 'full')) busy++
  }
  return { open, promos, within15, salonFree, clubs, busy }
}

/** Titular de la ciudad: contexto, no marketing. */
export function cityHeadline(pulse: CityPulse, hour: number): string {
  const moment = dayMoment(hour)
  if (pulse.open === 0) return 'La ciudad descansa por ahora'
  const lugares = pulse.open === 1 ? '1 lugar abierto' : `${pulse.open} lugares abiertos`
  if (pulse.busy >= 3 || pulse.busy / pulse.open >= 0.5) return `La ciudad está movida · ${lugares}`
  if (pulse.within15 > 0) {
    const cerca = pulse.within15 === 1 ? '1 lugar' : `${pulse.within15} lugares`
    return `${cerca} ${MOMENT_PLAN[moment]} a 15 min a pie`
  }
  return `${lugares} ${MOMENT_PLAN[moment]}`
}

export interface CityFeedItem {
  id: string
  placeId: string
  kind: 'promo' | 'opened' | 'closing' | 'full' | 'new' | 'calm' | 'busy'
  text: string
}

/**
 * Novedades de la ciudad para el ticker del mapa. Solo hechos reales de este
 * minuto; prioridad: promos, aperturas, cierres, salón, nuevos, ritmo.
 */
export function cityFeed(
  places: Array<PulsePlace & { id: string; name: string }>,
  limit = 8
): CityFeedItem[] {
  const items: Array<CityFeedItem & { rank: number }> = []
  for (const p of places) {
    if (p.type !== 'network') continue
    const s = p.signals ?? null
    const awake = isAwake(p)
    const push = (kind: CityFeedItem['kind'], text: string, rank: number) =>
      items.push({ id: `${kind}-${p.id}`, placeId: p.id, kind, text, rank })

    if (awake && hasPromo(p)) {
      const title = s?.promo?.title?.trim()
      push('promo', title ? `${p.name}: ${title}` : `${p.name} tiene promo hoy`, 0)
    }
    if (awake && s?.minutesSinceOpen != null && s.minutesSinceOpen <= 30) {
      push('opened', `${p.name} acaba de abrir`, 1)
    }
    if (awake && s?.minutesToClose != null && s.minutesToClose <= 30) {
      push('closing', `${p.name} cierra en ${Math.max(1, s.minutesToClose)} min`, 2)
    }
    if (awake && s?.salon?.level === 'full') {
      push('full', `Salón lleno en ${p.name}`, 3)
    } else if (awake && s?.salon?.level === 'calm') {
      push('calm', `Hay lugar en ${p.name}`, 5)
    }
    if (p.isNew) push('new', `${p.name} recién llegó al barrio`, 4)
    if (awake && s?.pace === 'busy') push('busy', `Mucho movimiento en ${p.name}`, 6)
  }
  return items
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map(item => ({ id: item.id, placeId: item.placeId, kind: item.kind, text: item.text }))
}
