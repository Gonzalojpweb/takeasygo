import { describe, it, expect } from 'vitest'
import { inDaypart, localParts, playableItems, chooseQuality, type ManifestItem } from './schedule'

const TZ = 'America/Argentina/Buenos_Aires' // UTC−3, sin horario de verano
// Sábado 21/11/2026 15:00 AR = 18:00 UTC
const SAT_15 = Date.parse('2026-11-21T18:00:00Z')
const at = (iso: string) => Date.parse(iso)

describe('franja horaria (zona de la sede)', () => {
  it('día y minutos en la zona horaria de la sede', () => {
    expect(localParts(SAT_15, TZ)).toEqual({ day: 6, minutes: 15 * 60 })
  })
  it('sin franja → siempre; días sueltos; horas', () => {
    expect(inDaypart(null, SAT_15, TZ)).toBe(true)
    expect(inDaypart({ days: [6] }, SAT_15, TZ)).toBe(true)
    expect(inDaypart({ days: [1, 2] }, SAT_15, TZ)).toBe(false)
    expect(inDaypart({ from: '12:00', to: '16:00' }, SAT_15, TZ)).toBe(true)
    expect(inDaypart({ from: '16:00', to: '20:00' }, SAT_15, TZ)).toBe(false)
    expect(inDaypart({ from: '15:00', to: '16:00' }, SAT_15, TZ)).toBe(true) // incluye el inicio
    expect(inDaypart({ from: '14:00', to: '15:00' }, SAT_15, TZ)).toBe(false) // excluye el fin
  })
  it('franja que cruza la medianoche (sábado 20:00–02:00)', () => {
    const dp = { days: [6], from: '20:00', to: '02:00' }
    expect(inDaypart(dp, at('2026-11-21T23:30:00Z'), TZ)).toBe(true)  // sáb 20:30
    expect(inDaypart(dp, at('2026-11-22T04:30:00Z'), TZ)).toBe(true)  // dom 01:30 → pertenece al sábado
    expect(inDaypart(dp, at('2026-11-22T05:30:00Z'), TZ)).toBe(false) // dom 02:30
    expect(inDaypart(dp, at('2026-11-23T04:30:00Z'), TZ)).toBe(false) // lun 01:30 (domingo no está)
  })
  it('horas inválidas se ignoran (cuenta solo el día)', () => {
    expect(inDaypart({ days: [6], from: '25:00', to: '10:00' }, SAT_15, TZ)).toBe(true)
  })
})

describe('qué se puede mostrar', () => {
  const base: ManifestItem = { id: 'a', kind: 'image', url1080: 'u1', url720: 'u7', posterUrl: null, durationMs: 10_000, startsAt: null, endsAt: null, updatedAt: '', bytes: 1 }
  it('vigente + en franja + guardada + sin penitencia', () => {
    const items: ManifestItem[] = [
      base,
      { ...base, id: 'vencida', endsAt: '2026-11-21T17:59:00Z' },
      { ...base, id: 'futura', startsAt: '2026-11-21T19:00:00Z' },
      { ...base, id: 'fuera-de-franja', daypart: { from: '20:00', to: '23:00' } },
      { ...base, id: 'no-guardada' },
      { ...base, id: 'con-errores' },
    ]
    const shown = playableItems(items, {
      nowMs: SAT_15, timeZone: TZ,
      isCached: (i) => i.id !== 'no-guardada',
      penaltyUntil: new Map([['con-errores', SAT_15 + 60_000]]),
    }).map((i) => i.id)
    expect(shown).toEqual(['a'])
  })
  it('calidad: 720p en pantallas chicas o equipos de ≤ 2 GB', () => {
    expect(chooseQuality(1920, 1080, 1, 4)).toBe('1080')
    expect(chooseQuality(1280, 720, 1, null)).toBe('720')
    expect(chooseQuality(960, 540, 2, null)).toBe('1080') // TV que reporta 960×540 a 2x
    expect(chooseQuality(1920, 1080, 1, 2)).toBe('720')
  })
})
