import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import LoyaltyMember from '@/models/LoyaltyMember'
import Order from '@/models/Order'
import QrPromo from '@/models/QrPromo'
import { hashPhone } from '@/lib/crypto'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({
    user: { id: 'admin-id', role: 'superadmin', tenantSlug: 'test-tenant' },
  }),
}))

import { GET } from '@/app/api/[tenant]/admin/club-audit/route'

function makeRequest(queryParams = '') {
  const url = `http://localhost:3000/api/test-tenant/admin/club-audit${queryParams ? '?' + queryParams : ''}`
  return new Request(url, { method: 'GET' }) as any
}

function makeParams(slug = 'test-tenant') {
  return { params: Promise.resolve({ tenant: slug }) }
}

let tenant: any
let location: any

beforeEach(async () => {
  tenant = await Tenant.create({
    name: 'Test Tenant',
    slug: 'test-tenant',
    plan: 'full',
    status: 'active',
  })
  location = await Location.create({
    tenantId: tenant._id,
    name: 'Test Location',
    slug: 'test-location',
    address: 'Calle 123',
    phone: '+5491111111111',
    isActive: true,
  })
})

describe('B2 — Auditoría', () => {
  it('Returns members who used promo within 48h of joining', async () => {
    const now = new Date()

    // Create promo
    await QrPromo.create({
      tenantId: tenant._id,
      name: 'Club',
      slug: 'club-10',
      discountPercentage: 10,
      isEnabled: true,
      memberOnly: true,
    })

    // Member 1: joined 24h ago, used promo at 2h after join (within 48h)
    const m1 = await LoyaltyMember.create({
      tenantId: tenant._id,
      name: 'Suspicious User',
      phone: '+5491111111111',
      phoneHash: hashPhone('+5491111111111'),
      email: 's@test.com',
      source: 'promotion',
      status: 'active',
      joinedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      deviceFingerprints: ['fp1'],
    })

    await Order.create({
      tenantId: tenant._id,
      locationId: location._id,
      orderNumber: 'ORD-001',
      orderMode: 'takeaway',
      promoSlug: 'club-10',
      customer: { phoneHash: hashPhone('+5491111111111'), name: 'Suspicious' },
      status: 'delivered',
      payment: { status: 'approved', method: 'cash' },
      items: [],
      subtotal: 1000,
      total: 1000,
      ip: '192.168.1.100',
      createdAt: new Date(now.getTime() - 22 * 60 * 60 * 1000), // 2h after join
    })

    // Member 2: joined 100h ago, used promo at 90h after join (NOT within 48h)
    const m2 = await LoyaltyMember.create({
      tenantId: tenant._id,
      name: 'Old User',
      phone: '+5492222222222',
      phoneHash: hashPhone('+5492222222222'),
      email: 'o@test.com',
      source: 'promotion',
      status: 'active',
      joinedAt: new Date(now.getTime() - 100 * 60 * 60 * 1000),
      deviceFingerprints: ['fp2'],
    })

    await Order.create({
      tenantId: tenant._id,
      locationId: location._id,
      orderNumber: 'ORD-002',
      orderMode: 'takeaway',
      promoSlug: 'club-10',
      customer: { phoneHash: hashPhone('+5492222222222'), name: 'Old' },
      status: 'delivered',
      payment: { status: 'approved', method: 'cash' },
      items: [],
      subtotal: 1000,
      total: 1000,
      ip: '192.168.1.200',
      createdAt: new Date(now.getTime() - 10 * 60 * 60 * 1000), // 90h after join
    })

    const req = makeRequest()
    const res = await GET(req, makeParams())
    const data = await res.json()

    expect(data.total).toBe(1)
    expect(data.entries[0].memberId).toBe(m1._id.toString())
    expect(data.entries[0].hoursDelta).toBeLessThan(48)
  })

  it('No admin session → 401', async () => {
    const { auth } = await import('@/lib/auth')
    ;(auth as any).mockResolvedValueOnce(null)

    const req = makeRequest()
    const res = await GET(req, makeParams())
    const data = await res.json()

    expect(res.status).toBe(401)
    expect(data.error).toMatch(/autorizado/i)
  })

  it('Empty results when no members used promo', async () => {
    const req = makeRequest()
    const res = await GET(req, makeParams())
    const data = await res.json()

    expect(data.entries).toHaveLength(0)
    expect(data.total).toBe(0)
  })
})
