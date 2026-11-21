import { describe, it, expect } from 'vitest'
import { parseRangeHeader, contentRange } from './range'
import { computeOffset, correctedNow, isActiveAt, saveOffset, loadOffset } from './clock'

describe('Range (opción A, 206)', () => {
  const size = 1000
  it('rangos válidos', () => {
    expect(parseRangeHeader('bytes=0-99', size)).toEqual({ start: 0, end: 99 })
    expect(parseRangeHeader('bytes=900-', size)).toEqual({ start: 900, end: 999 })
    expect(parseRangeHeader('bytes=-100', size)).toEqual({ start: 900, end: 999 })
    expect(parseRangeHeader('bytes=950-5000', size)).toEqual({ start: 950, end: 999 }) // fin recortado al archivo
    expect(contentRange({ start: 0, end: 99 }, size)).toBe('bytes 0-99/1000')
  })
  it('inválidos o fuera del archivo → null (416)', () => {
    for (const h of [null, '', 'bytes=', 'bytes=-', 'bytes=500-100', 'bytes=1000-', 'items=0-1', 'bytes=0-1,5-6', 'bytes=-0']) {
      expect(parseRangeHeader(h, size)).toBeNull()
    }
    expect(parseRangeHeader('bytes=0-1', 0)).toBeNull()
  })
})

describe('hora corregida y vencimiento (endsAt)', () => {
  it('diferencia con el servidor compensando el viaje', () => {
    // Servidor 10 s adelantado; ida y vuelta de 200 ms.
    expect(computeOffset(1_000_010_100, 1_000_000_000, 1_000_000_200)).toBe(10_000)
  })
  it('la hora corregida usa la última diferencia (también sin internet)', () => {
    const mem = new Map<string, string>()
    const st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v) } }
    saveOffset({ offsetMs: -5000, measuredAt: 1 }, st)
    expect(loadOffset(st)).toEqual({ offsetMs: -5000, measuredAt: 1 })
    expect(correctedNow(100_000, loadOffset(st))).toBe(95_000)
    expect(correctedNow(100_000, null)).toBe(100_000)
  })
  it('vigencia: empezó y no venció; sin fechas siempre', () => {
    const now = Date.parse('2026-11-21T12:00:00Z')
    expect(isActiveAt({ endsAt: '2026-11-21T11:59:59Z' }, now)).toBe(false)
    expect(isActiveAt({ endsAt: '2026-11-21T12:00:00Z' }, now)).toBe(false) // vence justo ahora
    expect(isActiveAt({ startsAt: '2026-11-21T12:00:01Z' }, now)).toBe(false)
    expect(isActiveAt({ startsAt: '2026-11-21T11:00:00Z', endsAt: '2026-11-21T13:00:00Z' }, now)).toBe(true)
    expect(isActiveAt({}, now)).toBe(true)
    expect(isActiveAt({ startsAt: null, endsAt: 'basura' }, now)).toBe(true)
  })
})
