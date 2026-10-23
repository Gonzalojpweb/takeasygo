// ============================================================================
// mp-split-guard.test.ts — la comisión de MercadoPago no se puede saltear
// ============================================================================
// Protege, operación por operación:
//   · candado: comercios ya conectados quedan bloqueados; el superadmin lo abre
//   · con candado, MercadoPago SOLO cobra con split: si se cae, se pausa
//     (checkout y creación del pedido); sin candado, cobra como antes
//   · el admin no puede reemplazar una conexión vigente, ni borrar la cuenta
//     conectada, ni cambiarle las credenciales por las de otra cuenta
//   · el link de un solo uso del superadmin: conecta sin sesión del panel,
//     no reemplaza credenciales, pone el candado y no se puede reusar
//   · permiso quitado desde MercadoPago: se detecta, se avisa y se pausa
// ============================================================================

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn().mockResolvedValue(undefined) }))

import Tenant from '@/models/Tenant'
import User from '@/models/User'
import PlatformConfig from '@/models/PlatformConfig'
import MpSplitLink from '@/models/MpSplitLink'
import SystemAnnouncement from '@/models/SystemAnnouncement'
import { auth } from '@/lib/auth'
import { encrypt, decrypt } from '@/lib/crypto'
import { canChargeWithMercadoPago, checkSplitHealth, isSplitRequired, splitOverview } from '@/lib/mp-split-guard'
import { getActiveMpAccount } from '@/lib/mercadopago'
import { buildPaymentMethodCatalog, isPaymentMethodAvailable, loadPaymentMethodContext } from '@/lib/payment-methods'
import { GET as connectGet } from '@/app/api/[tenant]/admin/mp-oauth/connect/route'
import { DELETE as accountDelete, PUT as accountPut } from '@/app/api/[tenant]/settings/mercadopago/accounts/[accountId]/route'
import { POST as splitPost } from '@/app/api/superadmin/tenants/[tenantId]/mp-split/route'
import { GET as linkGet } from '@/app/api/mp-oauth/link/[token]/route'
import { GET as callbackGet } from '@/app/api/mp-oauth/callback/route'
import { POST as createOrder } from '@/app/api/[tenant]/orders/route'

const SLUG = 'parrilla-split'
const MP_USER = 1111
let tenant: { _id: mongoose.Types.ObjectId }
let activeId: string
let spareId: string
const fetchMock = vi.fn()

function account(label: string, isActive: boolean, oauth: boolean) {
  return {
    label,
    isActive,
    accessToken: encrypt('APP_USR-manual-token'),
    publicKey: encrypt('APP_USR-public'),
    webhookSecret: encrypt('secret'),
    mpUserId: MP_USER,
    ...(oauth
      ? { oauthAccessToken: encrypt('APP_USR-oauth-token'), oauthRefreshToken: encrypt('TG-refresh'), oauthIsConnected: true, oauthAuthorizedAt: new Date(), oauthExpiresAt: new Date(Date.now() + 100 * 86_400_000), oauthMpUserId: MP_USER }
      : {}),
  }
}

async function as(role: 'admin' | 'superadmin') {
  const u = await User.create({ name: role, email: `${role}-${Math.random().toString(36).slice(2, 7)}@t.test`, password: 'x'.repeat(20), phone: `+54911${Math.floor(Math.random() * 1e8)}`, role, tenantId: role === 'admin' ? tenant._id : null })
  vi.mocked(auth).mockResolvedValue({ user: { id: String(u._id), role, email: u.email, tenantId: role === 'admin' ? String(tenant._id) : null, tenantSlug: role === 'admin' ? SLUG : null, assignedLocations: [] }, expires: '' } as never)
}

const fresh = async () => (await Tenant.findById(tenant._id).lean()) as never as Parameters<typeof splitOverview>[0] & { mpAccounts: Array<{ _id: mongoose.Types.ObjectId; oauthIsConnected: boolean; oauthAccessToken: string; accessToken: string; oauthRevokedAt?: Date | null }>; mpSplitGuard?: { locked: boolean | null } }

async function mpEnabled() {
  const ctx = await loadPaymentMethodContext(SLUG)
  return isPaymentMethodAvailable(buildPaymentMethodCatalog(ctx, 'takeaway'), 'mercadopago')
}

beforeAll(() => {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64')
  process.env.AUTH_SECRET = 'test-auth-secret-for-mp-split'
  process.env.NEXTAUTH_URL = 'https://www.takeasygo.test'
})

beforeEach(async () => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  tenant = await Tenant.create({
    slug: SLUG,
    name: 'Parrilla Split',
    isActive: true,
    status: 'active',
    plan: 'full',
    mpAccounts: [account('Principal', true, true), account('Repuesto', false, false)],
  })
  const t = await fresh()
  activeId = String(t.mpAccounts[0]._id)
  spareId = String(t.mpAccounts[1]._id)
  await PlatformConfig.create({ _id: 'platform', mpOAuth: { appId: 'APP123', appSecret: encrypt('app-secret'), redirectUri: 'https://www.takeasygo.test/api/mp-oauth/callback' } })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('candado', () => {
  it('un comercio que ya conectó el split queda con candado aunque nunca se haya guardado', async () => {
    const t = await fresh()
    expect(t.mpSplitGuard?.locked ?? null).toBeNull()
    expect(isSplitRequired(t)).toBe(true)
    expect(isSplitRequired({ mpAccounts: [{ label: 'x' }] })).toBe(false) // nunca conectó
  })

  it('con candado, sin split vigente MercadoPago se pausa; sin candado cobra como antes', async () => {
    expect(await mpEnabled()).toBe(true)
    await Tenant.updateOne({ _id: tenant._id }, { $set: { 'mpAccounts.0.oauthIsConnected': false, 'mpAccounts.0.oauthRevokedAt': new Date() } })
    expect(await mpEnabled()).toBe(false)
    const t = await fresh()
    expect(canChargeWithMercadoPago(t, getActiveMpAccount(t))).toBe(false)
    expect(splitOverview(t).mpPaused).toBe(true)

    await Tenant.updateOne({ _id: tenant._id }, { $set: { 'mpSplitGuard.locked': false } })
    expect(await mpEnabled()).toBe(true) // el superadmin quitó el candado
  })

  it('MercadoPago pausado: un pedido con MercadoPago se rechaza (409) sin crearse', async () => {
    await Tenant.updateOne({ _id: tenant._id }, { $set: { 'mpAccounts.0.oauthIsConnected': false } })
    const res = await createOrder(
      new NextRequest(`http://localhost/api/${SLUG}/orders`, {
        method: 'POST',
        body: JSON.stringify({ locationId: String(new mongoose.Types.ObjectId()), mode: 'takeaway', paymentMethod: 'mercadopago', items: [{ menuItemId: String(new mongoose.Types.ObjectId()), quantity: 1 }], customer: { name: 'Juan', phone: '+5491122223333' } }),
      }),
      { params: Promise.resolve({ tenant: SLUG }) },
    )
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'MP_PAUSED' })
  })
})

describe('el admin no puede saltear la comisión', () => {
  it('no puede reemplazar una conexión vigente; sí reconectar una caída', async () => {
    await as('admin')
    const blocked = await connectGet(new NextRequest(`http://localhost/api/${SLUG}/admin/mp-oauth/connect?accountId=${activeId}`), { params: Promise.resolve({ tenant: SLUG }) })
    expect(blocked.status).toBe(403)
    expect(await blocked.json()).toMatchObject({ code: 'MP_SPLIT_LOCKED' })

    await Tenant.updateOne({ _id: tenant._id }, { $set: { 'mpAccounts.0.oauthIsConnected': false } })
    const allowed = await connectGet(new NextRequest(`http://localhost/api/${SLUG}/admin/mp-oauth/connect?accountId=${activeId}`), { params: Promise.resolve({ tenant: SLUG }) })
    expect(allowed.status).toBe(307)
    expect(allowed.headers.get('location')).toContain('auth.mercadopago.com')
  })

  it('no puede borrar la cuenta conectada (el superadmin sí)', async () => {
    await Tenant.updateOne({ _id: tenant._id }, { $set: { 'mpAccounts.0.isActive': false, 'mpAccounts.1.isActive': true } })
    await as('admin')
    const P = { params: Promise.resolve({ tenant: SLUG, accountId: activeId }) }
    const res = await accountDelete(new NextRequest('http://localhost/x', { method: 'DELETE' }), P)
    expect(res.status).toBe(403)
    // Con la cuenta sin split activa, MercadoPago queda pausado: no hay atajo.
    expect(await mpEnabled()).toBe(false)
    await as('superadmin')
    expect((await accountDelete(new NextRequest('http://localhost/x', { method: 'DELETE' }), { params: Promise.resolve({ tenant: SLUG, accountId: activeId }) })).status).toBe(200)
  })

  it('no puede cambiar las credenciales por las de otra cuenta de MercadoPago', async () => {
    await as('admin')
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 9999 }), { status: 200 }))
    const res = await accountPut(
      new NextRequest('http://localhost/x', { method: 'PUT', body: JSON.stringify({ accessToken: 'APP_USR-otra-cuenta' }) }),
      { params: Promise.resolve({ tenant: SLUG, accountId: activeId }) },
    )
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'MP_ACCOUNT_MISMATCH' })
    expect(decrypt((await fresh()).mpAccounts[0].accessToken)).toBe('APP_USR-manual-token')
  })
})

describe('link de autorización del superadmin', () => {
  it('conecta sin sesión del panel, conserva las credenciales, pone el candado y no se reusa', async () => {
    await as('superadmin')
    const res = await splitPost(new NextRequest('http://localhost/x', { method: 'POST', body: JSON.stringify({ action: 'link', accountId: spareId }) }), { params: Promise.resolve({ tenantId: String(tenant._id) }) })
    expect(res.status).toBe(200)
    const { url } = await res.json()
    const token = String(url).split('/').pop()!

    // El dueño abre el link (sin sesión): va a MercadoPago con un state firmado.
    vi.mocked(auth).mockResolvedValue(null as never)
    const go = await linkGet(new NextRequest(`http://localhost/api/mp-oauth/link/${token}`), { params: Promise.resolve({ token }) })
    expect(go.status).toBe(307)
    const authUrl = new URL(go.headers.get('location')!)
    expect(authUrl.host).toBe('auth.mercadopago.com')
    const state = authUrl.searchParams.get('state')!

    // MercadoPago vuelve con el código.
    fetchMock.mockImplementation(async (input: string) => {
      if (String(input).includes('/oauth/token')) return new Response(JSON.stringify({ access_token: 'APP_USR-oauth-repuesto', refresh_token: 'TG-r2', expires_in: 15552000 }), { status: 200 })
      return new Response(JSON.stringify({ id: MP_USER }), { status: 200 }) // /users/me: misma cuenta
    })
    const back = await callbackGet(new NextRequest(`https://www.takeasygo.test/api/mp-oauth/callback?code=CODE&state=${encodeURIComponent(state)}`))
    expect(back.headers.get('location')).toContain('/autorizar-mercadopago/listo?estado=ok')

    const t = await fresh()
    const spare = t.mpAccounts.find((a) => String(a._id) === spareId)!
    expect(spare.oauthIsConnected).toBe(true)
    expect(decrypt(spare.oauthAccessToken)).toBe('APP_USR-oauth-repuesto')
    expect(decrypt(spare.accessToken)).toBe('APP_USR-manual-token') // credenciales del restaurante intactas
    expect(t.mpSplitGuard?.locked).toBe(true)
    expect(await MpSplitLink.countDocuments({ usedAt: { $ne: null } })).toBe(1)

    // Reusar el link no sirve.
    const again = await linkGet(new NextRequest(`http://localhost/api/mp-oauth/link/${token}`), { params: Promise.resolve({ token }) })
    expect(again.headers.get('location')).toContain('motivo=link_invalid')
  })

  it('si el dueño entra con otra cuenta de MercadoPago, no se guarda y el link se puede reintentar', async () => {
    await as('superadmin')
    const { url } = await (await splitPost(new NextRequest('http://localhost/x', { method: 'POST', body: JSON.stringify({ action: 'link', accountId: spareId }) }), { params: Promise.resolve({ tenantId: String(tenant._id) }) })).json()
    const token = String(url).split('/').pop()!
    vi.mocked(auth).mockResolvedValue(null as never)
    const state = new URL((await linkGet(new NextRequest('http://x'), { params: Promise.resolve({ token }) })).headers.get('location')!).searchParams.get('state')!
    // El token nuevo es de la cuenta 7777; el manual del comercio, de MP_USER.
    fetchMock.mockImplementation(async (_input: string, init?: { headers?: Record<string, string> }) => {
      const bearer = init?.headers?.Authorization ?? ''
      if (!bearer) return new Response(JSON.stringify({ access_token: 'APP_USR-ajena', expires_in: 100 }), { status: 200 })
      return new Response(JSON.stringify({ id: bearer.includes('ajena') ? 7777 : MP_USER }), { status: 200 })
    })
    const back = await callbackGet(new NextRequest(`https://www.takeasygo.test/api/mp-oauth/callback?code=CODE&state=${encodeURIComponent(state)}`))
    expect(back.headers.get('location')).toContain('motivo=user_id_mismatch')
    expect((await fresh()).mpAccounts.find((a) => String(a._id) === spareId)!.oauthIsConnected).toBe(false)
    expect(await MpSplitLink.countDocuments({ usedAt: null })).toBe(1) // liberado para reintentar
  })
})

describe('permiso quitado desde MercadoPago', () => {
  it('el control diario lo detecta, avisa al comercio y pausa MercadoPago', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }))
    const t = await fresh()
    const results = await checkSplitHealth(t as never)
    expect(results).toEqual([{ accountId: activeId, result: 'revoked' }])
    const after = await fresh()
    expect(after.mpAccounts[0].oauthIsConnected).toBe(false)
    expect(after.mpAccounts[0].oauthRevokedAt).toBeTruthy()
    expect(await SystemAnnouncement.countDocuments({ targetTenantIds: tenant._id, title: /pausado/ })).toBe(1)
    expect(await mpEnabled()).toBe(false)
    // Idempotente: otra pasada no vuelve a avisar.
    await checkSplitHealth((await fresh()) as never)
    expect(await SystemAnnouncement.countDocuments({ targetTenantIds: tenant._id })).toBe(1)
  })

  it('si MercadoPago responde bien, no toca nada', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: MP_USER }), { status: 200 }))
    expect(await checkSplitHealth((await fresh()) as never)).toEqual([{ accountId: activeId, result: 'ok' }])
    expect(await mpEnabled()).toBe(true)
  })
})
