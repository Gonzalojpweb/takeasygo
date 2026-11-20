import { describe, it, expect } from 'vitest'
import { parseMenuPathSegment } from '@/lib/menu/location-ref'
import { detectTrafficSource, externalReferrer } from '@/lib/visits/attribution'

describe('parseMenuPathSegment', () => {
  it('reconoce slug, id, link general y reservas', () => {
    expect(parseMenuPathSegment('/kekelarry/menu/palermo/takeaway?x=1')).toEqual({ ref: 'palermo' })
    expect(parseMenuPathSegment('/kekelarry/menu/69F8C0CDD3FCC97FD64BEC9D')).toEqual({ ref: '69f8c0cdd3fcc97fd64bec9d' })
    expect(parseMenuPathSegment('/kekelarry/menu')).toEqual({ ref: '' })
    expect(parseMenuPathSegment('/kekelarry/reservas/69f8c0cdd3fcc97fd64bec9d')).toEqual({ ref: '69f8c0cdd3fcc97fd64bec9d' })
  })
  it('descarta rutas que no son del menú o segmentos inválidos', () => {
    expect(parseMenuPathSegment('/kekelarry/admin/menu')).toBeNull()
    expect(parseMenuPathSegment('/kekelarry/menu/<x>')).toBeNull()
    expect(parseMenuPathSegment(null)).toBeNull()
  })
})

describe('origen de la visita', () => {
  it('prioriza el source de la página', () => {
    expect(detectTrafficSource('https://google.com/', 'qr-mesa', null)).toBe('qr')
    expect(detectTrafficSource(null, 'tgo-customer', null)).toBe('tgo-customer')
  })
  it('navegador de Instagram y referrers externos', () => {
    expect(detectTrafficSource(null, null, 'Mozilla Instagram 300')).toBe('instagram')
    expect(detectTrafficSource('https://www.google.com.ar/', null, null)).toBe('google')
    expect(detectTrafficSource('https://wa.me/123', null, null)).toBe('whatsapp')
    expect(detectTrafficSource('https://otro-sitio.com/x', null, null)).toBe('other')
    expect(detectTrafficSource(null, null, null)).toBe('direct')
  })
  it('el referrer del mismo sitio no cuenta y se guarda sin query', () => {
    expect(externalReferrer('https://takeasygo.com/x/menu', 'takeasygo.com')).toBeNull()
    expect(externalReferrer('https://l.instagram.com/a?u=secreto', 'takeasygo.com')).toBe('https://l.instagram.com/a')
    expect(externalReferrer('no es url', 'takeasygo.com')).toBeNull()
  })
})
