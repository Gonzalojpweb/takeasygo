// ============================================================================
// referrals.test.ts — programa «Invitá y ganá» del club
// ============================================================================
// Protege, operación por operación:
//   · qué pasos se cumplen con qué pedidos (pura)
//   · la atribución: link válido, link propio, ya miembro, ya cliente,
//     un solo referidor, límite mensual, campaña cerrada
//   · el registro con la cookie del link (puerta real del club)
//   · los puntos: registro pendiente hasta comprar, cada paso paga una vez,
//     un pedido cancelado revierte su paso
//   · el premio final: canje sin costo en la tienda, una sola vez; si se
//     cae un paso y no se usó, se cancela y devuelve el stock
//   · la pantalla del miembro (token del club) y el link público
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

import Tenant from '@/models/Tenant'
import LoyaltyMember from '@/models/LoyaltyMember'
import Order from '@/models/Order'
import StoreItem from '@/models/StoreItem'
import StoreRedemption from '@/models/StoreRedemption'
import Referral from '@/models/Referral'
import ReferralEvent from '@/models/ReferralEvent'
import ReferralProgram from '@/models/ReferralProgram'
import { hashPhone } from '@/lib/crypto'
import { signMemberToken } from '@/lib/memberToken'
import { attachReferral, computeTargets, ensureReferralCode, syncReferral, syncReferralsForOrder, displayName, type QualifyingOrder } from '@/lib/referrals'
import { POST as registerPost } from '@/app/api/[tenant]/loyalty/register/route'
import { GET as meGet } from '@/app/api/[tenant]/referrals/me/route'
import { GET as codeGet } from '@/app/api/[tenant]/referrals/code/[code]/route'
import { POST as identifyPost } from '@/app/api/[tenant]/referrals/identify/route'
import { GET as adminGet, PUT as adminPut } from '@/app/api/[tenant]/admin/referrals/route'
import User from '@/models/User'
import { auth } from '@/lib/auth'

const SLUG = 'pizzeria-ref'
let tenant: { _id: mongoose.Types.ObjectId }
let pedro: { _id: mongoose.Types.ObjectId; referralCode?: string }
let item: { _id: mongoose.Types.ObjectId }
const DAY = 86_400_000

async function member(name: string, phone: string, over: Record<string, unknown> = {}) {
  return LoyaltyMember.create({
    tenantId: tenant._id,
    name,
    phone,
    phoneHash: hashPhone(phone),
    email: `${name.toLowerCase().replace(/\s+/g, '.')}@t.test`,
    status: 'active',
    source: 'qr_scan',
    joinedAt: new Date(),
    ...over,
  })
}

async function order(phone: string, mode: 'takeaway' | 'delivery' | 'dine-in', createdAt: Date, status = 'delivered') {
  return Order.create({
    tenantId: tenant._id,
    locationId: new mongoose.Types.ObjectId(),
    orderNumber: `R-${Math.random().toString(36).slice(2, 9)}`,
    status,
    orderMode: mode,
    items: [{ name: 'Pizza', quantity: 1, basePrice: 1_000_000, extraPrice: 0, price: 1_000_000, subtotal: 1_000_000 }],
    subtotal: 1_000_000,
    total: 1_000_000,
    customer: { name: 'Cliente', phone, phoneHash: hashPhone(phone) },
    payment: { method: 'cash', status: status === 'cancelled' ? 'cancelled' : 'approved' },
    createdAt,
  })
}

async function pointsOf(id: mongoose.Types.ObjectId) {
  return ((await LoyaltyMember.findById(id).lean()) as { loyalty?: { points?: number } } | null)?.loyalty?.points ?? 0
}

async function invite(name: string, phone: string, deviceId?: string) {
  const m = await member(name, phone)
  const r = await attachReferral({ tenantId: tenant._id, invitee: m.toObject(), code: pedro.referralCode!, deviceId })
  return { m, r }
}

beforeEach(async () => {
  tenant = await Tenant.create({
    slug: SLUG,
    name: 'Pizzería',
    isActive: true,
    status: 'active',
    plan: 'full',
    loyalty: { enabled: true, clubName: 'Club Pizzería' },
    pointsConfig: { welcomePoints: 30 },
  })
  item = await StoreItem.create({ tenantId: tenant._id, name: 'Pizza grande gratis', description: 'Pizza grande de muzzarella', imageUrl: 'https://img.test/pizza.jpg', category: 'food', pointsCost: 500, isActive: true, stock: 5 })
  await ReferralProgram.create({
    tenantId: tenant._id,
    enabled: true,
    rewardStoreItemId: item._id,
    tasks: {
      registered: { enabled: true, points: 50 },
      first_online_order: { enabled: true, points: 100 },
      visit: { enabled: true, points: 100 },
      second_order: { enabled: true, points: 150 },
    },
  })
  pedro = await member('Pedro Gómez', '+5491111111111', { email: 'pedro@t.test', deviceFingerprints: ['device-pedro'] })
  pedro.referralCode = await ensureReferralCode(pedro._id, tenant._id)
})

describe('qué pasos cumple cada pedido', () => {
  const o = (mode: string, day: number): QualifyingOrder => ({ _id: new mongoose.Types.ObjectId(), orderMode: mode, createdAt: new Date(Date.UTC(2026, 9, 1) + day * DAY) })
  it('take away primero, salón después, segunda compra dentro del plazo', () => {
    const t = computeTargets([o('takeaway', 0), o('dine-in', 3)], 30)
    expect(t.registered.met && t.first_online_order.met && t.visit.met && t.second_order.met).toBe(true)
  })
  it('primera compra en el local: cuenta la visita, la online todavía no', () => {
    const t = computeTargets([o('dine-in', 0)], 30)
    expect(t.registered.met).toBe(true)
    expect(t.visit.met).toBe(true)
    expect(t.first_online_order.met).toBe(false)
    expect(t.second_order.met).toBe(false)
  })
  it('la segunda compra fuera del plazo no cuenta', () => {
    expect(computeTargets([o('delivery', 0), o('delivery', 31)], 30).second_order.met).toBe(false)
  })
  it('sin pedidos no se cumple nada', () => {
    const t = computeTargets([], 30)
    expect(Object.values(t).some((x) => x.met)).toBe(false)
  })
  it('el que invita ve solo nombre e inicial', () => {
    expect(displayName('Lucía Martínez')).toBe('Lucía M.')
    expect(displayName('  ')).toBe('Invitado')
  })
})

describe('atribución', () => {
  it('un miembro nuevo con el link queda vinculado y el registro queda PENDIENTE', async () => {
    const { r } = await invite('Lucía Martínez', '+5491122222222')
    expect(r).toMatchObject({ attached: true })
    const ev = await ReferralEvent.findOne({ task: 'registered' }).lean()
    expect(ev).toMatchObject({ status: 'pending', points: 50 })
    expect(await pointsOf(pedro._id)).toBe(0) // nada se paga por registrarse solo
  })

  it('no vale el link propio (mismo teléfono, mismo dispositivo o mismo email)', async () => {
    const twin = await member('Pedro Bis', '+5491111111111', { email: 'otro@t.test', locationId: new mongoose.Types.ObjectId() }) // misma persona en otra sede
    expect(await attachReferral({ tenantId: tenant._id, invitee: twin.toObject(), code: pedro.referralCode! })).toMatchObject({ attached: false, reason: 'self' })
    const sameDevice = await member('Otra Persona', '+5491133333333')
    expect(await attachReferral({ tenantId: tenant._id, invitee: sameDevice.toObject(), code: pedro.referralCode!, deviceId: 'device-pedro' })).toMatchObject({ attached: false, reason: 'self' })
  })

  it('no vale invitar a quien ya era cliente del comercio', async () => {
    await order('+5491144444444', 'takeaway', new Date(Date.now() - 20 * DAY))
    const { r } = await invite('Ya Cliente', '+5491144444444')
    expect(r).toMatchObject({ attached: false, reason: 'already_customer' })
  })

  it('un invitado tiene un solo referidor', async () => {
    const { m } = await invite('Lucía Martínez', '+5491122222222')
    const ana = await member('Ana Ruiz', '+5491155555555')
    const anaCode = await ensureReferralCode(ana._id, tenant._id)
    expect(await attachReferral({ tenantId: tenant._id, invitee: m.toObject(), code: anaCode })).toMatchObject({ attached: false, reason: 'duplicate' })
  })

  it('respeta el límite de invitados por mes', async () => {
    await ReferralProgram.updateOne({ tenantId: tenant._id }, { $set: { monthlyInviteLimit: 1 } })
    expect((await invite('Uno Uno', '+5491166666661')).r).toMatchObject({ attached: true })
    expect((await invite('Dos Dos', '+5491166666662')).r).toMatchObject({ attached: false, reason: 'limit' })
  })

  it('con la campaña apagada o vencida no se suman invitados', async () => {
    await ReferralProgram.updateOne({ tenantId: tenant._id }, { $set: { endsAt: new Date(Date.now() - DAY) } })
    expect((await invite('Tarde Tarde', '+5491177777777')).r).toMatchObject({ attached: false, reason: 'program_closed' })
  })

  it('el registro real del club toma el código de la cookie del link', async () => {
    const res = await registerPost(
      new NextRequest(`http://localhost/api/${SLUG}/loyalty/register`, {
        method: 'POST',
        headers: { cookie: `tgo_ref_${SLUG}=${pedro.referralCode}`, 'user-agent': 'telefono-lucia' },
        body: JSON.stringify({ name: 'Lucía Martínez', email: 'lucia@t.test', phone: '+5491122222222' }),
      }),
      { params: Promise.resolve({ tenant: SLUG }) },
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ success: true, referred: true, welcomePoints: 30 })
    expect(await Referral.countDocuments({ tenantId: tenant._id, referrerMemberId: pedro._id })).toBe(1)
  })
})

describe('puntos y premio, paso a paso (Pedro invita a Lucía)', () => {
  const LUCIA = '+5491122222222'

  it('recorrido completo: cada paso paga una vez y al final llega el premio', async () => {
    const { r } = await invite('Lucía Martínez', LUCIA)
    const referralId = (r as { referralId: string }).referralId
    const now = Date.now()

    // Paso 2: primera compra take away → se acredita el registro (50) + compra online (100)
    await order(LUCIA, 'takeaway', new Date(now + 1 * 60_000))
    await syncReferral(referralId)
    expect(await pointsOf(pedro._id)).toBe(150)

    // Idempotente: otra sincronización no paga de nuevo
    await syncReferral(referralId)
    expect(await pointsOf(pedro._id)).toBe(150)

    // Paso 3: va al local (dine-in) → +100. Ese pedido también es la 2.ª compra → +150 y premio
    await order(LUCIA, 'dine-in', new Date(now + 2 * 60_000))
    const s = await syncReferral(referralId)
    expect(await pointsOf(pedro._id)).toBe(400)
    expect(s).toMatchObject({ completed: true, reward: 'granted' })

    const redemption = await StoreRedemption.findOne({ referralId }).lean<{ pointsUsed: number; status: string; memberId: mongoose.Types.ObjectId; expiresAt: Date }>()
    expect(redemption).toMatchObject({ pointsUsed: 0, status: 'pending' })
    expect(String(redemption!.memberId)).toBe(String(pedro._id))
    expect(redemption!.expiresAt.getTime()).toBeGreaterThan(now + 29 * DAY) // vence en 30 días
    expect((await StoreItem.findById(item._id).lean<{ stock: number }>())!.stock).toBe(4)

    // Una sola entrega aunque se vuelva a sincronizar
    await syncReferral(referralId)
    expect(await StoreRedemption.countDocuments({ referralId })).toBe(1)
  })

  it('un pedido cancelado revierte su paso; si el premio no se usó, se cancela y vuelve el stock', async () => {
    const { r } = await invite('Lucía Martínez', LUCIA)
    const referralId = (r as { referralId: string }).referralId
    const now = Date.now()
    await order(LUCIA, 'delivery', new Date(now + 60_000))
    const visit = await order(LUCIA, 'dine-in', new Date(now + 120_000))
    await syncReferralsForOrder(visit.toObject())
    expect(await pointsOf(pedro._id)).toBe(400)

    await Order.updateOne({ _id: visit._id }, { $set: { status: 'cancelled' } })
    const s = await syncReferral(referralId)
    expect(s?.reverted.sort()).toEqual(['second_order', 'visit'])
    expect(await pointsOf(pedro._id)).toBe(150) // quedan registro + compra online
    expect(s?.reward).toBe('revoked')
    expect((await StoreRedemption.findOne({ referralId }).lean<{ status: string }>())!.status).toBe('cancelled')
    expect((await StoreItem.findById(item._id).lean<{ stock: number }>())!.stock).toBe(5)
    expect((await Referral.findById(referralId).lean<{ status: string }>())!.status).toBe('active')

    // Vuelve a ir al local: se acredita de nuevo y el premio se vuelve a entregar
    await order(LUCIA, 'dine-in', new Date(now + 180_000))
    expect(await syncReferral(referralId)).toMatchObject({ completed: true, reward: 'granted' })
    expect(await pointsOf(pedro._id)).toBe(400)
  })

  it('si cancela su única compra, el registro vuelve a pendiente', async () => {
    const { r } = await invite('Lucía Martínez', LUCIA)
    const referralId = (r as { referralId: string }).referralId
    const only = await order(LUCIA, 'takeaway', new Date(Date.now() + 60_000))
    await syncReferral(referralId)
    expect(await pointsOf(pedro._id)).toBe(150)
    await Order.updateOne({ _id: only._id }, { $set: { status: 'cancelled' } })
    await syncReferral(referralId)
    expect(await pointsOf(pedro._id)).toBe(0)
    expect((await ReferralEvent.findOne({ referralId, task: 'registered' }).lean<{ status: string }>())!.status).toBe('pending')
  })

  it('los pedidos que no están entregados no cuentan', async () => {
    const { r } = await invite('Lucía Martínez', LUCIA)
    await order(LUCIA, 'takeaway', new Date(Date.now() + 60_000), 'preparing')
    await syncReferral((r as { referralId: string }).referralId)
    expect(await pointsOf(pedro._id)).toBe(0)
  })

  it('un paso desactivado no es requisito para el premio', async () => {
    await ReferralProgram.updateOne({ tenantId: tenant._id }, { $set: { 'tasks.visit.enabled': false } })
    const { r } = await invite('Lucía Martínez', LUCIA)
    const now = Date.now()
    await order(LUCIA, 'takeaway', new Date(now + 60_000))
    await order(LUCIA, 'delivery', new Date(now + 120_000))
    expect(await syncReferral((r as { referralId: string }).referralId)).toMatchObject({ completed: true, reward: 'granted' })
    expect(await pointsOf(pedro._id)).toBe(300) // 50 + 100 + 150, sin la visita
  })
})

describe('pantallas', () => {
  it('«Invitá y ganá»: el miembro ve su link, los pasos y el avance de cada invitado', async () => {
    await invite('Lucía Martínez', '+5491122222222')
    const token = await signMemberToken(String(pedro._id), String(tenant._id), '+5491111111111', 1)
    const res = await meGet(new NextRequest(`http://localhost/api/${SLUG}/referrals/me`, { headers: { 'x-member-token': token } }), { params: Promise.resolve({ tenant: SLUG }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ open: true, code: pedro.referralCode, stats: { invited: 1, pointsPending: 50 }, program: { reward: { name: 'Pizza grande gratis' } } })
    expect(body.invitees[0]).toMatchObject({ name: 'Lucía M.', steps: { registered: 'pending', first_online_order: 'todo' } })
    expect(JSON.stringify(body)).not.toContain('5491122222222') // ni el teléfono del invitado
  })

  it('identificarse pide teléfono Y email del mismo socio', async () => {
    const P = { params: Promise.resolve({ tenant: SLUG }) }
    const call = (body: object) => identifyPost(new NextRequest('http://localhost/x', { method: 'POST', body: JSON.stringify(body) }), P)
    const ok = await call({ phone: '11 1111 1111', email: 'Pedro@T.test' }) // mayúsculas y formato del celular no importan
    expect(ok.status).toBe(200)
    expect((await ok.json()).memberToken).toBeTruthy()
    const wrong = await call({ phone: '+5491111111111', email: 'otro@t.test' })
    expect(wrong.status).toBe(404)
    expect(await wrong.json()).not.toHaveProperty('memberToken')
  })

  it('el panel del programa: admin y manager configuran; cajero no', async () => {
    const P = { params: Promise.resolve({ tenant: SLUG }) }
    const as = async (role: string) => {
      const u = await User.create({ name: role, email: `${role}-${Math.random().toString(36).slice(2, 7)}@t.test`, password: 'x'.repeat(20), phone: `+54911${Math.floor(Math.random() * 1e8)}`, role, tenantId: tenant._id })
      vi.mocked(auth).mockResolvedValue({ user: { id: String(u._id), role, tenantId: String(tenant._id), assignedLocations: [] }, expires: '' } as never)
    }
    const body = {
      enabled: true,
      tasks: { registered: { enabled: true, points: 10 }, first_online_order: { enabled: true, points: 20 }, visit: { enabled: false, points: 0 }, second_order: { enabled: true, points: 30 } },
      rewardStoreItemId: String(item._id),
      rewardValidityDays: 15,
      secondOrderWindowDays: 45,
      monthlyInviteLimit: 5,
      startsAt: null,
      endsAt: null,
    }
    const put = () => adminPut(new NextRequest('http://localhost/x', { method: 'PUT', body: JSON.stringify(body) }), P)
    await as('cashier')
    expect((await put()).status).toBe(403)
    await as('manager')
    expect((await put()).status).toBe(200)
    const got = await (await adminGet(new NextRequest('http://localhost/x'), P)).json()
    expect(got.program).toMatchObject({ enabled: true, secondOrderWindowDays: 45, tasks: { visit: { enabled: false }, second_order: { points: 30 } } })
    expect(got.storeItems[0]).toMatchObject({ name: 'Pizza grande gratis' })
  })

  it('sin token del club no se ve nada', async () => {
    const res = await meGet(new NextRequest(`http://localhost/api/${SLUG}/referrals/me`), { params: Promise.resolve({ tenant: SLUG }) })
    expect(res.status).toBe(401)
  })

  it('el link público muestra solo el nombre del que invita y los puntos de bienvenida', async () => {
    const res = await codeGet(new NextRequest('http://localhost/x'), { params: Promise.resolve({ tenant: SLUG, code: pedro.referralCode!.toLowerCase() }) })
    const body = await res.json()
    expect(body).toMatchObject({ valid: true, referrerName: 'Pedro', welcomePoints: 30, clubName: 'Club Pizzería' })
    expect(JSON.stringify(body)).not.toContain('5491111111111')
    const bad = await (await codeGet(new NextRequest('http://localhost/x'), { params: Promise.resolve({ tenant: SLUG, code: 'NOEXISTE' }) })).json()
    expect(bad).toMatchObject({ valid: false })
  })
})
