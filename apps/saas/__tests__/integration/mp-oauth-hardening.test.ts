import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

import { auth } from '@/lib/auth'
import PlatformConfig from '@/models/PlatformConfig'
import Tenant from '@/models/Tenant'
import { encrypt } from '@/lib/crypto'
import { signMpOauthState, verifyMpOauthState } from '@/lib/mp-oauth-state'
import { GET as connectGET } from '@/app/api/[tenant]/admin/mp-oauth/connect/route'
import { GET as callbackGET } from '@/app/api/mp-oauth/callback/route'

const authMock = vi.mocked(auth as unknown as () => Promise<any>)
const AUTH_SECRET = 'test-auth-secret-for-mp'
const BASE = 'http://localhost:3000'

function session(role: string, tenantSlug: string | null) {
  return {
    user: {
      id: 'u1',
      role,
      tenantId: tenantSlug ? 'tenant-id-1' : null,
      tenantSlug,
      assignedLocation: null,
      assignedLocations: [],
      assignedTenants: [],
      name: 'Test',
      email: 'test@e2e.test',
    },
  }
}

function connectReq(slug = 'palmyra', query = '') {
  return new NextRequest(`${BASE}/api/${slug}/admin/mp-oauth/connect${query}`)
}
const connectParams = (slug = 'palmyra') => ({ params: Promise.resolve({ tenant: slug }) })

function callbackReq(state: string | null, code = 'cod-123') {
  const sp = new URLSearchParams()
  if (code) sp.set('code', code)
  if (state !== null) sp.set('state', state)
  return new Request(`${BASE}/api/mp-oauth/callback?${sp.toString()}`) as any
}

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(async () => {
  process.env.AUTH_SECRET = AUTH_SECRET
  process.env.NEXTAUTH_URL = BASE
  // aes-256-gcm necesita 32 bytes en base64 (el setup pone un hex de 64 chars)
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')

  authMock.mockResolvedValue(null)
  fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)

  await PlatformConfig.create({
    _id: 'platform',
    mpOAuth: {
      appId: 'app-123',
      appSecret: encrypt('secret-plain'),
      redirectUri: null,
      platformFeePercent: 5,
    },
  } as any)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('mp-oauth connect — sesión de admin + tenant match + state firmado', () => {
  it('sin sesión → 401', async () => {
    authMock.mockResolvedValue(null)
    const res = await connectGET(connectReq(), connectParams())
    expect(res.status).toBe(401)
  })

  it('rol sin permiso (consumer) → 403', async () => {
    authMock.mockResolvedValue(session('consumer', 'palmyra'))
    const res = await connectGET(connectReq(), connectParams())
    expect(res.status).toBe(403)
  })

  it('admin de OTRO tenant → 403', async () => {
    authMock.mockResolvedValue(session('admin', 'kekelarry'))
    const res = await connectGET(connectReq('palmyra'), connectParams('palmyra'))
    expect(res.status).toBe(403)
  })

  it('admin del tenant → 307 con state firmado y verificable', async () => {
    authMock.mockResolvedValue(session('admin', 'palmyra'))
    const res = await connectGET(connectReq('palmyra', '?accountId=acc-9'), connectParams('palmyra'))
    expect(res.status).toBe(307)

    const location = new URL(res.headers.get('location')!)
    expect(location.hostname).toBe('auth.mercadopago.com')
    const stateParam = location.searchParams.get('state')!
    const state = verifyMpOauthState(stateParam, AUTH_SECRET)
    expect(state).not.toBeNull()
    expect(state!.tenantSlug).toBe('palmyra')
    expect(state!.accountId).toBe('acc-9')
  })

  it('superadmin sin tenant → 307 (exceptuado por rol)', async () => {
    authMock.mockResolvedValue(session('superadmin', null))
    const res = await connectGET(connectReq('palmyra'), connectParams('palmyra'))
    expect(res.status).toBe(307)
  })
})

describe('mp-oauth callback — firma + sesión + tenant match', () => {
  it('host distinto al de NEXTAUTH_URL → re-emite al host canónico con la query (307)', async () => {
    // MP redirige al host del redirect_uri registrado (p.ej. sin www); la
    // sesión vive en el host de NEXTAUTH_URL. El callback debe re-emitir
    // antes de tocar auth()/código.
    authMock.mockClear()
    authMock.mockResolvedValue(null)
    const req = new Request('http://otro-host.ejemplo/api/mp-oauth/callback?code=cod-1&state=abc') as any
    const res = await callbackGET(req)
    expect(res.status).toBe(307)
    const loc = res.headers.get('location')!
    expect(loc).toBe(`${BASE}/api/mp-oauth/callback?code=cod-1&state=abc`)
    expect(authMock).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('host ya canónico → NO redirige y continúa el flujo normal', async () => {
    authMock.mockResolvedValue(session('admin', 'palmyra'))
    const res = await callbackGET(callbackReq('cualquiera'))
    // state inválido → error normal (no el re-emit de host)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('reason=bad_state')
  })

  it('www <-> sin-www del MISMO dominio → NO redirige (evita loop con el 308 de Vercel)', async () => {
    // NEXTAUTH_URL apex (como en Vercel) + request en www: si redirigiéramos,
    // Vercel re-redirige al www con 308 → loop ERR_TOO_MANY_REDIRECTS.
    process.env.NEXTAUTH_URL = 'https://takeasygo.com'
    authMock.mockClear()
    authMock.mockResolvedValue(session('admin', 'palmyra'))
    const req = new Request('https://www.takeasygo.com/api/mp-oauth/callback?code=cod-1&state=malo') as any
    const res = await callbackGET(req)
    expect(res.headers.get('location')).toContain('reason=bad_state')
    expect(res.headers.get('location')).toContain('takeasygo.com')
    // No re-emite al host: sigue el flujo normal (state inválido en este caso)
    expect(res.headers.get('location')).not.toContain('/api/mp-oauth/callback')
  })

  it('state sin firmar (formato viejo) → error, sin canjear código', async () => {
    authMock.mockResolvedValue(session('admin', 'palmyra'))
    const legacy = Buffer.from(JSON.stringify({ tenantSlug: 'palmyra', ts: Date.now() })).toString('base64url')
    const res = await callbackGET(callbackReq(legacy))
    expect(res.headers.get('location')).toContain('mp_oauth=error')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('state firmado pero SIN sesión → error, sin canjear código', async () => {
    authMock.mockResolvedValue(null)
    const state = signMpOauthState({ tenantSlug: 'palmyra' }, AUTH_SECRET)
    const res = await callbackGET(callbackReq(state))
    expect(res.headers.get('location')).toContain('mp_oauth=error')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('state firmado pero sesión de OTRO tenant → error, sin canjear código', async () => {
    authMock.mockResolvedValue(session('admin', 'kekelarry'))
    const state = signMpOauthState({ tenantSlug: 'palmyra' }, AUTH_SECRET)
    const res = await callbackGET(callbackReq(state))
    expect(res.headers.get('location')).toContain('mp_oauth=error')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('state expirado → error, sin canjear código', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-10-11T12:00:00Z'))
      const state = signMpOauthState({ tenantSlug: 'palmyra' }, AUTH_SECRET)
      authMock.mockResolvedValue(session('admin', 'palmyra'))
      vi.setSystemTime(new Date('2026-10-11T12:11:00Z'))
      const res = await callbackGET(callbackReq(state))
      expect(res.headers.get('location')).toContain('mp_oauth=error')
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('state firmado + sesión admin del tenant → canjea el código y guarda en el tenant', async () => {
    authMock.mockResolvedValue(session('admin', 'palmyra'))
    await Tenant.create({ name: 'Palmyra', slug: 'palmyra', status: 'active', plan: 'full' } as any)
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'at-1', refresh_token: 'rt-1', expires_in: 1800 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )

    const state = signMpOauthState({ tenantSlug: 'palmyra' }, AUTH_SECRET)
    const res = await callbackGET(callbackReq(state))

    // 1) canje code → token, 2) /users/me para identificar oauthUserId
    // (hardening fe3e374d: validar user_id antes de guardar)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    const [url] = fetchSpy.mock.calls[0]
    expect(String(url)).toContain('api.mercadopago.com/oauth/token')
    expect(String(fetchSpy.mock.calls[1][0])).toContain('api.mercadopago.com/users/me')
    expect(res.headers.get('location')).toContain('palmyra/admin/settings?mp_oauth=success')

    const tenant = await Tenant.findOne({ slug: 'palmyra' }).lean<any>()
    expect(tenant?.mpOAuth?.isConnected).toBe(true)
  })

  it('firma válida pero tenant del state inexistente en DB → error', async () => {
    authMock.mockResolvedValue(session('superadmin', null))
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'at-1', refresh_token: 'rt-1', expires_in: 1800 }), {
        status: 200,
      })
    )
    const state = signMpOauthState({ tenantSlug: 'tenant-fantasma' }, AUTH_SECRET)
    const res = await callbackGET(callbackReq(state))
    expect(res.headers.get('location')).toContain('mp_oauth=error')
  })
})
