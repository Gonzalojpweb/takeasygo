// ============================================================================
// location-geo-validation.test.ts — coordenadas de sedes (20/11/2026)
// ============================================================================
// Una sede quedó en [-74, -74] porque el alta/edición guardaban `geo` sin validar.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/apiAuth', () => ({
  requireAuth: vi.fn().mockResolvedValue(null),
  requireAdminRole: vi.fn().mockResolvedValue(null),
  getSessionUser: vi.fn().mockResolvedValue({ id: 'admin-id', role: 'admin', assignedLocations: [] }),
}))
vi.mock('@/lib/rbac', () => ({ enforcePermissionForRequest: vi.fn().mockResolvedValue(null) }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }))

import { PUT as putLocation } from '@/app/api/[tenant]/locations/[locationId]/route'

const SLUG = 'geo-tenant'
let location: any

beforeEach(async () => {
  const tenant = await Tenant.create({ name: 'Geo', slug: SLUG, plan: 'full', status: 'active', isActive: true })
  location = await Location.create({ tenantId: tenant._id, name: 'Centro', slug: 'centro', address: 'Av 1', settings: {} })
})

const put = (body: Record<string, unknown>) => putLocation(
  new NextRequest(`http://localhost/api/${SLUG}/locations/${location._id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  { params: Promise.resolve({ tenant: SLUG, locationId: location._id.toString() }) },
)

describe('coordenadas de la sede', () => {
  it('rechaza latitud igual a longitud ([-74, -74]) y no guarda', async () => {
    const res = await put({ geo: { type: 'Point', coordinates: [-74, -74] } })
    expect(res.status).toBe(400)
    const saved = await Location.findById(location._id).lean<any>()
    expect(saved.geo?.coordinates ?? []).toEqual([])
  })

  it('rechaza fuera de rango y valores no numéricos', async () => {
    expect((await put({ geo: { type: 'Point', coordinates: [-58.4, -134] } })).status).toBe(400)
    expect((await put({ geo: { type: 'Point', coordinates: ['a', 'b'] } })).status).toBe(400)
  })

  it('acepta CABA sin aviso', async () => {
    const res = await put({ geo: { type: 'Point', coordinates: [-58.38, -34.6] } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.geoWarning).toBeUndefined()
    expect(body.location.geo.coordinates).toEqual([-58.38, -34.6])
  })

  it('fuera de Argentina guarda pero avisa', async () => {
    const res = await put({ geo: { type: 'Point', coordinates: [-70.65, -33.45] } }) // Santiago de Chile: dentro de la caja
    expect(res.status).toBe(200)
    const res2 = await put({ geo: { type: 'Point', coordinates: [-3.7, 40.4] } }) // Madrid
    expect(res2.status).toBe(200)
    expect((await res2.json()).geoWarning).toMatch(/fuera de Argentina/)
  })

  it('el modelo también rechaza coordenadas inválidas al crear', async () => {
    await expect(Location.create({ tenantId: location.tenantId, name: 'X', slug: 'x', address: 'X', geo: { type: 'Point', coordinates: [-74, -74] } })).rejects.toThrow()
  })
})
