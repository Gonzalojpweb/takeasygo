// ============================================================================
// explore-pageview.test.ts — registro de entradas a la app (CP0, 20/11/2026)
// ============================================================================
// Del 13/11 al 20/11 el inicio no registró pageviews. Ahora: un pageview v2
// por sesión desde el cliente; la precarga del splash no se registra; las
// métricas del SuperAdmin cuentan pageviews solo de la v2 (corte por versión).
// ============================================================================
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

import ExploreEvent from '@/models/ExploreEvent'
import { GET as nearby } from '@/app/api/explore/nearby/route'
import { POST as track } from '@/app/api/explore/track/route'
import { getTgoMetrics } from '@/lib/tgo-metrics'
import { auth } from '@/lib/auth'

beforeEach(() => {
  vi.mocked(auth).mockResolvedValue(null as any)
})

const nearbyReq = (headers: Record<string, string>) =>
  new NextRequest('http://localhost/api/explore/nearby?lat=-34.6037&lng=-58.3816&radius=2000', { headers })

async function settle() {
  // logExploreEvent no se espera en nearby: dar tiempo a que escriba.
  await new Promise((r) => setTimeout(r, 150))
}

describe('nearby', () => {
  it('la precarga del splash (x-tgo-prefetch) no registra nada', async () => {
    const res = await nearby(nearbyReq({ 'x-tgo-prefetch': '1' }))
    expect(res.status).toBe(200)
    await settle()
    expect(await ExploreEvent.countDocuments({})).toBe(0)
  })

  it('una búsqueda real sí se registra, con la sesión del navegador', async () => {
    await nearby(nearbyReq({ 'x-session-id': 'sess-real' }))
    await settle()
    expect(await ExploreEvent.countDocuments({ eventType: 'search', sessionId: 'sess-real' })).toBe(1)
  })
})

describe('pageview de entrada v2', () => {
  const post = (body: Record<string, unknown>) =>
    track(new NextRequest('http://localhost/api/explore/track', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))

  it('se guarda con la vista de entrada, el origen y metadata.v = 2', async () => {
    const res = await post({ sessionId: 's1', eventType: 'pageview', view: 'home', source: 'whatsapp', metadata: { v: 2, entry: true, landingPath: '/app' } })
    expect(res.status).toBe(200)
    const ev = await ExploreEvent.findOne({ sessionId: 's1' }).lean() as any
    expect(ev).toMatchObject({ eventType: 'pageview', view: 'home', source: 'whatsapp', metadata: { v: 2, entry: true } })
  })

  it('métricas del SuperAdmin: solo cuentan las entradas v2, con origen y fecha de inicio', async () => {
    const now = new Date()
    await ExploreEvent.insertMany([
      // pageviews viejos del servidor (cada uno con sesión al azar): no cuentan
      { sessionId: 'old-1', eventType: 'pageview', view: 'home', createdAt: now },
      { sessionId: 'old-2', eventType: 'pageview', view: 'home', createdAt: now },
      // entradas v2
      { sessionId: 'a', eventType: 'pageview', view: 'home', source: 'whatsapp', metadata: { v: 2 }, createdAt: now },
      { sessionId: 'b', eventType: 'pageview', view: 'map', source: 'direct', metadata: { v: 2 }, createdAt: now },
      { sessionId: 'c', eventType: 'pageview', view: 'home', source: 'whatsapp', metadata: { v: 2 }, createdAt: now },
      { sessionId: 'a', eventType: 'click_menu', createdAt: now },
    ])
    const m = await getTgoMetrics(30)
    expect(m.funnel.sessionsWithPageview).toBe(3)
    expect(m.pageviewTracking.legacyPageviews).toBe(2)
    expect(m.pageviewTracking.since).not.toBeNull()
    expect(m.entrySources).toEqual(expect.arrayContaining([{ source: 'whatsapp', sessions: 2 }, { source: 'direct', sessions: 1 }]))
    expect(m.funnel.conversionRate).toBeCloseTo(33.3, 1)
  })
})
