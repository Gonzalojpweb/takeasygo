import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import './setup'

import Tenant from '@/models/Tenant'
import { auth } from '@/lib/auth'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

import { GET as clubDiscountGET } from '@/app/api/[tenant]/admin/club-discount/route'
import { GET as qrPromosGET } from '@/app/api/[tenant]/admin/qr-promos/route'
import { GET as trafficGET } from '@/app/api/[tenant]/analytics/traffic/route'

/**
 * S9 (06/11/2026): las rutas del club, de las promos QR y la analítica de
 * tráfico verificaban el comercio pero no el rol. Ahora solo admin y
 * encargado (y superadmin).
 */
const authMock = auth as unknown as ReturnType<typeof vi.fn>
const SLUG = 'test-tenant'
const req = (path: string) => new Request(`http://localhost:3000/api/${SLUG}/${path}`) as unknown as NextRequest
const params = { params: Promise.resolve({ tenant: SLUG }) }

beforeEach(async () => {
  await Tenant.create({ name: 'Test', slug: SLUG, plan: 'full' })
})

describe('S9: rol mínimo en club, promos QR y tráfico', () => {
  for (const [name, handler, path] of [
    ['club-discount', clubDiscountGET, 'admin/club-discount'],
    ['qr-promos', qrPromosGET, 'admin/qr-promos'],
    ['traffic', trafficGET, 'analytics/traffic'],
  ] as const) {
    it(`${name}: un mozo del comercio recibe 403`, async () => {
      authMock.mockResolvedValue({ user: { id: 'u1', role: 'waiter', tenantSlug: SLUG } })
      const res = await (handler as (r: NextRequest, p: typeof params) => Promise<Response>)(req(path), params)
      expect(res.status).toBe(403)
    })

    it(`${name}: el encargado del comercio pasa la guardia`, async () => {
      authMock.mockResolvedValue({ user: { id: 'u1', role: 'manager', tenantSlug: SLUG } })
      const res = await (handler as (r: NextRequest, p: typeof params) => Promise<Response>)(req(path), params)
      expect([401, 403]).not.toContain(res.status)
    })
  }
})
