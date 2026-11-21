// Visor de stories (20/11/2026): reloj que acumula al pausar, gestos
// (mantener pausa sin navegar, deslizar, toque), «visto» en localStorage y
// cliente de métricas (dedup por sesión, filtrado, lotes).
// Sin jsdom en el repo (y sin sumar librerías): se prueba la lógica pura.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { StoryClock, classifyRelease, tapDirection, HOLD_MS } from '@/components/menu/useStoryPlayer'

class MemoryStorage {
  private m = new Map<string, string>()
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null }
  setItem(k: string, v: string) { this.m.set(k, String(v)) }
  removeItem(k: string) { this.m.delete(k) }
  clear() { this.m.clear() }
}

describe('StoryClock', () => {
  it('reanudar conserva el progreso (antes volvía a cero)', () => {
    let t = 0
    const c = new StoryClock(() => t)
    t = 3000
    c.pause()
    t = 10_000 // tiempo en pausa: no cuenta
    expect(c.read()).toBe(3000)
    c.resume()
    t = 12_000
    expect(c.read()).toBe(5000)
  })
  it('reset a cero, corriendo o pausado; pausar dos veces no duplica', () => {
    let t = 0
    const c = new StoryClock(() => t)
    t = 1000
    c.pause(); c.pause()
    expect(c.read()).toBe(1000)
    c.reset(false)
    t = 5000
    expect(c.read()).toBe(0)
    expect(c.running).toBe(false)
    c.reset(true)
    t = 5500
    expect(c.read()).toBe(500)
  })
})

describe('gestos', () => {
  it('mantener apretado reanuda al soltar y no navega', () => {
    expect(HOLD_MS).toBe(200)
    expect(classifyRelease(100, 100, true)).toBe('resume')
    expect(classifyRelease(100, 300, true)).toBe('resume') // aunque se haya movido
  })
  it('deslizar > 50 px navega; menos lo resuelve el toque', () => {
    expect(classifyRelease(300, 100, false)).toBe('next')
    expect(classifyRelease(100, 300, false)).toBe('prev')
    expect(classifyRelease(100, 140, false)).toBe('none')
    expect(classifyRelease(null, 140, false)).toBe('none')
  })
  it('toque: 30 % izquierdo atrás, resto adelante', () => {
    expect(tapDirection(29, 100)).toBe('prev')
    expect(tapDirection(31, 100)).toBe('next')
  })
})

describe('stories vistas (localStorage)', () => {
  beforeEach(() => {
    vi.resetModules()
    ;(globalThis as any).localStorage = new MemoryStorage()
  })

  it('marca, detecta edición posterior y primera sin ver', async () => {
    const seen = await import('@/lib/story-seen')
    const stories = [{ _id: 'a', updatedAt: '2026-11-01T00:00:00Z' }, { _id: 'b' }, { _id: 'c' }]
    expect(seen.allStoriesSeen(stories)).toBe(false)
    seen.markStorySeen('a', Date.parse('2026-11-20T00:00:00Z'))
    expect(seen.firstUnseenIndex(stories)).toBe(1)
    seen.markStorySeen('b'); seen.markStorySeen('c')
    expect(seen.allStoriesSeen(stories)).toBe(true)
    expect(seen.firstUnseenIndex(stories)).toBe(0) // todas vistas → arranca de la primera
    // editada después de verla → vuelve a «sin ver»
    expect(seen.isStorySeen('a', '2026-11-21T00:00:00Z')).toBe(false)
  })

  it('purga: más de 30 días fuera y máximo 200 entradas', async () => {
    const { pruneSeen, STORY_SEEN_MAX } = await import('@/lib/story-seen')
    const now = Date.parse('2026-11-20T00:00:00Z')
    const map: Record<string, number> = { viejo: now - 31 * 86_400_000 }
    for (let i = 0; i < 250; i++) map[`s${i}`] = now - i * 1000
    const out = pruneSeen(map, now)
    expect(Object.keys(out)).toHaveLength(STORY_SEEN_MAX)
    expect(out.viejo).toBeUndefined()
    expect(out.s0).toBe(now)
  })

  it('solo guarda IDs y fechas; si el almacenamiento falla, no rompe y todo cuenta como no visto', async () => {
    const seen = await import('@/lib/story-seen')
    seen.markStorySeen('abc', 123)
    expect(JSON.parse((globalThis as any).localStorage.getItem(seen.STORY_SEEN_KEY))).toEqual({ abc: 123 })
    ;(globalThis as any).localStorage = { getItem() { throw new Error('bloqueado') }, setItem() { throw new Error('bloqueado') } }
    expect(() => seen.markStorySeen('x')).not.toThrow()
    expect(seen.isStorySeen('abc')).toBe(false)
    expect(seen.allStoriesSeen([{ _id: 'abc' }])).toBe(false)
  })
})

describe('cliente de métricas (lib/placement-track)', () => {
  const PIECE = 'a'.repeat(24)
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    fetchMock = vi.fn().mockResolvedValue({ ok: true })
    ;(globalThis as any).window = globalThis
    ;(globalThis as any).addEventListener ??= () => {}
    ;(globalThis as any).localStorage = new MemoryStorage()
    ;(globalThis as any).sessionStorage = new MemoryStorage()
    ;(globalThis as any).document = { addEventListener() {}, visibilityState: 'visible' }
    ;(globalThis as any).fetch = fetchMock
  })

  const sent = () => fetchMock.mock.calls.flatMap((c) => JSON.parse(c[1].body).events)

  it('agrupa en lotes, descarta piezas inválidas y no manda datos de más', async () => {
    const t = await import('@/lib/placement-track')
    t.trackPlacement({ type: 'impression', placement: 'menu_promo_card', kind: 'promotion', pieceId: PIECE, tenantSlug: 'x', locationId: 'no-es-id' })
    t.trackPlacement({ type: 'impression', placement: 'menu_promo_card', kind: 'promotion', pieceId: 'malo' })
    t.trackPlacement({ type: 'impression', placement: 'menu_story', kind: 'entry', pieceId: PIECE, tenantSlug: 'x' })
    expect(fetchMock).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(Object.keys(body).sort()).toEqual(['events', 'sid'])
    expect(body.events).toEqual([
      { type: 'impression', placement: 'menu_promo_card', kind: 'promotion', pieceId: PIECE, tenantSlug: 'x' },
      { type: 'impression', placement: 'menu_story', kind: 'entry', tenantSlug: 'x' },
    ])
  })

  it('una vez por pieza, superficie y sesión', async () => {
    const t = await import('@/lib/placement-track')
    const ev = { type: 'impression' as const, placement: 'menu_promo_card' as const, kind: 'promotion' as const, pieceId: PIECE }
    t.trackPlacementOnce(ev)
    t.trackPlacementOnce(ev)
    t.trackPlacementOnce({ ...ev, placement: 'explore_promo_card' })
    t.flushPlacements()
    expect(sent()).toHaveLength(2)
  })

  it('a los 20 eventos manda sin esperar', async () => {
    const t = await import('@/lib/placement-track')
    for (let i = 0; i < 20; i++) t.trackPlacement({ type: 'cta_tap', placement: 'menu_promo_card', kind: 'promotion', pieceId: PIECE, action: 'add' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(sent()).toHaveLength(20)
  })
})
