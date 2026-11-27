// ============================================================================
// network-pilot.test.ts — piloto de beneficios con grupo de control (etapa 4)
// ============================================================================
// Compra en el emisor → consumidor elegible y asignado (fijo) a un grupo →
// el grupo beneficio recibe la promo → compras en el receptor, canje y
// recompra → métricas por personas. Más: cuenta no verificada fuera, receptor
// suspendido fuera, idempotencia, % de control bloqueado con el piloto en
// marcha y beneficio visible solo para el grupo beneficio.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

import Tenant from '@/models/Tenant'
import User from '@/models/User'
import QrPromo from '@/models/QrPromo'
import NetworkPilotAssignment from '@/models/NetworkPilotAssignment'
import NetworkPilotEvent from '@/models/NetworkPilotEvent'
import { encrypt } from '@/lib/crypto'
import { addMember, updateMember, createRelation, createCampaign, updateCampaign, NetworkError } from '@/lib/network/admin'
import { recordOrderForPilot, pilotMetrics, networkBenefitForTracking, __resetPilotCacheForTests } from '@/lib/network/pilot'

const actor = { userId: null, name: 'SA test' }
const PRE_HASHED = '$2b$12$' + 'a'.repeat(53)
// lib/crypto lee la clave en base64 (32 bytes); el setup trae otra para otros tests.
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
let keke: any
let helado: any
let promo: any
let campaign: any

async function consumer(email: string, verified = true) {
  // Hash bcrypt ya armado: el modelo no lo vuelve a cifrar (cifrar con costo 12 tarda segundos por usuario).
  return User.create({ name: email, email, password: PRE_HASHED, phone: `+54911${Math.floor(Math.random() * 1e8)}`, role: 'consumer', tenantId: null, emailVerified: verified ? new Date() : null })
}
const order = (tenant: any, email: string, over: Record<string, unknown> = {}) => ({
  _id: new mongoose.Types.ObjectId(), tenantId: tenant._id, status: 'confirmed', total: 1_000_000,
  customer: { email: encrypt(email) }, createdAt: new Date(), ...over,
})

beforeEach(async () => {
  __resetPilotCacheForTests()
  keke = await Tenant.create({ slug: 'keke', name: 'Keke & Larry', isActive: true, status: 'active', plan: 'full' })
  helado = await Tenant.create({ slug: 'helado', name: 'Heladería', isActive: true, status: 'active', plan: 'full' })
  for (const t of [keke, helado]) {
    await addMember({ tenantId: String(t._id) }, actor)
    await updateMember(String(t._id), { action: 'approve' }, actor)
  }
  await createRelation({ emitterTenantId: String(keke._id), receiverTenantId: String(helado._id) }, actor)
  promo = await QrPromo.create({ tenantId: helado._id, scope: 'tenant', slug: 'red-keke', title: '15% en helados', isEnabled: true, discountPercentage: 15 })
  campaign = await createCampaign({
    receiverTenantId: String(helado._id), title: '15% en helados', benefit: { type: 'percent', value: 15 },
    validFrom: new Date(Date.now() - 86_400_000).toISOString(), status: 'active',
    pilot: { enabled: true, controlPercent: 50, qrPromoId: String(promo._id), windowDays: 30 },
  }, actor)
})

describe('piloto con grupo de control', () => {
  it('flujo completo: elegible → grupo fijo → beneficio → compra, canje y recompra en el receptor', async () => {
    // Varios consumidores para tener los dos grupos (50 % de control).
    const users = await Promise.all(Array.from({ length: 12 }, (_, i) => consumer(`c${i}@t.test`)))
    for (const u of users) await recordOrderForPilot(order(keke, u.email))
    const assignments = await NetworkPilotAssignment.find({ campaignId: campaign._id }).lean() as any[]
    expect(assignments).toHaveLength(12)
    const treated = assignments.filter(a => a.group === 'treatment')
    const control = assignments.filter(a => a.group === 'control')
    expect(treated.length).toBeGreaterThan(0)
    expect(control.length).toBeGreaterThan(0)

    // Una segunda compra en el emisor NO cambia el grupo (asignación persistente).
    const u0 = users[0]
    const before = assignments.find(a => String(a.consumerUserId) === String(u0._id))
    await recordOrderForPilot(order(keke, u0.email))
    const after = await NetworkPilotAssignment.find({ campaignId: campaign._id, consumerUserId: u0._id }).lean() as any[]
    expect(after).toHaveLength(1)
    expect(after[0].group).toBe(before.group)

    // Solo el grupo beneficio recibe el beneficio.
    expect(await NetworkPilotEvent.countDocuments({ campaignId: campaign._id, type: 'issued', group: 'control' })).toBe(0)
    expect(await NetworkPilotEvent.countDocuments({ campaignId: campaign._id, type: 'issued' })).toBeGreaterThanOrEqual(treated.length)

    // Compras en el receptor: un tratado canjea y vuelve a comprar; un control compra sin promo.
    const tUser = users.find(u => String(u._id) === String(treated[0].consumerUserId))!
    const cUser = users.find(u => String(u._id) === String(control[0].consumerUserId))!
    const r1 = await recordOrderForPilot(order(helado, tUser.email, { qrPromoId: String(promo._id), total: 800_000 }))
    expect(r1).toMatchObject({ receiverPurchases: 1, redeemed: 1 })
    await recordOrderForPilot(order(helado, tUser.email, { total: 500_000 }))
    await recordOrderForPilot(order(helado, cUser.email, { total: 600_000 }))

    const m = await pilotMetrics(String(campaign._id))
    expect(m.assignments).toBe(12)
    expect(m.treatment).toMatchObject({ buyers: 1, orders: 2, revenueCents: 1_300_000, redemptions: 1, repeatBuyers: 1 })
    expect(m.control).toMatchObject({ buyers: 1, orders: 1, revenueCents: 600_000, redemptions: 0, issued: 0 })
  })

  it('idempotente: reprocesar el mismo pedido no duplica nada', async () => {
    const u = await consumer('dup@t.test')
    const o = order(keke, u.email)
    await recordOrderForPilot(o)
    await recordOrderForPilot(o)
    const events = await NetworkPilotEvent.find({ orderId: String(o._id) }).lean()
    expect(events.filter((e: any) => e.type === 'eligible')).toHaveLength(1)
  })

  it('sin cuenta con email verificado no entra; tampoco si se suspende la recepción', async () => {
    const unverified = await consumer('nover@t.test', false)
    expect((await recordOrderForPilot(order(keke, unverified.email))).eligible).toBe(0)
    expect((await recordOrderForPilot(order(keke, 'sin-cuenta@t.test'))).eligible).toBe(0)

    await updateMember(String(helado._id), { action: 'suspend_receiving', reason: 'debt', note: 'Deuda de comisiones' }, actor)
    const u = await consumer('ok@t.test')
    expect((await recordOrderForPilot(order(keke, u.email))).eligible).toBe(0)
    // La heladería sigue operando normalmente (la suspensión es solo de la red).
    expect((await Tenant.findById(helado._id).lean() as any).status).toBe('active')
  })

  it('el beneficio se muestra en el seguimiento solo al grupo beneficio, con el link a la promo', async () => {
    const users = await Promise.all(Array.from({ length: 10 }, (_, i) => consumer(`v${i}@t.test`)))
    const orders = users.map(u => order(keke, u.email))
    for (const o of orders) await recordOrderForPilot(o)
    const assignments = await NetworkPilotAssignment.find({ campaignId: campaign._id }).lean() as any[]
    for (let i = 0; i < users.length; i++) {
      const a = assignments.find(x => String(x.consumerUserId) === String(users[i]._id))
      const benefit = await networkBenefitForTracking(String(orders[i]._id))
      if (a.group === 'treatment') {
        expect(benefit).toMatchObject({ title: '15% en helados', receiverName: 'Heladería', url: '/helado/menu?source=qr&promo=red-keke' })
      } else {
        expect(benefit).toBeNull()
      }
    }
  })

  it('el % de control no se puede cambiar con consumidores asignados; la promo debe ser del receptor', async () => {
    const u = await consumer('lock@t.test')
    await recordOrderForPilot(order(keke, u.email))
    const body = {
      title: campaign.title, benefit: { type: 'percent', value: 15 }, validFrom: campaign.validFrom, status: 'active',
      pilot: { enabled: true, controlPercent: 30, qrPromoId: String(promo._id), windowDays: 30 },
    }
    await expect(updateCampaign(String(campaign._id), body, actor)).rejects.toBeInstanceOf(NetworkError)
    const kekePromo = await QrPromo.create({ tenantId: keke._id, scope: 'tenant', slug: 'keke-promo', title: 'x', isEnabled: true, discountPercentage: 10 })
    await expect(createCampaign({
      receiverTenantId: String(helado._id), title: 'Otra', benefit: { type: 'percent', value: 10 }, validFrom: new Date().toISOString(),
      pilot: { enabled: true, controlPercent: 20, qrPromoId: String(kekePromo._id) },
    }, actor)).rejects.toThrow(/receptor/)
  })
})
