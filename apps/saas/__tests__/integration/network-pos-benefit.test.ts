// ============================================================================
// network-pos-benefit.test.ts — canje de la red desde la app del POS (etapa 6)
// ============================================================================
// Validar sin canjear, canjear y descontar la cuenta por el camino de los
// descuentos (evento del reporte), reintento sin doble canje, cuenta con otro
// descuento, sin internet, y beneficio devuelto ante una falla técnica.
// ============================================================================

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import User from '@/models/User'
import Order from '@/models/Order'
import NetworkBenefit from '@/models/NetworkBenefit'
import NetworkLedgerEntry from '@/models/NetworkLedgerEntry'
import PosDiscountEvent from '@/models/PosDiscountEvent'
import { signJwt } from '@takeasygo/business/jwt'
import { __resetPosJwtKeyCacheForTests } from '@/lib/posJwt'
import { auth } from '@/lib/auth'
import { encrypt } from '@/lib/crypto'
import { addMember, updateMember, createRelation, createCampaign, createAgreementVersion } from '@/lib/network/admin'
import { issueBenefitsForOrder, currentBenefitCode, redeemBenefit, reverseRedemption, __resetEngineCacheForTests } from '@/lib/network/engine'
import { POST as createOrder } from '@/app/api/[tenant]/pos/orders/route'
import { POST as discount } from '@/app/api/[tenant]/pos/orders/[id]/discounts/route'
import { POST as networkBenefit } from '@/app/api/[tenant]/pos/orders/[id]/network-benefit/route'

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
const PRE_HASHED = '$2b$12$' + 'a'.repeat(53)
const SLUG = 'heladeria-pos'
const HELADO = '64b0000000000000000000d1'
const actor = { userId: null, name: 'SA test' }
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64')

let tenantId: string
let locationId: string
let cashierId: string
let managerId: string
let consumerId: string
let benefitId: string

function req(url: string, body: unknown, opts: { role?: string; headers?: Record<string, string> } = {}): NextRequest {
  const role = opts.role ?? 'cashier'
  const token = signJwt({ sub: role === 'manager' ? managerId : cashierId, tenantId, role, deviceType: 'hub' }, PRIVATE_PEM)
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'x-location-id': locationId, ...(opts.headers ?? {}) },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}
const base = `http://localhost:3000/api/${SLUG}/pos/orders`
const p = (id?: string) => ({ params: Promise.resolve(id ? { tenant: SLUG, id } : { tenant: SLUG }) }) as never
const send = (posId: string, body: Record<string, unknown>, opts?: Parameters<typeof req>[2]) => networkBenefit(req(`${base}/${posId}/network-benefit`, body, opts), p(posId))
const code = async () => (await currentBenefitCode(consumerId, benefitId)).manual
const errorOf = async (res: Response) => ((await res.json()) as { error: { code: string; message: string } }).error

/** Cuenta de $350 (35000 centavos). */
async function newOrder() {
  const posId = crypto.randomUUID()
  const res = await createOrder(req(base, { id: posId, items: [{ productId: HELADO, name: 'Helado 1 kg', quantity: 1, unitPrice: 35000, total: 35000 }] }), p())
  expect(res.status).toBe(201)
  return posId
}

beforeAll(() => {
  process.env.POS_JWT_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }) as string
  __resetPosJwtKeyCacheForTests()
})

beforeEach(async () => {
  __resetEngineCacheForTests()
  ;(auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)
  const receiver = await Tenant.create({ name: 'Heladería', slug: SLUG, plan: 'full', isActive: true, status: 'active', features: { posEnabled: true } })
  const emitter = await Tenant.create({ name: 'Hamburguesería', slug: 'emisor-pos', plan: 'full', isActive: true, status: 'active' })
  tenantId = String(receiver._id)
  locationId = String((await Location.create({ tenantId, name: 'Centro', slug: 'centro', address: 'Calle 1', isActive: true }))._id)
  await Menu.create({ tenantId, locationId, isActive: true, categories: [{ name: 'Helados', sortOrder: 0, items: [{ _id: HELADO, name: 'Helado 1 kg', price: 35000 }] }] })
  const staff = (role: string, name: string) => User.create({ name, email: `${name}@t.test`, password: PRE_HASHED, phone: `+54911${Math.floor(Math.random() * 1e8)}`, role, tenantId, isActive: true })
  cashierId = String((await staff('cashier', 'caja'))._id)
  managerId = String((await staff('manager', 'encargada'))._id)

  for (const t of [receiver, emitter]) {
    await addMember({ tenantId: String(t._id) }, actor)
    await updateMember(String(t._id), { action: 'approve' }, actor)
  }
  await createRelation({ emitterTenantId: String(emitter._id), receiverTenantId: tenantId }, actor)
  await createAgreementVersion({ receiverTenantId: tenantId, commissionPercent: 5, debtThresholdCents: 5_000_000 }, actor)
  await createCampaign({
    receiverTenantId: tenantId, title: '10% en helados', benefit: { type: 'percent', value: 10, maxDiscountCents: 100_000 },
    minPurchaseCents: 10_000, validFrom: new Date(Date.now() - 86_400_000).toISOString(), status: 'active', perConsumerLimit: 1,
  }, actor)

  const consumer = await User.create({ name: 'Ana', email: 'ana@t.test', password: PRE_HASHED, phone: '+5491100000001', role: 'consumer', tenantId: null, emailVerified: new Date() })
  consumerId = String(consumer._id)
  await issueBenefitsForOrder({ _id: new mongoose.Types.ObjectId(), tenantId: emitter._id, status: 'confirmed', customer: { email: encrypt('ana@t.test') } })
  benefitId = String((await NetworkBenefit.findOne({ consumerUserId: consumer._id }).lean() as any)._id)
})

describe('canje desde el POS', () => {
  it('validar no canjea; aplicar descuenta la cuenta, registra el evento y la comisión; el reintento no canjea dos veces', async () => {
    const posId = await newOrder()
    const c = await code()
    const preview = await send(posId, { code: c, dryRun: true })
    expect(preview.status).toBe(200)
    expect((await preview.json()).preview).toMatchObject({ discountCents: 3500, discountedTotalCents: 31500 })
    expect(await NetworkLedgerEntry.countDocuments()).toBe(0)

    const res = await send(posId, { code: c })
    expect(res.status).toBe(200)
    expect((await res.json()).discountedCents).toBe(3500)
    const order = await Order.findOne({ tenantId, posId }).lean() as any
    expect(order.total).toBe(31500)
    expect(order.items[0].posDiscount).toMatchObject({ reason: 'agreement', amountCents: 3500 })
    expect(await PosDiscountEvent.countDocuments({ tenantId, orderPosId: posId })).toBe(1)
    const ledger = await NetworkLedgerEntry.find().lean() as any[]
    expect(ledger).toHaveLength(1)
    expect(ledger[0]).toMatchObject({ purchaseTotalCents: 35000, discountCents: 3500 })
    expect((await NetworkBenefit.findById(benefitId).lean() as any).status).toBe('redeemed')

    const again = await send(posId, { code: c })
    expect(again.status).toBe(200)
    expect((await again.json()).replayed).toBe(true)
    expect(await NetworkLedgerEntry.countDocuments()).toBe(1)
  })

  it('cuenta con otro descuento: no se canjea y el cliente conserva el beneficio', async () => {
    const posId = await newOrder()
    expect((await discount(req(`${base}/${posId}/discounts`, { kind: 'percent', value: 5, reason: 'courtesy' }, { role: 'manager' }), p(posId))).status).toBe(200)
    const res = await send(posId, { code: await code() })
    expect(res.status).toBe(409)
    expect(await NetworkLedgerEntry.countDocuments()).toBe(0)
    expect((await NetworkBenefit.findById(benefitId).lean() as any).status).toBe('issued')
  })

  it('sin internet no se valida; código inválido → 400', async () => {
    const posId = await newOrder()
    const offline = await send(posId, { code: await code() }, { headers: { 'x-pos-op-id': crypto.randomUUID(), 'x-pos-occurred-at': new Date().toISOString(), 'x-pos-device-id': 'device-x' } })
    expect([403, 409]).toContain(offline.status)
    expect(await NetworkLedgerEntry.countDocuments()).toBe(0)
    const bad = await send(posId, { code: 'nada' })
    expect(bad.status).toBe(400)
    expect((await errorOf(bad)).message).toMatch(/Código inválido/)
  })
})

describe('beneficio devuelto ante falla técnica', () => {
  it('la anulación con devolución deja el beneficio disponible y se puede volver a canjear', async () => {
    const first = await redeemBenefit({ tenantId, code: await code(), purchaseTotalCents: 35000, actorName: 'Caja', requestId: 'r1' })
    await reverseRedemption({ tenantId, ledgerId: String(first.ledgerId), reason: 'No se pudo aplicar el descuento en el POS', actorName: 'Caja', restoreBenefit: true })
    expect((await NetworkBenefit.findById(benefitId).lean() as any).status).toBe('issued')
    const second = await redeemBenefit({ tenantId, code: await code(), purchaseTotalCents: 35000, actorName: 'Caja', requestId: 'r2' })
    expect(second.discountCents).toBe(3500)
    expect(await NetworkLedgerEntry.countDocuments({ type: 'commission' })).toBe(2)
    expect(await NetworkLedgerEntry.countDocuments({ type: 'reversal' })).toBe(1)
  })
})
