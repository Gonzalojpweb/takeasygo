import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import './setup'

import Tenant from '@/models/Tenant'
import { auth } from '@/lib/auth'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/tia/metrics', () => ({
  fetchDashboardMetrics: vi.fn().mockResolvedValue({ orders: 0, revenue: 0 }),
}))

import { GET as crmCustomersGet } from '@/app/api/[tenant]/crm/customers/route'
import { GET as crmSegmentsGet } from '@/app/api/[tenant]/crm/segments/route'
import { GET as tiaMetricsGet } from '@/app/api/[tenant]/tia/metrics/route'
import { GET as inventoryTransfersGet } from '@/app/api/[tenant]/inventory/transfers/route'
import { GET as funnelGet } from '@/app/api/[tenant]/funnel/route'
import { GET as tripsGet } from '@/app/api/[tenant]/delivery/persons/[id]/trips/route'

/**
 * Smoke de las rutas staff cerradas (tanda 1 + 2 del hardening).
 *
 * Delegación por handler: anónimo → 401; admin de OTRO tenant → 403;
 * admin del tenant → pasa el auth (200/404 de lógica, nunca 401/403).
 * El dev server local no es viable en este entorno (Dropbox), así que el
 * humo se hace contra los handlers reales con sesión mockeada.
 */

const SLUG = 'palmyra'
const OTHER_TENANT_ID = new mongoose.Types.ObjectId()

let tenantId: string

function req(path = `/${SLUG}/crm/customers`): NextRequest {
  return new NextRequest(`http://localhost/api${path}`)
}

function params(extra: Record<string, string> = {}) {
  return { params: Promise.resolve({ tenant: SLUG, ...extra }) }
}

const ROUTES: Array<{ name: string; call: (r: NextRequest) => Promise<Response>; path?: string; id?: string }> = [
  { name: 'crm/customers', call: (r) => crmCustomersGet(r, params()) },
  { name: 'crm/segments', call: (r) => crmSegmentsGet(r, params()) },
  { name: 'tia/metrics', call: (r) => tiaMetricsGet(r, params()) },
  { name: 'inventory/transfers', call: (r) => inventoryTransfersGet(r, params()) },
  { name: 'funnel', call: (r) => funnelGet(r, params()) },
  { name: 'delivery/trips (id fantasma)', call: (r) => tripsGet(r, params({ id: '000000000000000000000000' })) },
]

describe('Smoke: rutas staff cerradas', () => {
  beforeEach(async () => {
    // setup.ts limpia todas las colecciones tras cada test: recrear tenant.
    await mongoose.connection.dropDatabase()
    const tenant = await Tenant.create({ name: 'Palmyra', slug: SLUG, plan: 'full' })
    tenantId = String(tenant._id)
    vi.mocked(auth).mockReset()
  })

  it.each(ROUTES)('$name → 401 sin sesión', async ({ call, path }) => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await call(req(path ?? `/${SLUG}/x`))
    expect(res.status).toBe(401)
  })

  it.each(ROUTES)('$name → 403 con admin de otro tenant', async ({ call, path }) => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'u1', role: 'admin', tenantId: OTHER_TENANT_ID.toString(), tenantSlug: 'otro' },
      expires: '',
    } as any)
    const res = await call(req(path ?? `/${SLUG}/x`))
    expect(res.status).toBe(403)
  })

  it.each(ROUTES)('$name → pasa el auth con admin del tenant', async ({ call, path }) => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'u2', role: 'admin', tenantId, tenantSlug: SLUG },
      expires: '',
    } as any)
    const res = await call(req(path ?? `/${SLUG}/x`))
    expect([200, 404]).toContain(res.status)
  })
})
