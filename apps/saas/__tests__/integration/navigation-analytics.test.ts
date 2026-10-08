import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'

import Tenant from '@/models/Tenant'
import CustomerEvent from '@/models/CustomerEvent'
import { GET } from '@/app/api/[tenant]/analytics/navigation/route'
import { clearNavigationCache } from '@/lib/analytics/navigation-cache'
import { requireAuth } from '@/lib/apiAuth'
import { canAccess } from '@/lib/plans'

/**
 * GET /api/[tenant]/analytics/navigation — agregaciones de navegación sobre
 * `customerevents`: totales por tipo (con sesiones únicas), serie diaria,
 * top de platos (views/adds), embudo de conversión y cache 60s por tenant+days.
 */

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/apiAuth', () => ({
  requireAuth: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/plans', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/plans')>()
  return { ...orig, canAccess: vi.fn().mockReturnValue(true) }
})

const SLUG = 'nav-test'
const MENU_ID = '666666666666666666666666'
const ITEM_NAME = 'Mejillones rebozados'
const SESSION_A = 'sess-a'
const SESSION_B = 'sess-b'

let tenantId: unknown

function get(query = '') {
  const request = new NextRequest(`http://localhost/api/${SLUG}/analytics/navigation${query}`)
  return GET(request, { params: Promise.resolve({ tenant: SLUG }) })
}

function daysAgo(n: number): Date {
  const d = new Date()
  d.setUTCHours(12, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - n)
  return d
}

function baseEvent(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    tenantId,
    phoneHash: '',
    metadata: { source: 'client_side' },
    ...overrides,
  }
}

beforeEach(async () => {
  clearNavigationCache()
  vi.mocked(requireAuth).mockResolvedValue(null)
  vi.mocked(canAccess).mockReturnValue(true)

  const tenant = await Tenant.create({
    name: 'Nav Test',
    slug: SLUG,
    plan: 'full',
    status: 'active',
    isActive: true,
    pointsConfig: { welcomePoints: 100 },
    paymentSurcharges: { cash: { feePercent: 0 }, transfer: { feePercent: 0 }, mercadopago: { feePercent: 0 } },
  })
  tenantId = tenant._id

  await CustomerEvent.insertMany([
    baseEvent({ type: 'menu_opened', createdAt: daysAgo(0), metadata: { source: 'client_side', sessionId: SESSION_A } }),
    baseEvent({ type: 'menu_opened', createdAt: daysAgo(0), metadata: { source: 'client_side', sessionId: SESSION_A } }),
    baseEvent({ type: 'menu_opened', createdAt: daysAgo(0), metadata: { source: 'client_side', sessionId: SESSION_B } }),
    baseEvent({ type: 'menu_opened', createdAt: daysAgo(2), metadata: { source: 'client_side', sessionId: SESSION_B } }),

    baseEvent({ type: 'product_view', createdAt: daysAgo(0), data: { menuItemId: MENU_ID, itemName: ITEM_NAME }, metadata: { source: 'client_side', sessionId: SESSION_A } }),
    baseEvent({ type: 'product_view', createdAt: daysAgo(0), data: { menuItemId: MENU_ID, itemName: ITEM_NAME }, metadata: { source: 'client_side', sessionId: SESSION_B } }),
    baseEvent({ type: 'product_view', createdAt: daysAgo(2), data: { menuItemId: MENU_ID, itemName: ITEM_NAME }, metadata: { source: 'client_side', sessionId: SESSION_B } }),
    // Fuera de la ventana de 7 días: no debe contarse
    baseEvent({ type: 'product_view', createdAt: daysAgo(10), data: { menuItemId: MENU_ID, itemName: ITEM_NAME }, metadata: { source: 'client_side', sessionId: SESSION_A } }),

    baseEvent({ type: 'cart_add', createdAt: daysAgo(0), data: { menuItemId: MENU_ID, itemName: ITEM_NAME, quantity: 1 }, metadata: { source: 'client_side', sessionId: SESSION_A } }),
    baseEvent({ type: 'checkout_started', createdAt: daysAgo(0), metadata: { source: 'client_side', sessionId: SESSION_A } }),
    baseEvent({ type: 'checkout_submitted', createdAt: daysAgo(0), metadata: { source: 'client_side', sessionId: SESSION_A } }),
    baseEvent({ type: 'checkout_completed', createdAt: daysAgo(0), metadata: { source: 'order', sessionId: SESSION_A } }),
    // Server-side sin sesión: no aporta sesiones únicas
    baseEvent({ type: 'reward_viewed', createdAt: daysAgo(0), metadata: { source: 'client_side', sessionId: '' } }),
  ])
})

describe('GET /api/[tenant]/analytics/navigation', () => {
  it('devuelve totales por tipo con sesiones únicas y excluye fuera de ventana', async () => {
    const res = await get('?days=7')
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.period.days).toBe(7)
    expect(body.uniqueSessions).toBe(2)

    const totals = Object.fromEntries(
      body.totals.map((row: { type: string; count: number; uniqueSessions: number }) => [
        row.type,
        { count: row.count, uniqueSessions: row.uniqueSessions },
      ]),
    )
    expect(totals.menu_opened).toEqual({ count: 4, uniqueSessions: 2 })
    expect(totals.product_view).toEqual({ count: 3, uniqueSessions: 2 })
    expect(totals.cart_add).toEqual({ count: 1, uniqueSessions: 1 })
    expect(totals.cart_remove).toEqual({ count: 0, uniqueSessions: 0 })
    expect(totals.checkout_started).toEqual({ count: 1, uniqueSessions: 1 })
    expect(totals.checkout_submitted).toEqual({ count: 1, uniqueSessions: 1 })
    expect(totals.checkout_completed).toEqual({ count: 1, uniqueSessions: 1 })
    expect(totals.reward_viewed).toEqual({ count: 1, uniqueSessions: 0 })
    expect(totals.reward_interaction).toEqual({ count: 0, uniqueSessions: 0 })
  })

  it('devuelve la serie diaria completa (7 días) con totales', async () => {
    const res = await get('?days=7')
    const body = await res.json()

    expect(body.daily).toHaveLength(7)
    const totalEvents = body.daily.reduce(
      (sum: number, day: { total: number }) => sum + day.total,
      0,
    )
    expect(totalEvents).toBe(12)

    const today = body.daily[body.daily.length - 1]
    expect(today.counts.menu_opened).toBe(3)
    expect(today.counts.product_view).toBe(2)
  })

  it('devuelve top de platos por views y por adds', async () => {
    const res = await get('?days=7')
    const body = await res.json()

    expect(body.topItems.views).toEqual([
      { menuItemId: MENU_ID, name: ITEM_NAME, count: 3 },
    ])
    expect(body.topItems.adds).toEqual([
      { menuItemId: MENU_ID, name: ITEM_NAME, count: 1 },
    ])
  })

  it('devuelve el embudo de conversión con porcentajes', async () => {
    const res = await get('?days=7')
    const body = await res.json()

    expect(body.conversion).toEqual({
      menuToView: 75,
      viewToAdd: 33.3,
      addToCheckout: 100,
      checkoutToSubmitted: 100,
      submittedToCompleted: 100,
    })
  })

  it('sirve desde cache en la segunda llamada (TTL 60s)', async () => {
    const first = await get('?days=7')
    expect(first.headers.get('X-Cache')).toBe('MISS')
    expect(first.headers.get('Cache-Control')).toContain('max-age=60')

    const second = await get('?days=7')
    expect(second.headers.get('X-Cache')).toBe('HIT')
    expect(await second.json()).toEqual(await first.json())
  })

  it('clampea ?days a 90 y usa 30 por defecto', async () => {
    const clamped = await get('?days=999')
    const clampedBody = await clamped.json()
    expect(clampedBody.period.days).toBe(90)

    const def = await get()
    const defBody = await def.json()
    expect(defBody.period.days).toBe(30)
  })

  it('devuelve 404 para tenant inexistente', async () => {
    const request = new NextRequest('http://localhost/api/nope/analytics/navigation')
    const res = await GET(request, { params: Promise.resolve({ tenant: 'nope' }) })
    expect(res.status).toBe(404)
  })

  it('propaga 401 cuando requireAuth falla', async () => {
    const { NextResponse } = await import('next/server')
    vi.mocked(requireAuth).mockResolvedValueOnce(
      NextResponse.json({ error: 'No autorizado' }, { status: 401 }),
    )
    const res = await get()
    expect(res.status).toBe(401)
  })

  it('devuelve 403 cuando el plan no tiene acceso a reports', async () => {
    vi.mocked(canAccess).mockReturnValueOnce(false)
    const res = await get()
    expect(res.status).toBe(403)
  })
})
