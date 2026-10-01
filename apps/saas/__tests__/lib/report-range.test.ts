/**
 * __tests__/lib/report-range.test.ts
 *
 * Rangos de tiempo del panel de /admin/reports:
 * - presets 7/15/30/60/90 que ofrece el filtro
 * - deltaPct/deltaPoints para las comparaciones de upselling vs período previo
 * - buildPeriodLabel: "últimos N días" cuando el rango coincide con un preset
 */

import {
  PRESET_DAYS,
  fmtDate,
  presetRange,
  deltaPct,
  deltaPoints,
  buildPeriodLabel,
} from '@/lib/report-range'

// ── PRESET_DAYS ──────────────────────────────────────────────────────────────

describe('PRESET_DAYS', () => {
  it('incluye 7, 15, 30, 60 y 90 días', () => {
    for (const d of [7, 15, 30, 60, 90]) {
      expect(PRESET_DAYS).toContain(d)
    }
  })

  it('no tiene duplicados (dos presets iguales se pintarían ambos activos)', () => {
    expect(new Set(PRESET_DAYS).size).toBe(PRESET_DAYS.length)
  })

  it('está ordenado de menor a mayor', () => {
    const sorted = [...PRESET_DAYS].sort((a, b) => a - b)
    expect([...PRESET_DAYS]).toEqual(sorted)
  })
})

// ── fmtDate / presetRange ────────────────────────────────────────────────────

describe('fmtDate', () => {
  it('formatea YYYY-MM-DD con ceros a la izquierda', () => {
    expect(fmtDate(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(fmtDate(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
})

describe('presetRange', () => {
  const now = new Date(2026, 8, 30) // 30 sep 2026

  it('devuelve desde hace N días hasta hoy', () => {
    expect(presetRange(7, now)).toEqual({ from: '2026-09-23', to: '2026-09-30' })
    expect(presetRange(15, now)).toEqual({ from: '2026-09-15', to: '2026-09-30' })
    expect(presetRange(30, now)).toEqual({ from: '2026-08-31', to: '2026-09-30' })
    expect(presetRange(60, now)).toEqual({ from: '2026-08-01', to: '2026-09-30' })
    expect(presetRange(90, now)).toEqual({ from: '2026-07-02', to: '2026-09-30' })
  })

  it('cruza meses y años correctamente', () => {
    expect(presetRange(365, new Date(2026, 0, 1))).toEqual({ from: '2025-01-01', to: '2026-01-01' })
  })

  it('cubre un bisiesto (29 de febrero)', () => {
    expect(presetRange(1, new Date(2028, 2, 1))).toEqual({ from: '2028-02-29', to: '2028-03-01' })
  })

  it('tiene siempre from <= to', () => {
    for (const d of PRESET_DAYS) {
      const r = presetRange(d, now)
      expect(r.from <= r.to).toBe(true)
    }
  })
})

// ── deltaPct / deltaPoints ───────────────────────────────────────────────────

describe('deltaPct', () => {
  it('calcula la variación porcentual', () => {
    expect(deltaPct(100, 50)).toBe(100)
    expect(deltaPct(50, 100)).toBe(-50)
    expect(deltaPct(100, 100)).toBe(0)
    expect(deltaPct(105, 100)).toBe(5)
  })

  it('redondea al entero más cercano', () => {
    expect(deltaPct(1, 3)).toBe(-67)
    expect(deltaPct(2, 3)).toBe(-33)
  })

  it('devuelve null cuando no hay base comparable', () => {
    expect(deltaPct(100, 0)).toBeNull()
    expect(deltaPct(0, 0)).toBeNull()
  })

  it('devuelve null con entradas no numéricas', () => {
    expect(deltaPct(Number.NaN, 10)).toBeNull()
    expect(deltaPct(10, Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe('deltaPoints', () => {
  it('devuelve la diferencia en puntos', () => {
    expect(deltaPoints(80, 70)).toBe(10)
    expect(deltaPoints(70, 80)).toBe(-10)
    expect(deltaPoints(80, 80)).toBe(0)
  })

  it('devuelve null si no hay tasa previa', () => {
    expect(deltaPoints(80, null)).toBeNull()
    expect(deltaPoints(Number.NaN, 70)).toBeNull()
  })
})

// ── buildPeriodLabel ─────────────────────────────────────────────────────────

describe('buildPeriodLabel', () => {
  const now = new Date(2026, 8, 30)

  it('dice "últimos N días" cuando el rango termina hoy y es un preset', () => {
    expect(buildPeriodLabel('2026-09-23', '2026-09-30', now)).toBe('últimos 7 días')
    expect(buildPeriodLabel('2026-09-15', '2026-09-30', now)).toBe('últimos 15 días')
    expect(buildPeriodLabel('2026-08-31', '2026-09-30', now)).toBe('últimos 30 días')
    expect(buildPeriodLabel('2026-08-01', '2026-09-30', now)).toBe('últimos 60 días')
    expect(buildPeriodLabel('2026-07-02', '2026-09-30', now)).toBe('últimos 90 días')
  })

  it('usa las fechas crudas si el rango no es un preset', () => {
    expect(buildPeriodLabel('2026-09-01', '2026-09-29', now)).toBe('2026-09-01 → 2026-09-29')
  })

  it('usa las fechas crudas si el rango no termina hoy', () => {
    expect(buildPeriodLabel('2026-09-23', '2026-09-29', now)).toBe('2026-09-23 → 2026-09-29')
  })

  it('tolera formatos inválidos sin romper', () => {
    expect(buildPeriodLabel('', '', now)).toBe('Período')
    expect(buildPeriodLabel('ayer', 'hoy', now)).toBe('ayer → hoy')
  })
})
