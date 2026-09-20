import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import './setup'

import Tenant from '@/models/Tenant'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({
    user: { id: 'admin-id', role: 'superadmin', tenantSlug: 'test-tenant' },
  }),
}))

vi.mock('@/lib/rateLimit', () => ({
  rateLimit: vi.fn(),
}))

import { rateLimit } from '@/lib/rateLimit'
import { POST } from '@/app/api/[tenant]/loyalty/register/route'

const mockedRateLimit = vi.mocked(rateLimit)

function makeRequest(body: Record<string, any>, headers: Record<string, string> = {}) {
  return new Request('http://localhost:3000/api/test-tenant/loyalty/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }) as any
}

function makeParams(slug = 'test-tenant') {
  return { params: Promise.resolve({ tenant: slug }) }
}

beforeEach(async () => {
  mockedRateLimit.mockReset()
  await Tenant.create({
    name: 'Test Tenant',
    slug: 'test-tenant',
    plan: 'full',
    pointsConfig: { welcomePoints: 100 },
  })
})

describe('B2 — Rate-limit', () => {
  it('Device rate-limit hit → 429', async () => {
    mockedRateLimit.mockResolvedValueOnce({ success: false, remaining: 0 })

    const req = makeRequest(
      { name: 'Test', email: 't@test.com', phone: '+5491111111111' },
      { 'user-agent': 'UA-1', 'x-forwarded-for': '10.0.0.1', 'accept-language': 'es' },
    )
    const res = await POST(req, makeParams())
    const data = await res.json()

    expect(res.status).toBe(429)
    expect(data.error).toMatch(/dispositivo/i)
  })

  it('IP rate-limit hit → 429', async () => {
    mockedRateLimit
      .mockResolvedValueOnce({ success: true, remaining: 0 })
      .mockResolvedValueOnce({ success: false, remaining: 0 })

    const req = makeRequest(
      { name: 'Test', email: 't@test.com', phone: '+5491111111111' },
      { 'user-agent': 'UA-2', 'x-forwarded-for': '10.0.0.2', 'accept-language': 'es' },
    )
    const res = await POST(req, makeParams())
    const data = await res.json()

    expect(res.status).toBe(429)
    expect(data.error).toMatch(/red/i)
  })

  it('Both rate-limits OK → 200', async () => {
    mockedRateLimit.mockResolvedValue({ success: true, remaining: 10 })

    const req = makeRequest(
      { name: 'Test', email: 't@test.com', phone: '+5491111111111' },
      { 'user-agent': 'UA-3', 'x-forwarded-for': '10.0.0.3', 'accept-language': 'es' },
    )
    const res = await POST(req, makeParams())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
  })
})
