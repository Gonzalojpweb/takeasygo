import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import type { NextRequest } from 'next/server'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Combo from '@/models/Combo'
import CustomerEvent from '@/models/CustomerEvent'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/rateLimit', () => ({ rateLimit: vi.fn().mockResolvedValue({ success: true }) }))

import { POST as postEvents } from '@/app/api/[tenant]/events/route'
import { loadComboReport } from '@/lib/combos/report'

/**
 * Piloto 06/11: el menú online manda combo_impression / combo_opened /
 * combo_add por la ruta pública de eventos (solo comboId + sesión) y el
 * reporte los cuenta por combo y sede.
 */

const SLUG = 'test-tenant'
let tenantId: string
let locationId: string
let comboId: string

function eventsReq(body: unknown): NextRequest {
  return new Request(`http://localhost:3000/api/${SLUG}/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

beforeEach(async () => {
  const tenant = await Tenant.create({ name: 'Test', slug: SLUG, plan: 'full', status: 'active' })
  tenantId = tenant._id.toString()
  const loc = await Location.create({ tenantId, name: 'Centro', slug: 'centro', address: 'Calle 1', isActive: true })
  locationId = loc._id.toString()
  const combo = await Combo.create({
    tenantId, locationId, name: 'Burger + papas', priceMode: 'fixed', fixedPrice: 1_000_000,
    itemPool: [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()], minItems: 2, maxItems: 2,
  })
  comboId = combo._id.toString()
})

describe('eventos de combos → reporte', () => {
  it('la ruta pública acepta los eventos de combo y guarda solo el comboId', async () => {
    const meta = { source: 'client_side', sessionId: 's1', locationId }
    const res = await postEvents(eventsReq({
      events: [
        { type: 'combo_impression', data: { comboId }, metadata: meta },
        { type: 'combo_opened', data: { comboId }, metadata: meta },
        { type: 'combo_add', data: { comboId, amount: 1_000_000, quantity: 1 }, metadata: meta },
      ],
    }), { params: Promise.resolve({ tenant: SLUG }) })
    expect(res.status).toBeLessThan(300)
    // Escritura fire-and-forget: esperar a que se persista.
    for (let i = 0; i < 20 && (await CustomerEvent.countDocuments({ tenantId })) < 3; i++) await new Promise((r) => setTimeout(r, 25))
    const stored = await CustomerEvent.find({ tenantId }).lean()
    expect(stored).toHaveLength(3)
    expect(String(stored[0].data.comboId)).toBe(comboId)
    expect(stored[0].phoneHash).toBe('')

    const report = await loadComboReport(tenantId, locationId, {})
    const row = report.combos.find((c) => c.comboId === comboId)!
    expect(row.impressions).toBe(1)
    expect(row.opens).toBe(1)
    expect(row.addsToCart).toBe(1)
    expect(row.openRate).toBe(1)
  })

  it('un comboId con formato inválido se rechaza', async () => {
    const res = await postEvents(eventsReq({ type: 'combo_opened', data: { comboId: '$ne' }, metadata: { source: 'client_side' } }), { params: Promise.resolve({ tenant: SLUG }) })
    expect(res.status).toBe(400)
  })
})
