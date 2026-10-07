import { describe, it, expect } from 'vitest'
import Location from '@/models/Location'
import {
  DEFAULT_MIN_ADVANCE_MINUTES,
  DEFAULT_TIMEZONE,
  getTodayStrInTimezone,
  isSlotBookable,
  isValidCalendarDate,
  isValidHHMM,
  timeToMinutes,
} from '@/lib/restaurant-time'

// 2026-10-07T15:00:00Z = 2026-10-07 12:00 en America/Argentina/Buenos_Aires
const NOON_AR = new Date('2026-10-07T15:00:00.000Z')

describe('isValidCalendarDate', () => {
  it('acepta fechas de calendario reales', () => {
    expect(isValidCalendarDate('2026-10-07')).toBe(true)
    expect(isValidCalendarDate('2026-12-31')).toBe(true)
    expect(isValidCalendarDate('2026-01-01')).toBe(true)
    expect(isValidCalendarDate('2026-02-28')).toBe(true)
    expect(isValidCalendarDate('2024-02-29')).toBe(true) // bisiesto
  })

  it('rechaza fechas que la regex sola aceptaría', () => {
    expect(isValidCalendarDate('2026-02-31')).toBe(false)
    expect(isValidCalendarDate('2026-02-29')).toBe(false) // no bisiesto
    expect(isValidCalendarDate('2026-13-01')).toBe(false)
    expect(isValidCalendarDate('2026-00-10')).toBe(false)
    expect(isValidCalendarDate('2026-10-00')).toBe(false)
    expect(isValidCalendarDate('2026-10-32')).toBe(false)
    expect(isValidCalendarDate('2026-11-31')).toBe(false)
  })

  it('rechaza strings malformados y no-string', () => {
    expect(isValidCalendarDate('2026-1-1')).toBe(false)
    expect(isValidCalendarDate('2026/10/07')).toBe(false)
    expect(isValidCalendarDate('2026-10-07T00:00:00')).toBe(false)
    expect(isValidCalendarDate('')).toBe(false)
    expect(isValidCalendarDate('ayer')).toBe(false)
    expect(isValidCalendarDate(null)).toBe(false)
    expect(isValidCalendarDate(undefined)).toBe(false)
    expect(isValidCalendarDate(20261007)).toBe(false)
  })
})

describe('isValidHHMM', () => {
  it('acepta HH:MM de 24h', () => {
    expect(isValidHHMM('00:00')).toBe(true)
    expect(isValidHHMM('12:00')).toBe(true)
    expect(isValidHHMM('23:59')).toBe(true)
  })

  it('rechaza horarios fuera de rango o mal formados', () => {
    expect(isValidHHMM('24:00')).toBe(false)
    expect(isValidHHMM('12:60')).toBe(false)
    expect(isValidHHMM('9:00')).toBe(false)
    expect(isValidHHMM('12:0')).toBe(false)
    expect(isValidHHMM('noon')).toBe(false)
    expect(isValidHHMM('')).toBe(false)
    expect(isValidHHMM(1200)).toBe(false)
  })
})

describe('timeToMinutes', () => {
  it('convierte HH:MM a minutos desde 00:00', () => {
    expect(timeToMinutes('00:00')).toBe(0)
    expect(timeToMinutes('12:30')).toBe(750)
    expect(timeToMinutes('23:59')).toBe(1439)
  })
})

describe('isSlotBookable', () => {
  it('el corte es inclusivo: con 30 min de antelación, 12:30 desde las 12:00 se puede', () => {
    expect(isSlotBookable(750, 720, 30)).toBe(true)  // 12:30
    expect(isSlotBookable(735, 720, 30)).toBe(false) // 12:15 (sólo 15 min)
    expect(isSlotBookable(720, 720, 30)).toBe(false) // 12:00 (ya pasó)
  })

  it('con antelación 0 igual no deja reservar el instante exacto', () => {
    expect(isSlotBookable(721, 720, 0)).toBe(true)
    expect(isSlotBookable(720, 720, 0)).toBe(false)
    expect(isSlotBookable(719, 720, 0)).toBe(false)
  })

  it('todo lo que ya pasó queda fuera', () => {
    expect(isSlotBookable(600, 720, 0)).toBe(false)
    expect(isSlotBookable(600, 720, 30)).toBe(false)
  })
})

describe('getTodayStrInTimezone', () => {
  it('usa la timezone de la sede, no la del servidor ni UTC', () => {
    expect(getTodayStrInTimezone(DEFAULT_TIMEZONE, NOON_AR)).toBe('2026-10-07')
    // En UTC ya es el 8, en AR sigue siendo el 7
    expect(getTodayStrInTimezone(DEFAULT_TIMEZONE, new Date('2026-10-08T01:00:00Z'))).toBe('2026-10-07')
    // En Tokio ya es el 8 a las 00:00
    expect(getTodayStrInTimezone('Asia/Tokyo', NOON_AR)).toBe('2026-10-08')
  })

  it('usa DEFAULT_TIMEZONE si no se pasa ninguna', () => {
    expect(getTodayStrInTimezone(undefined, NOON_AR)).toBe('2026-10-07')
  })
})

describe('DEFAULT_MIN_ADVANCE_MINUTES', () => {
  it('coincide con el default del schema de Location (una sola fuente)', () => {
    const path = Location.schema.path('reservationConfig.minAdvanceMinutes')
    expect(path).toBeTruthy()
    const { defaultValue, options } = path as unknown as {
      defaultValue?: number
      options?: { default?: number }
    }
    expect(defaultValue ?? options?.default).toBe(DEFAULT_MIN_ADVANCE_MINUTES)
    expect(DEFAULT_MIN_ADVANCE_MINUTES).toBe(30)
  })
})
