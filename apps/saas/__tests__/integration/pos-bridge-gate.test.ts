import { describe, it, expect, beforeEach, vi } from 'vitest'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { shouldBridgeToPos } from '@/lib/order-side-effects'

/**
 * ¿El pedido de la App va al POS? (2026-10-25)
 * En producción 5 de 6 comercios con pedidos tenían el flag «POS habilitado»
 * apagado: un POS en uso sin el flag nunca recibía los pedidos. Ahora alcanza
 * con el flag O con un POS conectado a la sede en los últimos 30 días.
 */

let tenant: { _id: unknown; features?: { posEnabled?: boolean } }
let locationId: string

beforeEach(async () => {
  const t = await Tenant.create({ name: 'Pesceria', slug: 'pesceria', plan: 'full' })
  tenant = { _id: t._id, features: { posEnabled: false } }
  locationId = String((await Location.create({ tenantId: t._id, name: 'Palermo', slug: 'palermo', address: 'Calle 1', isActive: true }))._id)
})

describe('puente SaaS → POS', () => {
  it('con el flag del superadmin, siempre', async () => {
    expect(await shouldBridgeToPos({ ...tenant, features: { posEnabled: true } } as never, locationId)).toBe(true)
  })

  it('sin el flag pero con un POS conectado a la sede hace poco, también', async () => {
    await Location.updateOne({ _id: locationId }, { $set: { 'pos.lastSeenAt': new Date(Date.now() - 2 * 60 * 60 * 1000) } })
    expect(await shouldBridgeToPos(tenant as never, locationId)).toBe(true)
  })

  it('sin el flag y con el POS sin conectarse hace más de 30 días (o nunca), no', async () => {
    expect(await shouldBridgeToPos(tenant as never, locationId)).toBe(false)
    await Location.updateOne({ _id: locationId }, { $set: { 'pos.lastSeenAt': new Date(Date.now() - 45 * 24 * 60 * 60 * 1000) } })
    expect(await shouldBridgeToPos(tenant as never, locationId)).toBe(false)
  })

  it('el POS de otra sede no cuenta', async () => {
    const other = await Location.create({ tenantId: tenant._id, name: 'Norte', slug: 'norte', address: 'Calle 2', isActive: true, pos: { lastSeenAt: new Date() } })
    expect(String(other._id)).not.toBe(locationId)
    expect(await shouldBridgeToPos(tenant as never, locationId)).toBe(false)
  })
})
