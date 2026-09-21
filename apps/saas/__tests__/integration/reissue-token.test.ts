import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import './setup'

import Tenant from '@/models/Tenant'
import LoyaltyMember from '@/models/LoyaltyMember'
import { hashPhone } from '@/lib/crypto'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

import { POST } from '@/app/api/[tenant]/club-member/reissue-token/route'

function makeRequest(body: Record<string, any>, headers: Record<string, string> = {}) {
  const url = 'http://localhost:3000/api/test-tenant/club-member/reissue-token'
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }) as any
}

function makeParams(slug = 'test-tenant') {
  return { params: Promise.resolve({ tenant: slug }) }
}

let tenant: any

beforeEach(async () => {
  tenant = await Tenant.create({
    name: 'Test Tenant',
    slug: 'test-tenant',
    plan: 'full',
    status: 'active',
  })
})

describe('POST /club-member/reissue-token', () => {
  it('Known device + valid phone → returns new token', async () => {
    const member = await LoyaltyMember.create({
      tenantId: tenant._id,
      name: 'Gonzalo',
      phone: '+5491160019734',
      phoneHash: hashPhone('+5491160019734'),
      email: 'gonzalo@test.com',
      source: 'promotion',
      status: 'active',
      joinedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      deviceFingerprints: ['device-abc-123'],
      tokenVersion: 0,
    })

    const req = makeRequest(
      { phone: '+5491160019734' },
      { 'x-device-id': 'device-abc-123' }
    )
    const res = await POST(req, makeParams())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.token).toBeTruthy()
    expect(typeof data.token).toBe('string')
    expect(data.member.name).toBe('Gonzalo')
    expect(data.member.id).toBe(member._id.toString())
  })

  it('Unknown device → 403 DEVICE_NOT_RECOGNIZED', async () => {
    await LoyaltyMember.create({
      tenantId: tenant._id,
      name: 'Gonzalo',
      phone: '+5491160019734',
      phoneHash: hashPhone('+5491160019734'),
      email: 'gonzalo@test.com',
      source: 'promotion',
      status: 'active',
      joinedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      deviceFingerprints: ['device-abc-123'],
      tokenVersion: 0,
    })

    const req = makeRequest(
      { phone: '+5491160019734' },
      { 'x-device-id': 'device-UNKNOWN' }
    )
    const res = await POST(req, makeParams())
    const data = await res.json()

    expect(res.status).toBe(403)
    expect(data.code).toBe('DEVICE_NOT_RECOGNIZED')
  })

  it('Phone not found → 404', async () => {
    const req = makeRequest(
      { phone: '+5491199999999' },
      { 'x-device-id': 'device-abc' }
    )
    const res = await POST(req, makeParams())

    expect(res.status).toBe(404)
  })

  it('Missing phone → 400', async () => {
    const req = makeRequest(
      {},
      { 'x-device-id': 'device-abc' }
    )
    const res = await POST(req, makeParams())

    expect(res.status).toBe(400)
  })

  it('Missing x-device-id → 400', async () => {
    const req = makeRequest({ phone: '+5491160019734' })
    const res = await POST(req, makeParams())

    expect(res.status).toBe(400)
  })

  it('Rate limit: 4th request in 1 hour → 429', async () => {
    await LoyaltyMember.create({
      tenantId: tenant._id,
      name: 'Gonzalo',
      phone: '+5491160019734',
      phoneHash: hashPhone('+5491160019734'),
      email: 'gonzalo@test.com',
      source: 'promotion',
      status: 'active',
      joinedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      deviceFingerprints: ['device-abc-123'],
      tokenVersion: 0,
    })

    // Override the mock to simulate rate limit hit on 4th call
    const { rateLimit } = await import('@/lib/rateLimit')
    const originalMock = vi.mocked(rateLimit).getMockImplementation()
    let callCount = 0
    vi.mocked(rateLimit).mockImplementation(async () => {
      callCount++
      if (callCount > 3) return { success: false, remaining: 0 }
      return { success: true, remaining: 3 - callCount }
    })

    // First 3 should succeed
    for (let i = 0; i < 3; i++) {
      const req = makeRequest(
        { phone: '+5491160019734' },
        { 'x-device-id': 'device-abc-123' }
      )
      const res = await POST(req, makeParams())
      expect(res.status).toBe(200)
    }

    // 4th should be rate-limited
    const req = makeRequest(
      { phone: '+5491160019734' },
      { 'x-device-id': 'device-abc-123' }
    )
    const res = await POST(req, makeParams())
    expect(res.status).toBe(429)

    // Restore original mock
    vi.mocked(rateLimit).mockImplementation(originalMock as any)
  })

  it('Token is valid JWT (can be verified by verifyMemberToken)', async () => {
    await LoyaltyMember.create({
      tenantId: tenant._id,
      name: 'Gonzalo',
      phone: '+5491160019734',
      phoneHash: hashPhone('+5491160019734'),
      email: 'gonzalo@test.com',
      source: 'promotion',
      status: 'active',
      joinedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      deviceFingerprints: ['device-abc-123'],
      tokenVersion: 0,
    })

    const req = makeRequest(
      { phone: '+5491160019734' },
      { 'x-device-id': 'device-abc-123' }
    )
    const res = await POST(req, makeParams())
    const data = await res.json()

    // Verify the token is a valid JWT
    const { verifyMemberToken } = await import('@/lib/memberToken')
    const verification = await verifyMemberToken(data.token)
    expect(verification.valid).toBe(true)
    expect(verification.payload?.phoneHash).toBe(hashPhone('+5491160019734'))
    expect(verification.payload?.tenantId).toBe(tenant._id.toString())
  })
})
