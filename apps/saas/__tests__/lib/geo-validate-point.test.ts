import { describe, it, expect } from 'vitest'
import { checkGeoBody, checkGeoCoordinates } from '@/lib/geo/validate-point'

describe('checkGeoCoordinates', () => {
  it('valida forma, rango e igualdad', () => {
    expect(checkGeoCoordinates([-58.38, -34.6])).toEqual({ ok: true, warning: null })
    expect(checkGeoCoordinates([-74, -74]).ok).toBe(false)
    expect(checkGeoCoordinates([200, 0]).ok).toBe(false)
    expect(checkGeoCoordinates([1]).ok).toBe(false)
    expect(checkGeoCoordinates([NaN, 1]).ok).toBe(false)
  })
  it('avisa fuera de Argentina', () => {
    const r = checkGeoCoordinates([-3.7, 40.4])
    expect(r.ok && r.warning).toMatch(/fuera de Argentina/)
  })
  it('sin geo o geo nulo no valida nada', () => {
    expect(checkGeoBody(undefined)).toEqual({ ok: true, warning: null })
    expect(checkGeoBody(null)).toEqual({ ok: true, warning: null })
    expect(checkGeoBody({ type: 'Polygon', coordinates: [1, 2] }).ok).toBe(false)
  })
})
