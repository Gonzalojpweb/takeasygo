// ============================================================================
// network-traction.test.ts — Clics de la sección TakeasyGO del menú
// ============================================================================
// /api/[tenant]/events acepta network_cta_click solo con destino 'app' o
// 'register'; Superadmin › Tracción de la red ordena los comercios por clics
// y les atribuye las altas que llegaron desde su menú (origen=menu-<slug>).
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/events-server', () => ({ writeCustomerEvent: vi.fn().mockResolvedValue(undefined) }))

import Tenant from '@/models/Tenant'
import CustomerEvent from '@/models/CustomerEvent'
import { POST as postEvents } from '@/app/api/[tenant]/events/route'
import { writeCustomerEvent } from '@/lib/events-server'
import { getNetworkTraction, slugFromOrigen, origenMatchesSlug } from '@/lib/network-traction'

let lumbre: any
let mate: any
beforeEach(async () => {
  vi.clearAllMocks()
  lumbre = await Tenant.create({ slug: 'lumbre', name: 'Lumbre Café', isActive: true, status: 'active', plan: 'full' })
  mate = await Tenant.create({ slug: 'verde-mate', name: 'Verde Mate', isActive: true, status: 'active', plan: 'try' })
})

const click = (tenantId: unknown, source: string, sessionId: string, daysAgo = 0) => ({
  tenantId, type: 'network_cta_click', data: { source },
  metadata: { source: 'client_side', sessionId }, createdAt: new Date(Date.now() - daysAgo * 86_400_000),
})

describe('evento network_cta_click', () => {
  const send = (events: unknown[]) =>
    postEvents(
      new NextRequest('http://localhost/api/lumbre/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ events }) }),
      { params: Promise.resolve({ tenant: 'lumbre' }) },
    )

  it('guarda los clics a la app y a «Sumá tu comercio» y descarta destinos desconocidos', async () => {
    const res = await send([
      { type: 'network_cta_click', data: { source: 'app' }, metadata: { source: 'client_side', sessionId: 's1' } },
      { type: 'network_cta_click', data: { source: 'register' }, metadata: { source: 'client_side', sessionId: 's1' } },
      { type: 'network_cta_click', data: { source: 'hackeo' }, metadata: { source: 'client_side' } },
    ])
    expect(res.status).toBe(201)
    const saved = vi.mocked(writeCustomerEvent).mock.calls.map(c => (c[0].data as { source?: string }).source)
    expect(saved).toEqual(['app', 'register'])
  })
})

describe('ranking de tracción por comercio', () => {
  it('ordena por clics, cuenta personas únicas y atribuye las altas desde el menú', async () => {
    await CustomerEvent.collection.insertMany([
      click(lumbre._id, 'app', 'a'), click(lumbre._id, 'app', 'a'), click(lumbre._id, 'app', 'b'),
      click(lumbre._id, 'register', 'a'),
      click(mate._id, 'app', 'z'),
      click(mate._id, 'register', 'z', 45), // fuera de los 30 días
    ])
    // Dos comercios se registraron desde el menú de Lumbre; uno completó el alta.
    await Tenant.create({ slug: 'nuevo-1', name: 'Nuevo 1', plan: 'trial', status: 'active', onboarding: { status: 'draft', step: 1, origen: 'menu-lumbre' } })
    await Tenant.create({ slug: 'nuevo-2', name: 'Nuevo 2', plan: 'trial', status: 'active', onboarding: { status: 'pending_review', step: 3, origen: 'menu-lumbre' } })

    const t = await getNetworkTraction(30)
    expect(t.rows.map(r => r.slug)).toEqual(['lumbre', 'verde-mate'])
    const l = t.rows[0]
    expect(l).toMatchObject({ appClicks: 3, appPeople: 2, registerClicks: 1, registerPeople: 1, signups: 2, signupsCompleted: 1, total: 4 })
    expect(t.rows[1]).toMatchObject({ appClicks: 1, registerClicks: 0, total: 1 })
    expect(t.totals).toMatchObject({ appClicks: 4, registerClicks: 1, signups: 2 })
  })

  it('el origen se lee aunque el slug venga cortado a 40 caracteres', () => {
    const slug = 'restaurante-con-un-nombre-larguisimo-de-verdad'
    const origen = `menu-${slug}`.slice(0, 40)
    const fromOrigen = slugFromOrigen(origen)!
    expect(origenMatchesSlug(fromOrigen, slug)).toBe(true)
    expect(slugFromOrigen('demo')).toBeNull()
  })
})
