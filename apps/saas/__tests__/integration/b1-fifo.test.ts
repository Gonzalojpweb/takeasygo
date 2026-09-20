import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import './setup'

import Tenant from '@/models/Tenant'
import LoyaltyMember from '@/models/LoyaltyMember'
import User from '@/models/User'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

import { POST } from '@/app/api/[tenant]/loyalty/register/route'

function makeRequest(body: Record<string, any>, headers: Record<string, string> = {}) {
  const url = 'http://localhost:3000/api/test-tenant/loyalty/register'
  const req = new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  return req as any
}

function makeParams(tenantSlug = 'test-tenant') {
  return { params: Promise.resolve({ tenant: tenantSlug }) }
}

function deviceHeader(ua: string, ip: string, lang: string) {
  return {
    'user-agent': ua,
    'x-forwarded-for': ip,
    'accept-language': lang,
  }
}

let tenant: any

beforeEach(async () => {
  tenant = await Tenant.create({
    name: 'Test Tenant',
    slug: 'test-tenant',
    plan: 'full',
    pointsConfig: { welcomePoints: 100 },
  })
})

describe('B1 — FIFO de 3 + desbloqueo member', () => {
  it('Test 1: POST phone A + device D1 → 200, token, deviceFingerprints = [D1]', async () => {
    const req = makeRequest(
      { name: 'User A', email: 'a@test.com', phone: '+5491111111111' },
      deviceHeader('UA-D1', '192.168.1.1', 'es-AR'),
    )
    const res = await POST(req, makeParams())
    const data = await res.json()

    expect(data.success).toBe(true)
    expect(data.memberToken).toBeTruthy()
    expect(data.reissued).toBeUndefined()

    const member = await LoyaltyMember.findOne({ tenantId: tenant._id })
    expect(member).toBeTruthy()
    expect((member as any).deviceFingerprints).toHaveLength(1)
  })

  it('Test 2: POST phone A + device D2 → 200, token, deviceFingerprints = [D1, D2]', async () => {
    // First registration
    await POST(
      makeRequest(
        { name: 'User A', email: 'a@test.com', phone: '+5491111111111' },
        deviceHeader('UA-D1', '192.168.1.1', 'es-AR'),
      ),
      makeParams(),
    )

    // Second registration with different device
    const req = makeRequest(
      { name: 'User A', email: 'a@test.com', phone: '+5491111111111' },
      deviceHeader('UA-D2', '192.168.1.2', 'es-AR'),
    )
    const res = await POST(req, makeParams())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.memberToken).toBeTruthy()
    expect(data.reissued).toBe(true)

    const member = await LoyaltyMember.findOne({ tenantId: tenant._id })
    expect((member as any).deviceFingerprints).toHaveLength(2)
  })

  it('Test 3: POST phone A + device D3 → 200, deviceFingerprints = [D1, D2, D3]', async () => {
    // Register D1, D2, D3
    for (const d of ['UA-D1', 'UA-D2', 'UA-D3']) {
      await POST(
        makeRequest(
          { name: 'User A', email: 'a@test.com', phone: '+5491111111111' },
          deviceHeader(d, `192.168.1.${d.slice(-1)}`, 'es-AR'),
        ),
        makeParams(),
      )
    }

    const member = await LoyaltyMember.findOne({ tenantId: tenant._id })
    expect((member as any).deviceFingerprints).toHaveLength(3)
  })

  it('Test 4: POST phone A + device D4 → 200, FIFO: D1 dropped', async () => {
    // Register D1, D2, D3, D4
    const devices = ['UA-D1', 'UA-D2', 'UA-D3', 'UA-D4']
    for (const d of devices) {
      await POST(
        makeRequest(
          { name: 'User A', email: 'a@test.com', phone: '+5491111111111' },
          deviceHeader(d, `192.168.1.${d.slice(-1)}`, 'es-AR'),
        ),
        makeParams(),
      )
    }

    const member = await LoyaltyMember.findOne({ tenantId: tenant._id })
    const fps = (member as any).deviceFingerprints
    expect(fps).toHaveLength(3)
    // D1 should be dropped, array should contain D2, D3, D4
    const d1Hash = await generateHash('UA-D1', '192.168.1.1', 'es-AR')
    expect(fps).not.toContain(d1Hash)
  })

  it('Test 5: POST phone A + device D2 (ya en array) → 200, sin cambio en array', async () => {
    // Register D1, D2
    await POST(
      makeRequest(
        { name: 'User A', email: 'a@test.com', phone: '+5491111111111' },
        deviceHeader('UA-D1', '192.168.1.1', 'es-AR'),
      ),
      makeParams(),
    )
    await POST(
      makeRequest(
        { name: 'User A', email: 'a@test.com', phone: '+5491111111111' },
        deviceHeader('UA-D2', '192.168.1.2', 'es-AR'),
      ),
      makeParams(),
    )

    const memberBefore = await LoyaltyMember.findOne({ tenantId: tenant._id })
    const fpsBefore = JSON.stringify((memberBefore as any).deviceFingerprints)

    // Re-register with D2 (already in array)
    await POST(
      makeRequest(
        { name: 'User A', email: 'a@test.com', phone: '+5491111111111' },
        deviceHeader('UA-D2', '192.168.1.2', 'es-AR'),
      ),
      makeParams(),
    )

    const memberAfter = await LoyaltyMember.findOne({ tenantId: tenant._id })
    const fpsAfter = JSON.stringify((memberAfter as any).deviceFingerprints)
    expect(fpsAfter).toBe(fpsBefore)
  })

  it('Test 6: POST phone B + device D1 en <24h → 429 (rate-limit device)', async () => {
    const { rateLimit } = await import('@/lib/rateLimit')
    ;(rateLimit as any).mockResolvedValueOnce({ success: false, remaining: 0 })

    const req = makeRequest(
      { name: 'User B', email: 'b@test.com', phone: '+5492222222222' },
      deviceHeader('UA-D1', '192.168.1.1', 'es-AR'),
    )
    const res = await POST(req, makeParams())
    const data = await res.json()

    expect(res.status).toBe(429)
    expect(data.error).toMatch(/dispositivo/i)

    ;(rateLimit as any).mockResolvedValue({ success: true, remaining: 0 })
  })
})

async function generateHash(ua: string, ip: string, lang: string) {
  const crypto = await import('crypto')
  const ipPrefix = ip.split('.').slice(0, 3).join('.')
  return crypto.createHash('sha256').update(`${ua}|${ipPrefix}|${lang}`).digest('hex').slice(0, 32)
}
