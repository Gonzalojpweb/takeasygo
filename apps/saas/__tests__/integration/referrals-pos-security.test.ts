// ============================================================================
// referrals-pos-security.test.ts — ajustes del programa de referidos
// ============================================================================
//   · POS: el celular del cliente se guarda cifrado + hash al cobrar; el
//     pedido entregado en el salón cuenta como «fue al local» del invitado
//   · Registro del club: el celular solo ya no alcanza para recuperar la
//     sesión de un socio (tiene que coincidir el email)
//   · Avisos: la suscripción se liga al socio del TOKEN, nunca al del cuerpo
// ============================================================================

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Table from '@/models/Table'
import Menu from '@/models/Menu'
import Order from '@/models/Order'
import LoyaltyMember from '@/models/LoyaltyMember'
import ReferralProgram from '@/models/ReferralProgram'
import ReferralEvent from '@/models/ReferralEvent'
import PushSubscription from '@/models/PushSubscription'
import { signJwt } from '@takeasygo/business/jwt'
import { __resetPosJwtKeyCacheForTests } from '@/lib/posJwt'
import { auth } from '@/lib/auth'
import { hashPhone } from '@/lib/crypto'
import { signMemberToken } from '@/lib/memberToken'
import { attachReferral, ensureReferralCode } from '@/lib/referrals'
import { noticeCopy } from '@/lib/referral-notifications'
import { POST as posOrdersPost } from '@/app/api/[tenant]/pos/orders/route'
import { PATCH as posOrderPatch } from '@/app/api/[tenant]/pos/orders/[id]/route'
import { POST as registerPost } from '@/app/api/[tenant]/loyalty/register/route'
import { POST as notificationsPost } from '@/app/api/[tenant]/referrals/notifications/route'

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
const SLUG = 'ref-pos'
const PRODUCT = '64b0000000000000000000aa'
const LUCIA = '+5491122334455'
let tenantId: string
let tablePosId: string

const posAuth = () => ({
  authorization: `Bearer ${signJwt({ sub: '64b0000000000000000000a1', tenantId, role: 'cashier', deviceType: 'hub' }, PRIVATE_PEM)}`,
})
function req(url: string, body?: unknown, headers: Record<string, string> = {}, method = 'POST'): NextRequest {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest
}
const patch = (id: string, body: unknown) =>
  posOrderPatch(req(`http://localhost/api/${SLUG}/pos/orders/${id}`, body, posAuth(), 'PATCH'), { params: Promise.resolve({ tenant: SLUG, id }) })

async function member(name: string, phone: string, email: string) {
  return LoyaltyMember.create({ tenantId, name, phone, phoneHash: hashPhone(phone), email, status: 'active', source: 'qr_scan', joinedAt: new Date() })
}

async function waitFor(check: () => Promise<boolean>, ms = 3000) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (await check()) return true
    await new Promise((r) => setTimeout(r, 50))
  }
  return false
}

beforeAll(() => {
  // lib/crypto espera una clave base64 de 32 bytes (AES-256), como en producción.
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
  process.env.POS_JWT_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }) as string
  __resetPosJwtKeyCacheForTests()
})

beforeEach(async () => {
  vi.mocked(auth).mockResolvedValue(null as never)
  const tenant = await Tenant.create({ name: 'Bodegón', slug: SLUG, plan: 'full', isActive: true, status: 'active', loyalty: { enabled: true } })
  tenantId = tenant._id.toString()
  const loc = await Location.create({ tenantId, name: 'Centro', slug: 'centro', address: 'Calle 1', isActive: true })
  const table = await Table.create({ tenantId, locationId: loc._id, posId: crypto.randomUUID(), number: 1, capacity: 4, status: 'free' })
  tablePosId = table.posId
  await Menu.create({ tenantId, locationId: loc._id, isActive: true, categories: [{ name: 'Platos', sortOrder: 0, items: [{ _id: PRODUCT, name: 'Milanesa', price: 1500 }] }] })
  await ReferralProgram.create({ tenantId, enabled: true })
})

describe('POS: celular del cliente para el club', () => {
  async function posOrder() {
    const res = await posOrdersPost(
      req(`http://localhost/api/${SLUG}/pos/orders`, { id: crypto.randomUUID(), tableId: tablePosId, items: [{ productId: PRODUCT, name: 'Milanesa', quantity: 1, unitPrice: 1500, total: 1500 }] }, posAuth()),
      { params: Promise.resolve({ tenant: SLUG }) },
    )
    expect(res.status).toBe(201)
    return ((await res.json()) as { order: { id: string } }).order.id
  }

  it('se guarda cifrado con su hash; un número inválido se rechaza', async () => {
    const id = await posOrder()
    expect((await patch(id, { customerPhone: '12' })).status).toBe(400)
    expect((await patch(id, { customerPhone: '11 2233-4455' })).status).toBe(200)
    const saved = await Order.findOne({ posId: id }).lean<{ customer: { phone: string; phoneHash: string } }>()
    expect(saved!.customer.phoneHash).toBe(hashPhone(LUCIA))
    expect(saved!.customer.phone).not.toContain('2233') // cifrado, no en texto plano
  })

  it('el pedido del salón cobrado con su celular cuenta como «fue al local» del invitado', async () => {
    const pedro = await member('Pedro Gómez', '+5491111111111', 'pedro@t.test')
    const lucia = await member('Lucía Martínez', LUCIA, 'lucia@t.test')
    const code = await ensureReferralCode(pedro._id, tenantId)
    const r = await attachReferral({ tenantId, invitee: lucia.toObject(), code })
    expect(r).toMatchObject({ attached: true })

    const id = await posOrder()
    expect((await patch(id, { customerPhone: LUCIA })).status).toBe(200)
    for (const status of ['confirmed', 'preparing', 'ready', 'delivered']) {
      expect((await patch(id, { status })).status, status).toBe(200)
    }
    const visited = await waitFor(async () => !!(await ReferralEvent.exists({ task: 'visit', status: 'credited' })))
    expect(visited).toBe(true)
    expect(await ReferralEvent.exists({ task: 'registered', status: 'credited' })).toBeTruthy()
  })
})

describe('registro del club: el celular solo no alcanza', () => {
  const register = (body: object) =>
    registerPost(new NextRequest(`http://localhost/api/${SLUG}/loyalty/register`, { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ tenant: SLUG }) })

  it('con otro email: 409 y sin sesión; con su email: recupera la sesión', async () => {
    await member('Lucía Martínez', LUCIA, 'lucia@t.test')
    const wrong = await register({ name: 'Otra', email: 'intruso@t.test', phone: LUCIA })
    expect(wrong.status).toBe(409)
    const wrongBody = await wrong.json()
    expect(wrongBody).toMatchObject({ code: 'MEMBER_EMAIL_MISMATCH' })
    expect(wrongBody.memberToken).toBeUndefined()

    const ok = await register({ name: 'Lucía', email: 'LUCIA@t.test', phone: LUCIA })
    expect(ok.status).toBe(200)
    expect(await ok.json()).toMatchObject({ reissued: true, memberToken: expect.any(String) })
  })
})

describe('avisos al que invita', () => {
  it('la suscripción queda ligada al socio del token, no al que diga el cuerpo', async () => {
    const pedro = await member('Pedro Gómez', '+5491111111111', 'pedro@t.test')
    const other = new mongoose.Types.ObjectId()
    const token = await signMemberToken(String(pedro._id), tenantId, '+5491111111111', 1)
    const res = await notificationsPost(
      new NextRequest(`http://localhost/api/${SLUG}/referrals/notifications`, {
        method: 'POST',
        headers: { 'x-member-token': token },
        body: JSON.stringify({ clientToken: 'device-123456', memberId: String(other), subscription: { endpoint: 'https://push.test/abc', keys: { p256dh: 'p256dh-key-abcdef', auth: 'auth-key' } } }),
      }),
      { params: Promise.resolve({ tenant: SLUG }) },
    )
    expect(res.status).toBe(200)
    const sub = await PushSubscription.findOne({ clientToken: 'device-123456' }).lean<{ memberId: mongoose.Types.ObjectId; tenantId: mongoose.Types.ObjectId }>()
    expect(String(sub!.memberId)).toBe(String(pedro._id))
    expect(String(sub!.tenantId)).toBe(tenantId)
  })

  it('sin token del club no se puede suscribir', async () => {
    const res = await notificationsPost(
      new NextRequest(`http://localhost/api/${SLUG}/referrals/notifications`, { method: 'POST', body: '{}' }),
      { params: Promise.resolve({ tenant: SLUG }) },
    )
    expect(res.status).toBe(401)
  })

  it('los textos dicen qué pasó y cuánto', () => {
    expect(noticeCopy({ kind: 'joined', inviteeName: 'Lucía M.', pendingPoints: 50 })).toEqual({
      title: '🎉 Lucía M. se sumó con tu link',
      body: 'Ganás 50 puntos cuando haga su primera compra.',
    })
    expect(noticeCopy({ kind: 'credited', inviteeName: 'Lucía M.', points: 150, steps: ['se sumó al club', 'primera compra online'] }).title).toBe('⭐ Ganaste 150 puntos')
    expect(noticeCopy({ kind: 'reward', inviteeName: 'Lucía M.', rewardName: 'Pizza grande' }).body).toContain('«Pizza grande»')
  })
})
