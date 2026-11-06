import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Multi-marca PR 5: el proxy borra el `x-tenant-slug` que manda el cliente en
 * TODOS los paths y solo pone el derivado de la URL. Next reenvía los headers
 * de la request modificada como `x-middleware-request-<nombre>` en la respuesta.
 */

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn().mockResolvedValue(null) }))
vi.mock('next-auth', () => ({ default: () => ({ auth: authMock }) }))
vi.mock('@/lib/auth.config', () => ({ authConfig: {} }))

import { proxy } from '@/proxy'

const SPOOF = 'comercio-ajeno'

async function forwardedSlug(path: string): Promise<string | null> {
  const req = new NextRequest(`http://localhost${path}`, { headers: { 'x-tenant-slug': SPOOF } })
  const res = await proxy(req)
  // Sin `x-middleware-override-headers` Next pasa la request ORIGINAL tal
  // cual a la ruta: el header del cliente llega intacto.
  if (!res.headers.has('x-middleware-override-headers')) return req.headers.get('x-tenant-slug')
  return res.headers.get('x-middleware-request-x-tenant-slug')
}

describe('proxy: x-tenant-slug del cliente', () => {
  it.each([
    '/api/superadmin/tenants',
    '/superadmin',
    '/api/auth/session',
    '/seller',
    '/api/seller/tenants',
    '/login',
    '/',
    '/Mayusculas/admin', // no pasa el regex de slug
  ])('se borra en %s', async (path) => {
    expect(await forwardedSlug(path)).toBeNull()
  })

  it('en la página del comercio vale el de la URL, no el del cliente', async () => {
    expect(await forwardedSlug('/mi-local')).toBe('mi-local')
  })

  it('en la API del comercio vale el de la URL', async () => {
    expect(await forwardedSlug('/api/mi-local/menu')).toBe('mi-local')
  })

  it('en el admin con sesión de superadmin vale el de la URL', async () => {
    authMock.mockResolvedValueOnce({ user: { role: 'superadmin' } })
    expect(await forwardedSlug('/mi-local/admin')).toBe('mi-local')
  })

  it('en el admin sin sesión redirige al login', async () => {
    const req = new NextRequest('http://localhost/mi-local/admin', { headers: { 'x-tenant-slug': SPOOF } })
    const res = await proxy(req)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
  })
})
