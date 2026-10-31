import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'

import Tenant from '@/models/Tenant'
import User from '@/models/User'
import LoyaltyMember from '@/models/LoyaltyMember'
import PushSubscription from '@/models/PushSubscription'
import { auth } from '@/lib/auth'

// Hotfix de seguridad 31/10/2026:
//   S1  /loyalty/register sobrescribía email y celular de un User existente
//       (toma de cuenta vía "olvidé mi contraseña").
//   S1b /promotions/loyalty-register vinculaba por celular solo y devolvía
//       nombre y email de ese User; sin validar tipos, enumeraba usuarios.
//   S2  /explore/orders devolvía pedidos de cualquier ?email= sin sesión.
//   S3  /push/send aceptaba cualquier sesión.

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

const sendNotification = vi.fn().mockResolvedValue(undefined)
vi.mock('web-push', () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: (...args: unknown[]) => sendNotification(...args) },
}))

import { POST as registerPOST } from '@/app/api/[tenant]/loyalty/register/route'
import { POST as promoRegisterPOST } from '@/app/api/[tenant]/promotions/loyalty-register/route'
import { GET as exploreOrdersGET } from '@/app/api/explore/orders/route'
import { POST as pushSendPOST } from '@/app/api/push/send/route'

const SLUG = 'hotfix-tenant'
const VICTIM_PHONE = '+54 9 11 5555-0001'
const VICTIM_EMAIL = 'victima@test.com'
const ATTACKER_EMAIL = 'atacante@evil.com'

const mockedAuth = vi.mocked(auth)

function post(path: string, body: unknown, handler: typeof registerPOST) {
  const req = new NextRequest(`http://localhost/api/${SLUG}/${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
  })
  return handler(req, { params: Promise.resolve({ tenant: SLUG }) })
}

const register = (body: unknown) => post('loyalty/register', body, registerPOST)
const promoRegister = (body: unknown) => post('promotions/loyalty-register', body, promoRegisterPOST)

let victim: Awaited<ReturnType<typeof User.create>>

beforeEach(async () => {
  vi.clearAllMocks()
  await Tenant.create({
    name: 'Hotfix Tenant',
    slug: SLUG,
    plan: 'full',
    status: 'active',
    isActive: true,
    loyalty: { enabled: true, clubName: 'Club', welcomeMessage: 'Hola' },
  })
  victim = await User.create({
    name: 'Víctima Admin',
    email: VICTIM_EMAIL,
    phone: VICTIM_PHONE,
    role: 'admin',
    isActive: true,
  })
})

async function victimIsUntouched() {
  const fresh = await User.findById(victim._id).lean()
  expect(fresh?.email).toBe(VICTIM_EMAIL)
  expect(fresh?.phone).toBe(VICTIM_PHONE)
}

describe('S1 — /loyalty/register nunca modifica un User existente', () => {
  it('celular de la víctima + email del atacante: no cambia el email (sin toma de cuenta)', async () => {
    const res = await register({ name: 'Atacante', email: ATTACKER_EMAIL, phone: VICTIM_PHONE })
    expect(res.status).toBe(200)

    await victimIsUntouched()
    // El socio queda sin User (se vinculará solo cuando alguien entre con ese email).
    const member = await LoyaltyMember.findOne({ email: ATTACKER_EMAIL }).lean()
    expect(member?.userId ?? null).toBeNull()
    // No se crea un User con el celular de la víctima.
    expect(await User.countDocuments({ email: ATTACKER_EMAIL })).toBe(0)
  })

  it('email de la víctima + otro celular: no cambia el celular ni vincula', async () => {
    const res = await register({ name: 'Atacante', email: VICTIM_EMAIL, phone: '+54 9 11 5555-0999' })
    expect(res.status).toBe(200)

    await victimIsUntouched()
    const member = await LoyaltyMember.findOne({ phone: '+54 9 11 5555-0999' }).lean()
    expect(member?.userId ?? null).toBeNull()
  })

  it('email y celular coinciden: vincula al User existente sin escribirlo', async () => {
    const res = await register({ name: 'Víctima', email: VICTIM_EMAIL.toUpperCase(), phone: VICTIM_PHONE })
    expect(res.status).toBe(200)

    await victimIsUntouched()
    const member = await LoyaltyMember.findOne({ email: VICTIM_EMAIL }).lean()
    expect(String(member?.userId)).toBe(String(victim._id))
  })

  it('User con email sin celular: vincula pero no le carga el celular', async () => {
    const noPhone = await User.create({ name: 'Sin Cel', email: 'sincel@test.com', role: 'consumer', isActive: true })
    const res = await register({ name: 'Sin Cel', email: 'sincel@test.com', phone: '+54 9 11 5555-0222' })
    expect(res.status).toBe(200)

    const fresh = await User.findById(noPhone._id).lean()
    expect(fresh?.phone ?? null).toBeNull()
    const member = await LoyaltyMember.findOne({ email: 'sincel@test.com' }).lean()
    expect(String(member?.userId)).toBe(String(noPhone._id))
  })

  it('persona nueva: crea el User cliente y lo vincula (como antes)', async () => {
    const res = await register({ name: 'Nueva', email: 'nueva@test.com', phone: '+54 9 11 5555-0333' })
    expect(res.status).toBe(200)

    const created = await User.findOne({ email: 'nueva@test.com' }).lean()
    expect(created?.role).toBe('consumer')
    const member = await LoyaltyMember.findOne({ email: 'nueva@test.com' }).lean()
    expect(String(member?.userId)).toBe(String(created?._id))
  })

  it('rechaza operadores en lugar de strings (inyección)', async () => {
    const res = await register({ name: 'X', email: { $gt: '' }, phone: VICTIM_PHONE })
    expect(res.status).toBe(400)
    await victimIsUntouched()
  })
})

describe('S1b — /promotions/loyalty-register', () => {
  it('celular de la víctima + otro email: no vincula ni devuelve datos del User', async () => {
    const res = await promoRegister({ name: 'Atacante', email: ATTACKER_EMAIL, phone: VICTIM_PHONE })
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.user).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain(VICTIM_EMAIL)
    expect(JSON.stringify(body)).not.toContain('Víctima')

    await victimIsUntouched()
    const member = await LoyaltyMember.findOne({ email: ATTACKER_EMAIL }).lean()
    expect(member?.userId ?? null).toBeNull()
  })

  it('rechaza operadores en email y en locationId', async () => {
    const byEmail = await promoRegister({ name: 'X', email: { $gt: '' }, phone: '+54 9 11 5555-0444' })
    expect(byEmail.status).toBe(400)

    const byLocation = await promoRegister({
      name: 'X', email: 'x@test.com', phone: '+54 9 11 5555-0444', locationId: { $ne: null },
    })
    expect(byLocation.status).toBe(400)
  })
})

describe('S2 — /explore/orders exige sesión', () => {
  it('sin sesión y con ?email=: 401, no devuelve pedidos de terceros', async () => {
    mockedAuth.mockResolvedValueOnce(null as any)
    const res = await exploreOrdersGET(
      new NextRequest(`http://localhost/api/explore/orders?email=${encodeURIComponent(VICTIM_EMAIL)}`)
    )
    expect(res.status).toBe(401)
  })

  it('con sesión: usa el email de la sesión e ignora ?email=', async () => {
    mockedAuth.mockResolvedValueOnce({ user: { id: 'x', email: 'propio@test.com', role: 'consumer' } } as any)
    const findSpy = vi.spyOn(User, 'findOne')
    const res = await exploreOrdersGET(
      new NextRequest(`http://localhost/api/explore/orders?email=${encodeURIComponent(VICTIM_EMAIL)}`)
    )
    expect(res.status).toBe(200)
    expect(findSpy).toHaveBeenCalledWith({ email: 'propio@test.com' })
    expect(findSpy).not.toHaveBeenCalledWith({ email: VICTIM_EMAIL })
    findSpy.mockRestore()
  })
})

describe('S3 — /push/send solo superadmin', () => {
  beforeEach(async () => {
    await PushSubscription.create({
      clientToken: 'tok-1',
      endpoint: 'https://push.example/1',
      p256dh: 'p',
      auth: 'a',
    })
  })

  const send = () => pushSendPOST(new NextRequest('http://localhost/api/push/send', {
    method: 'POST',
    body: JSON.stringify({ clientToken: 'tok-1', title: 'Hola', body: 'Texto', url: 'https://evil.example' }),
    headers: { 'content-type': 'application/json' },
  }))

  it('cliente logueado: 403 y no se envía nada', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'c', email: 'c@test.com', role: 'consumer' } } as any)
    const res = await send()
    expect(res.status).toBe(403)
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it('admin de un comercio: 403', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'a', email: 'a@test.com', role: 'admin', tenantSlug: SLUG } } as any)
    const res = await send()
    expect(res.status).toBe(403)
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it('superadmin: envía', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 's', role: 'superadmin' } } as any)
    const res = await send()
    expect(res.status).toBe(200)
    expect(sendNotification).toHaveBeenCalledTimes(1)
  })
})
