// ============================================================================
// menu-visit-sede.test.ts — Visitas a la carta atribuidas a la sede
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import MenuVisit from '@/models/MenuVisit'
import { POST as logVisit } from '@/app/api/visits/log/route'

let tenant: any
let loc1: any
let loc2: any

beforeEach(async () => {
  tenant = await Tenant.create({ slug: 'visitas', name: 'Visitas', isActive: true })
  loc1 = await Location.create({ tenantId: tenant._id, slug: 'a', name: 'A', address: 'A', isActive: true })
  loc2 = await Location.create({ tenantId: tenant._id, slug: 'b', name: 'B', address: 'B', isActive: true })
})

function visit(locationPath: string, ip = '10.0.0.1') {
  return logVisit(new NextRequest('http://localhost/api/visits/log', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ tenantSlug: 'visitas', locationPath }),
  }))
}

describe('MenuVisit con sede', () => {
  it('la sede sale del path de la carta', async () => {
    await visit(`/visitas/menu/${loc1._id}`)
    const v = await MenuVisit.findOne({}).lean() as any
    expect(String(v.locationId)).toBe(String(loc1._id))
  })

  it('la misma IP en dos sedes cuenta una visita por sede', async () => {
    await visit(`/visitas/menu/${loc1._id}`)
    await visit(`/visitas/menu/${loc2._id}`)
    expect(await MenuVisit.countDocuments({})).toBe(2)
  })

  it('un id de sede de otro tenant no se atribuye', async () => {
    const other = await Tenant.create({ slug: 'otro', name: 'Otro', isActive: true })
    const foreign = await Location.create({ tenantId: other._id, slug: 'x', name: 'X', address: 'X', isActive: true })
    await visit(`/visitas/menu/${foreign._id}`)
    const v = await MenuVisit.findOne({}).lean() as any
    expect(v.locationId).toBeNull()
  })
})
