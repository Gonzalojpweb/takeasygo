import { describe, it, expect } from 'vitest'
import { resolveNotFoundContext, firstSegment } from '@/lib/not-found-context'

const keke = { slug: 'kekelarry', name: 'Kekelarry', logoUrl: 'https://img/logo.png', primaryColor: '#e11d48', status: 'active' }

describe('404 oficial: volver según el contexto', () => {
  it('carta de un comercio → su marca y volver a su carta', () => {
    const c = resolveNotFoundContext('/kekelarry/no-existe', keke)
    expect(c.brand).toBe('tenant')
    expect(c.primary).toEqual({ href: '/kekelarry', label: 'Volver a Kekelarry' })
  })
  it('panel del comercio → volver al panel', () => {
    const c = resolveNotFoundContext('/kekelarry/admin/algo', keke)
    expect(c.primary).toEqual({ href: '/kekelarry/admin', label: 'Volver al panel' })
    expect(c.secondary?.href).toBe('/kekelarry')
  })
  it('seguimiento, club, reservas y business tienen su propia vuelta', () => {
    expect(resolveNotFoundContext('/kekelarry/tracking/999', keke).primary.href).toBe('/kekelarry')
    expect(resolveNotFoundContext('/kekelarry/club/x', keke).primary.href).toBe('/kekelarry/club')
    expect(resolveNotFoundContext('/kekelarry/reservas/x', keke).primary.href).toBe('/kekelarry/reservas')
    expect(resolveNotFoundContext('/kekelarry/business/x', keke).primary.href).toBe('/kekelarry/business')
  })
  it('superadmin y grupo vuelven a lo suyo', () => {
    expect(resolveNotFoundContext('/superadmin/nada', null).primary.href).toBe('/superadmin')
    expect(resolveNotFoundContext('/grupo/otro-grupo', null).primary.href).toBe('/grupo')
  })
  it('comercio inexistente o borrado → marca TakeasyGO y explorar', () => {
    const c = resolveNotFoundContext('/no-existe-este', null)
    expect([c.brand, c.primary.href]).toEqual(['tgo', '/explore'])
    expect(resolveNotFoundContext('/kekelarry', { ...keke, status: 'deleted' }).brand).toBe('tgo')
  })
  it('dirección rara: nunca arma un enlace a otro dominio', () => {
    expect(resolveNotFoundContext('//evil.com/x', null).primary.href.startsWith('//')).toBe(false)
    expect(firstSegment('/kekelarry/admin?x=1')).toBe('kekelarry')
  })
})
