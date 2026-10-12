import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'
import mongoose from 'mongoose'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { GET as printJobsGET } from '@/app/api/[tenant]/print-jobs/route'

const TENANT_SLUG = 'kekelarry'
let locationId: mongoose.Types.ObjectId

function makeRequest(locationId: string) {
  return new NextRequest(
    `http://localhost/api/${TENANT_SLUG}/print-jobs?locationId=${locationId}`,
    { headers: { 'X-Agent-Version': '2.1.0' } }
  )
}

beforeEach(async () => {
  vi.clearAllMocks()
  const tenant = await Tenant.create({ name: 'Keké', slug: TENANT_SLUG, isActive: true })
  const location = await Location.create({
    tenantId: tenant._id,
    name: 'Belgrano',
    slug: 'belgrano',
    address: 'Av. Siempreviva 742',
    isActive: true,
  })
  locationId = location._id as mongoose.Types.ObjectId
})

afterEach(() => {
  vi.useRealTimers()
})

describe('print-jobs fase 1 — heartbeat limitado a 1/min por sede', () => {
  it('el primer poll escribe el heartbeat; los siguientes no, hasta pasar 1 min', async () => {
    const updateSpy = vi.spyOn(Location, 'updateOne')

    const res1 = await printJobsGET(makeRequest(String(locationId)), { params: Promise.resolve({ tenant: TENANT_SLUG }) })
    expect(res1.status).toBe(200)
    expect(updateSpy).toHaveBeenCalledTimes(1)

    const after = await Location.findById(locationId).lean()
    expect(after?.printerAgent?.lastSeenAt).toBeTruthy()
    expect(after?.printerAgent?.version).toBe('2.1.0')

    // Polls inmediatos siguientes: sin escritura
    const res2 = await printJobsGET(makeRequest(String(locationId)), { params: Promise.resolve({ tenant: TENANT_SLUG }) })
    const res3 = await printJobsGET(makeRequest(String(locationId)), { params: Promise.resolve({ tenant: TENANT_SLUG }) })
    expect(res2.status).toBe(200)
    expect(res3.status).toBe(200)
    expect(updateSpy).toHaveBeenCalledTimes(1)
  })
})
