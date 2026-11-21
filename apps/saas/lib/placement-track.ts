// ============================================================================
// lib/placement-track.ts — métricas de stories y promociones (cliente)
// ============================================================================
// Cola con envío por lotes a /api/placements/track (cada 1 s o a los 20
// eventos; keepalive al salir de la página). Mismo patrón que lib/track.ts,
// sin depender del slug del comercio (las stories son globales y Descubrí no
// tiene comercio en la URL).
//
// Sesión: la anónima de lib/events (UUID al azar, 30 min sin actividad). Solo
// viaja para la deduplicación del servidor, que guarda un hash.
// Deduplicación en el cliente: impresión, vista y completada, 1 por pieza,
// superficie y sesión (sessionStorage).
// ============================================================================

import { getSessionId } from './events'

export type Placement =
  | 'menu_story' | 'app_story' | 'home_banner'
  | 'menu_promo_card' | 'menu_promo_story' | 'explore_promo_card'
export type PieceKind = 'app_story' | 'promotion' | 'entry'
export type PlacementEventType = 'impression' | 'entry_open' | 'story_view' | 'story_complete' | 'cta_tap' | 'exit'
export type TapAction = 'add' | 'detail' | 'loyalty' | 'link' | 'card' | 'open'
export type ExitReason = 'close' | 'skip' | 'swipe' | 'background'

export interface PlacementEvent {
  type: PlacementEventType
  placement: Placement
  kind: PieceKind
  pieceId?: string | null
  tenantSlug?: string | null
  locationId?: string | null
  action?: TapAction
  reason?: ExitReason
  index?: number
}

const OID = /^[a-f0-9]{24}$/i
const MAX_BATCH = 20
const FLUSH_MS = 1000
const ENDPOINT = '/api/placements/track'

const queue: PlacementEvent[] = []
let timer: ReturnType<typeof setTimeout> | null = null
let bound = false

function clean(ev: PlacementEvent): PlacementEvent | null {
  if (ev.kind !== 'entry' && !(ev.pieceId && OID.test(ev.pieceId))) return null
  const out: PlacementEvent = { type: ev.type, placement: ev.placement, kind: ev.kind }
  if (ev.kind !== 'entry') out.pieceId = ev.pieceId
  if (ev.tenantSlug) out.tenantSlug = ev.tenantSlug
  if (ev.locationId && OID.test(ev.locationId)) out.locationId = ev.locationId
  if (ev.action) out.action = ev.action
  if (ev.reason) out.reason = ev.reason
  if (typeof ev.index === 'number') out.index = Math.max(0, Math.min(99, Math.floor(ev.index)))
  return out
}

function send(events: PlacementEvent[], keepalive: boolean) {
  const sid = getSessionId()
  if (!sid || events.length === 0) return
  try {
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sid, events }),
      keepalive,
    }).catch(() => {})
  } catch { /* sin red: se pierde, no es crítico */ }
}

export function flushPlacements(keepalive = false): void {
  if (timer) { clearTimeout(timer); timer = null }
  while (queue.length) send(queue.splice(0, MAX_BATCH), keepalive)
}

function bind() {
  if (bound || typeof window === 'undefined') return
  bound = true
  window.addEventListener('pagehide', () => flushPlacements(true))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPlacements(true)
  })
}

export function trackPlacement(ev: PlacementEvent): void {
  if (typeof window === 'undefined') return
  const c = clean(ev)
  if (!c) return
  bind()
  queue.push(c)
  if (queue.length >= MAX_BATCH) flushPlacements()
  else if (!timer) timer = setTimeout(() => flushPlacements(), FLUSH_MS)
}

/** Una vez por pieza, superficie y sesión (impresión, vista, completada). */
export function trackPlacementOnce(ev: PlacementEvent): void {
  if (typeof window === 'undefined') return
  const sid = getSessionId()
  const key = `tgo_pl_${ev.type}_${ev.placement}_${ev.pieceId ?? 'entry'}`
  try {
    if (sessionStorage.getItem(key) === sid) return
    sessionStorage.setItem(key, sid)
  } catch { /* sessionStorage bloqueado: dedup queda en el servidor */ }
  trackPlacement(ev)
}

/** Para tests: vacía la cola sin enviar. */
export function __resetPlacementQueue(): void {
  queue.length = 0
  if (timer) { clearTimeout(timer); timer = null }
}
