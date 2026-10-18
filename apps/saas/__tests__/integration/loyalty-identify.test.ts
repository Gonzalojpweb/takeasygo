import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'

import Tenant from '@/models/Tenant'
import LoyaltyMember from '@/models/LoyaltyMember'
import { hashPhone } from '@/lib/crypto'
import { rateLimit } from '@/lib/rateLimit'

// setup.ts (integration) mockea rateLimit a "siempre success"; este mock del
// archivo gana y permite ejercitar el 429 con control por test
// (mismo patrón que rate-limit.test.ts sobre el mismo setup).
vi.mock('@/lib/rateLimit', () => ({
  rateLimit: vi.fn(),
  __resetRateLimitForTests: vi.fn(),
}))

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

import { GET } from '@/app/api/[tenant]/loyalty/lookup/route'

const mockedRateLimit = vi.mocked(rateLimit)
const SLUG = 'identify-tenant'
const PHONE = '+5491199990000'

let tenant: Awaited<ReturnType<typeof Tenant.create>>

function callLookup(query: string, headers: Record<string, string> = {}) {
  const req = new NextRequest(`http://localhost/api/${SLUG}/loyalty/lookup${query}`, { headers })
  return GET(req, { params: Promise.resolve({ tenant: SLUG }) })
}

beforeEach(async () => {
  vi.clearAllMocks()
  mockedRateLimit.mockResolvedValue({ success: true, remaining: 9 })

  tenant = await Tenant.create({
    name: 'Identify Tenant',
    slug: SLUG,
    plan: 'full',
    status: 'active',
    isActive: true,
    loyalty: { enabled: true, clubName: 'Club Test', welcomeMessage: '¡Hola!' },
  })
  await LoyaltyMember.create({
    tenantId: tenant._id,
    name: 'Juan Carlos Pérez',
    phone: PHONE,
    phoneHash: hashPhone(PHONE),
    email: 'juan@test.com',
    status: 'active',
    loyalty: { points: 320, tier: 'bronze' },
    cache: { totalOrders: 9, totalSpent: 9999 },
  })
})

describe('GET /loyalty/lookup?scope=identify', () => {
  it('devuelve SOLO primer nombre y puntos — nada más', async () => {
    const res = await callLookup(`?phone=${encodeURIComponent(PHONE)}&scope=identify`)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(Object.keys(body)).toEqual(['member'])
    expect(Object.keys(body.member).sort()).toEqual(['firstName', 'points'])
    expect(body.member.firstName).toBe('Juan')
    expect(body.member.points).toBe(320)

    // Nada de apellido, saldo pendiente, tier, historial, club ni wallet
    const raw = JSON.stringify(body)
    expect(raw).not.toContain('Pérez')
    expect(raw).not.toContain('Carlos')
    expect(raw).not.toContain('publicId')
    expect(raw).not.toContain('totalOrders')
    expect(raw).not.toContain('tier')
    expect(raw).not.toContain('club')
    expect(raw).not.toContain('wallet')
  })

  it('rate limit: 429 cuando el límite por IP+tenant devuelve success=false', async () => {
    mockedRateLimit.mockResolvedValueOnce({ success: false, remaining: 0 })

    const res = await callLookup(
      `?phone=${encodeURIComponent(PHONE)}&scope=identify`,
      { 'x-forwarded-for': '203.0.113.7' }
    )
    expect(res.status).toBe(429)
    expect(await res.json()).toMatchObject({ error: expect.any(String) })

    // Clave y límite esperados: 10 req/min por IP y tenant, ANTES de tocar la DB
    expect(mockedRateLimit).toHaveBeenCalledWith(
      `loyalty-identify:${SLUG}:203.0.113.7`,
      10,
      60_000
    )
  })

  it('404 de miembro con scope=identify: solo {error}, sin datos', async () => {
    const res = await callLookup(`?phone=${encodeURIComponent('+5491100001111')}&scope=identify`)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(Object.keys(body)).toEqual(['error'])
  })

  it('sin scope: el payload completo queda EXACTO igual que siempre (checkout intacto)', async () => {
    const res = await callLookup(`?phone=${encodeURIComponent(PHONE)}`)
    expect(res.status).toBe(200)

    const body = await res.json()
    // Shape que consumen CheckoutContext/CheckoutForm/StoreCarousel/club lookup
    expect(body.member).toMatchObject({
      name: 'Juan Carlos Pérez',
      points: 320,
      pointsPendingToConsolidate: 0,
      hasAdvanceActive: false,
      tier: 'bronze',
      totalOrders: 9,
      totalSpent: 9999,
    })
    expect(body.member.publicId).toBeTruthy()
    expect(body.member.joinedAt).toBeTruthy()
    expect(body.club).toMatchObject({ name: 'Club Test', welcomeMessage: '¡Hola!' })
    expect(body.wallet).toHaveProperty('enabled')
    // Sin scope no existe el nuevo modo ni su rate limit
    expect(body.member).not.toHaveProperty('firstName')
    expect(mockedRateLimit).not.toHaveBeenCalled()
  })
})
