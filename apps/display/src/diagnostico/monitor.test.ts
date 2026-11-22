import { describe, it, expect } from 'vitest'
import { classifyEvents, summarizeSoak, soakVerdict, formatCut, type PlaybackEvent, type SoakMinute } from './monitor'

const ev = (t: number, type: PlaybackEvent['type']): PlaybackEvent => ({ t, type })

describe('clasificación de cortes', () => {
  it('waiting durante el salto de la prueba → «salto», no cuenta como corte del equipo', () => {
    // Caso Motorola 720p: salto al 50 % que tarda ~1020 ms.
    const s = classifyEvents([ev(0, 'playing'), ev(7500, 'seeking'), ev(7510, 'waiting'), ev(8530, 'seeked'), ev(8540, 'playing')], 15_000)
    expect(s.device).toBe(0)
    expect(s.bySeek).toBe(1)
    expect(s.cuts[0]).toEqual({ at: 7510, kind: 'waiting', ms: 1030, cause: 'salto' })
  })

  it('waiting en el segundo siguiente al salto también es del salto; después, del equipo', () => {
    const s = classifyEvents([ev(1000, 'seeking'), ev(1200, 'seeked'), ev(1900, 'waiting'), ev(2100, 'playing'), ev(5000, 'waiting'), ev(5800, 'playing')], 10_000)
    expect(s.cuts.map((c) => c.cause)).toEqual(['salto', 'equipo'])
    expect(s.device).toBe(1)
    expect(s.deviceMs).toBe(800)
  })

  it('con la pantalla oculta (o al volver) → «pantalla oculta»', () => {
    const s = classifyEvents([ev(1000, 'hidden'), ev(2000, 'waiting'), ev(4000, 'visible'), ev(4300, 'waiting'), ev(4600, 'playing')], 9000)
    expect(s.cuts.map((c) => c.cause)).toEqual(['pantalla_oculta', 'pantalla_oculta'])
    expect(s.byHidden).toBe(2)
    expect(s.device).toBe(0)
  })

  it('stalled se informa aparte y una pausa real se cuenta como pausa', () => {
    const s = classifyEvents([ev(3000, 'stalled'), ev(6000, 'pause')], 9000)
    expect(s.stalled).toBe(1)
    expect(s.device).toBe(0)
    expect(s.pauses).toBe(1)
    expect(s.cuts[0].ms).toBeNull()
  })

  it('un waiting que nunca se recupera dura hasta el final', () => {
    const s = classifyEvents([ev(2000, 'waiting')], 6000)
    expect(s.deviceMs).toBe(4000)
  })

  it('formato para el informe', () => {
    expect(formatCut({ at: 7510, kind: 'waiting', ms: 1030, cause: 'salto' })).toBe('+7,5 s waiting 1030 ms → salto de la prueba')
  })
})

describe('resumen de la prueba larga', () => {
  const minute = (min: number, extra: Partial<SoakMinute> = {}): SoakMinute => ({
    min, memMB: 50, dropped: 0, frames: 1800, cuts: 0, cutMs: 0, frozen: false, hidden: false, ...extra,
  })

  it('2 h limpias → OK; métricas por hora comparables entre equipos', () => {
    const tl = Array.from({ length: 120 }, (_, i) => minute(i + 1, { memMB: 50 + i * 0.1 }))
    const s = summarizeSoak(tl, 120)
    expect(s.minutes).toBe(120)
    expect(s.cutsPerHour).toBe(0)
    expect(s.droppedPct).toBe(0)
    expect(s.memSlopeMBh).toBeCloseTo(6, 0)
    expect(soakVerdict(s, false, 0)).toBe('ok')
  })

  it('memoria que crece rápido, cortes o cuadros perdidos → ATENCIÓN', () => {
    const leak = summarizeSoak(Array.from({ length: 120 }, (_, i) => minute(i + 1, { memMB: 50 + i * 2 })), 120)
    expect(leak.memSlopeMBh).toBeGreaterThan(50)
    expect(soakVerdict(leak, false, 0)).toBe('warn')
    const cuts = summarizeSoak(Array.from({ length: 60 }, (_, i) => minute(i + 1, { cuts: i % 20 === 0 ? 1 : 0, cutMs: i % 20 === 0 ? 500 : 0 })), 60)
    expect(cuts.cutsPerHour).toBe(3)
    expect(cuts.stuckSeconds).toBe(2)
    expect(soakVerdict(cuts, false, 0)).toBe('warn')
  })

  it('interrumpida, congelada o con errores → FALLA; sin memoria informada no rompe', () => {
    const tl = Array.from({ length: 40 }, (_, i) => minute(i + 1, { memMB: null }))
    const s = summarizeSoak(tl, 120)
    expect(s.memStartMB).toBeNull()
    expect(s.memSlopeMBh).toBeNull()
    expect(soakVerdict(s, true, 0)).toBe('fail')
    expect(soakVerdict(summarizeSoak([minute(1, { frozen: true })], 1), false, 0)).toBe('fail')
    expect(soakVerdict(summarizeSoak([minute(1)], 1), false, 2)).toBe('fail')
    expect(soakVerdict(s, false, 0)).toBe('warn') // 40 de 120 min
  })
})
