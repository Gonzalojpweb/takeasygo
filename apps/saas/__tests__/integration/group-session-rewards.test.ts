import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import Order from '@/models/Order'
import StoreRedemption from '@/models/StoreRedemption'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/corpAuth', async () => {
  const { Types } = await import('mongoose')
  const accountId = new Types.ObjectId()
  return {
    requireCorpAccess: vi.fn(async () => ({
      ok: true,
      access: {
        account: { _id: accountId, companyName: 'Acme SA' },
        user: { email: 'admin@acme.com' },
      },
    })),
  }
})

vi.mock('@/lib/corporateAccess', () => ({
  getTenantPaymentConfig: vi.fn().mockReturnValue({ paymentMode: 'cash_mp' }),
}))

vi.mock('@/lib/consumer', () => ({
  upsertConsumerFromOrder: vi.fn().mockResolvedValue(undefined),
}))

import { POST as createGroupSession } from '@/app/api/[tenant]/business/group-session/route'

const SLUG = 'tenant-grupo'

let tenant: any
let location: any

function params() {
  return { params: Promise.resolve({ tenant: SLUG }) }
}

beforeEach(async () => {
  vi.clearAllMocks()
  tenant = await Tenant.create({
    name: 'Tenant Grupo',
    slug: SLUG,
    plan: 'full',
    status: 'active',
    isActive: true,
  })
  location = await Location.create({
    tenantId: tenant._id,
    name: 'Sede',
    slug: 'sede',
    address: 'Av. Test 1',
    isActive: true,
  })
  await Menu.create({
    tenantId: tenant._id,
    locationId: location._id,
    name: 'Menú',
    isActive: true,
    categories: [],
  })
})

describe('Sesión grupal y premios', () => {
  it('la sesión grupal crea la orden SIN premios ni StoreRedemption', async () => {
    const req = new NextRequest(`http://localhost/api/${SLUG}/business/group-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locationId: location._id.toString() }),
    })
    const res = await createGroupSession(req, params())
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.session.orderId).toBeTruthy()

    // La orden grupal nace y vive sin rewardItems: los premios no viajan
    // en el flujo de grupo (ni al crearse ni al confirmar).
    const order = await Order.findById(data.session.orderId)
    expect(order).toBeTruthy()
    expect(order!.rewardItems ?? []).toHaveLength(0)

    // Nunca se creó una redención por esta sesión
    expect(await StoreRedemption.countDocuments({})).toBe(0)
  })
})
