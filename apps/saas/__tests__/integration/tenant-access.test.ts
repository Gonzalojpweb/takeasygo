import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import mongoose from 'mongoose'
import './setup'

import Tenant from '@/models/Tenant'
import User from '@/models/User'
import AccessShadowEvent from '@/models/AccessShadowEvent'
import { auth } from '@/lib/auth'
import { clearFreshUserCache } from '@/lib/apiAuth'
import { classifyShadow, clearAccessModeCache, getAccessMode } from '@/lib/access-central'
import { authorizeTenantBySlug, belongsTo, canOperateTenant, getAdminSession, getRoleSession, requireSuperAdminCentral, sessionTenantDecision } from '@/lib/tenant-access'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

/**
 * Multi-marca PR 2 — acceso a un comercio por un punto único, con el
 * interruptor `access.central`:
 *   off     → decide el JWT (idéntico a antes del PR 2)
 *   log     → decide el JWT y registra si la base opina distinto
 *   enforce → decide la base (rol, comercio y estado frescos; cierra S5)
 */

const authMock = auth as unknown as ReturnType<typeof vi.fn>
let tenantA: string
let tenantB: string
let userId: string

function jwt(user: Record<string, unknown>) {
  authMock.mockResolvedValue({ user })
}

async function setMode(mode: 'off' | 'log' | 'enforce') {
  process.env.ACCESS_CENTRAL_MODE = mode
  clearAccessModeCache()
  expect(await getAccessMode()).toBe(mode)
}

async function waitShadow(n: number) {
  for (let i = 0; i < 40 && (await AccessShadowEvent.countDocuments()) < n; i++) await new Promise((r) => setTimeout(r, 25))
}

beforeEach(async () => {
  clearFreshUserCache()
  const a = await Tenant.create({ name: 'A', slug: 'marca-a', plan: 'full' })
  const b = await Tenant.create({ name: 'B', slug: 'marca-b', plan: 'full' })
  tenantA = a._id.toString()
  tenantB = b._id.toString()
  const u = await User.create({ name: 'Encargada', email: `enc-${Math.random().toString(36).slice(2, 8)}@t.test`, password: 'x'.repeat(20), role: 'manager', tenantId: tenantA })
  userId = u._id.toString()
  jwt({ id: userId, role: 'manager', tenantId: tenantA, tenantSlug: 'marca-a', email: 'enc@t.test', name: 'Encargada' })
})

afterEach(() => {
  delete process.env.ACCESS_CENTRAL_MODE
  clearAccessModeCache()
})

describe('pertenencia (funciones puras)', () => {
  it('belongsTo y canOperateTenant', () => {
    expect(belongsTo({ tenantId: 'x' }, 'x')).toBe(true)
    expect(belongsTo({ tenantId: 'x' }, 'y')).toBe(false)
    expect(belongsTo({ tenantId: null }, 'x')).toBe(false)
    expect(canOperateTenant({ role: 'superadmin', tenantId: null }, 'x')).toBe(true)
    expect(canOperateTenant({ role: 'consumer', tenantId: 'x' }, 'x')).toBe(false)
    expect(canOperateTenant({ role: 'manager', tenantId: 'x' }, 'x')).toBe(true)
  })

  it('motivo de la divergencia, determinista', () => {
    const base = { family: 'f', oldDecision: true, newDecision: false, hadJwt: true, freshFound: true }
    expect(classifyShadow({ ...base, hadJwt: false })).toBe('no_jwt')
    expect(classifyShadow({ ...base, freshFound: false })).toBe('user_inactive')
    expect(classifyShadow({ ...base, oldTenantMatches: true, newTenantMatches: false })).toBe('jwt_stale_tenant')
    expect(classifyShadow({ ...base, oldRole: 'admin', newRole: 'waiter' })).toBe('jwt_stale_role')
    expect(classifyShadow({ ...base, oldRole: 'admin', newRole: 'admin' })).toBe('unknown')
  })
})

describe('authorizeTenantBySlug', () => {
  it('off: idéntico a antes — el JWT del comercio pasa aunque la base diga otra cosa', async () => {
    await setMode('off')
    await User.updateOne({ _id: userId }, { isActive: false })
    const r = await authorizeTenantBySlug(undefined, 'marca-a', { family: 't' })
    expect(r.ok).toBe(true)
    const otro = await authorizeTenantBySlug(undefined, 'marca-b', { family: 't' })
    expect(otro.ok).toBe(false)
    if (!otro.ok) expect(otro.response.status).toBe(403)
  })

  it('sin sesión: 401 en cualquier modo', async () => {
    authMock.mockResolvedValue(null)
    for (const mode of ['off', 'log', 'enforce'] as const) {
      await setMode(mode)
      const r = await authorizeTenantBySlug(undefined, 'marca-a', { family: 't' })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.response.status).toBe(401)
    }
  })

  it('log: decide el JWT y registra la divergencia (usuario desactivado)', async () => {
    await setMode('log')
    await User.updateOne({ _id: userId }, { isActive: false })
    const r = await authorizeTenantBySlug(undefined, 'marca-a', { family: 'club-audit' })
    expect(r.ok).toBe(true)
    await waitShadow(1)
    const ev = await AccessShadowEvent.findOne().lean()
    expect(ev).toMatchObject({ family: 'club-audit', oldDecision: true, newDecision: false, reason: 'user_inactive', tenantId: tenantA })
  })

  it('enforce: usuario desactivado → 401; movido a otro comercio → 403; con rol → 403', async () => {
    await setMode('enforce')
    await User.updateOne({ _id: userId }, { isActive: false })
    const inactivo = await authorizeTenantBySlug(undefined, 'marca-a', { family: 't' })
    expect(inactivo.ok).toBe(false)
    if (!inactivo.ok) expect(inactivo.response.status).toBe(401)

    clearFreshUserCache()
    await User.updateOne({ _id: userId }, { isActive: true, tenantId: tenantB })
    const movido = await authorizeTenantBySlug(undefined, 'marca-a', { family: 't' })
    expect(movido.ok).toBe(false)
    if (!movido.ok) expect(movido.response.status).toBe(403)
    // …y en el comercio nuevo entra aunque su JWT diga el viejo.
    const nuevo = await authorizeTenantBySlug(undefined, 'marca-b', { family: 't' })
    expect(nuevo.ok).toBe(true)

    clearFreshUserCache()
    await User.updateOne({ _id: userId }, { tenantId: tenantA, role: 'waiter' })
    const rol = await authorizeTenantBySlug(undefined, 'marca-a', { family: 't', roles: ['admin', 'manager'] })
    expect(rol.ok).toBe(false)
    if (!rol.ok) expect(rol.response.status).toBe(403)
  })

  it('enforce: un consumidor nunca opera un comercio', async () => {
    await setMode('enforce')
    await User.updateOne({ _id: userId }, { role: 'consumer' })
    const r = await authorizeTenantBySlug(undefined, 'marca-a', { family: 't' })
    expect(r.ok).toBe(false)
  })

  it('enforce: devuelve el principal con el rol fresco', async () => {
    await setMode('enforce')
    await User.updateOne({ _id: userId }, { role: 'admin' })
    const r = await authorizeTenantBySlug(undefined, 'marca-a', { family: 't' })
    expect(r.ok && r.principal.role).toBe('admin')
    expect(r.ok && r.principal.tenantId).toBe(tenantA)
  })
})

describe('requireSuperAdminCentral (S5)', () => {
  beforeEach(async () => {
    await User.updateOne({ _id: userId }, { role: 'manager' })
    jwt({ id: userId, role: 'superadmin', tenantSlug: null })
  })

  it('off: el rol del JWT manda (como siempre)', async () => {
    await setMode('off')
    expect(await requireSuperAdminCentral()).toBeNull()
  })

  it('log: pasa por el JWT y registra jwt_stale_role', async () => {
    await setMode('log')
    expect(await requireSuperAdminCentral('superadmin')).toBeNull()
    await waitShadow(1)
    const ev = await AccessShadowEvent.findOne().lean()
    expect(ev?.reason).toBe('jwt_stale_role')
  })

  it('enforce: al que le sacaron el superadmin en la base no pasa', async () => {
    await setMode('enforce')
    const r = await requireSuperAdminCentral()
    expect(r?.status).toBe(403)
  })

  it('enforce: superadmin vigente pasa', async () => {
    await setMode('enforce')
    await User.updateOne({ _id: userId }, { role: 'superadmin', tenantId: null })
    clearFreshUserCache()
    expect(await requireSuperAdminCentral()).toBeNull()
  })
})

describe('getAccessMode', () => {
  it('sin variable ni configuración: off', async () => {
    delete process.env.ACCESS_CENTRAL_MODE
    clearAccessModeCache()
    expect(await getAccessMode()).toBe('off')
  })

  it('lee PlatformConfig.accessCentral cuando no hay variable', async () => {
    delete process.env.ACCESS_CENTRAL_MODE
    const PlatformConfig = (await import('@/models/PlatformConfig')).default
    await PlatformConfig.updateOne({ _id: 'platform' }, { $set: { accessCentral: 'log' } }, { upsert: true })
    clearAccessModeCache()
    expect(mongoose.connection.readyState).toBe(1)
    expect(await getAccessMode()).toBe('log')
  })

  it('sin base conectada da off pero no lo guarda: al conectar lee el valor real', async () => {
    delete process.env.ACCESS_CENTRAL_MODE
    const PlatformConfig = (await import('@/models/PlatformConfig')).default
    await PlatformConfig.updateOne({ _id: 'platform' }, { $set: { accessCentral: 'enforce', orgAccess: 'enforce' } }, { upsert: true })
    const { getOrgAccessMode, clearOrgAccessModeCache } = await import('@/lib/org-access')
    clearAccessModeCache()
    clearOrgAccessModeCache()
    const state = vi.spyOn(mongoose.connection, 'readyState', 'get').mockReturnValue(0 as never)
    expect(await getAccessMode()).toBe('off')
    expect(await getOrgAccessMode()).toBe('off')
    state.mockRestore()
    expect(await getAccessMode()).toBe('enforce')
    expect(await getOrgAccessMode()).toBe('enforce')
  })

  it('instancia recién arrancada: conecta la base ANTES de leer el interruptor (no da «apagado» en frío)', async () => {
    // Regresión 13/11/2026: /grupo/[slug]/personal, /crm y /catalogo daban
    // 404 intermitente porque el interruptor se leía sin conexión → «off».
    delete process.env.ACCESS_CENTRAL_MODE
    delete process.env.ORG_DASHBOARD_MODE
    const PlatformConfig = (await import('@/models/PlatformConfig')).default
    await PlatformConfig.updateOne({ _id: 'platform' }, { $set: { accessCentral: 'enforce', orgAccess: 'enforce', orgDashboard: 'on' } }, { upsert: true })
    const { getOrgAccessMode, clearOrgAccessModeCache, getOrgDashboardMode, clearOrgDashboardModeCache } = await import('@/lib/org-access')
    const { connectDB } = await import('@/lib/mongoose')
    clearAccessModeCache()
    clearOrgAccessModeCache()
    clearOrgDashboardModeCache()
    // Sin conexión hasta que alguien llama a connectDB.
    let connected = false
    const state = vi.spyOn(mongoose.connection, 'readyState', 'get').mockImplementation(() => (connected ? 1 : 0) as never)
    vi.mocked(connectDB).mockImplementation(async () => { connected = true; return undefined as never })
    try {
      expect(await getOrgDashboardMode()).toBe('on')
      expect(connectDB).toHaveBeenCalled()
      expect(await getAccessMode()).toBe('enforce')
      expect(await getOrgAccessMode()).toBe('enforce')
    } finally {
      state.mockRestore()
      vi.mocked(connectDB).mockReset().mockResolvedValue(undefined as never)
    }
  })

  it('si no puede conectar, sigue fallando cerrado («off») sin guardarlo', async () => {
    delete process.env.ORG_DASHBOARD_MODE
    const PlatformConfig = (await import('@/models/PlatformConfig')).default
    await PlatformConfig.updateOne({ _id: 'platform' }, { $set: { orgDashboard: 'on' } }, { upsert: true })
    const { getOrgDashboardMode, clearOrgDashboardModeCache } = await import('@/lib/org-access')
    const { connectDB } = await import('@/lib/mongoose')
    clearOrgDashboardModeCache()
    const state = vi.spyOn(mongoose.connection, 'readyState', 'get').mockReturnValue(0 as never)
    vi.mocked(connectDB).mockRejectedValueOnce(new Error('sin red'))
    try {
      expect(await getOrgDashboardMode()).toBe('off')
    } finally {
      state.mockRestore()
    }
    expect(await getOrgDashboardMode()).toBe('on')
  })
})

describe('getAdminSession (PR 3: páginas del admin)', () => {
  it('off: sesión para su comercio, null para otro (S4: la página se protege sola)', async () => {
    await setMode('off')
    expect((await getAdminSession('marca-a'))?.user.role).toBe('manager')
    expect(await getAdminSession('marca-b')).toBeNull()
  })

  it('sin slug ni sesión: null', async () => {
    await setMode('off')
    authMock.mockResolvedValue(null)
    expect(await getAdminSession('marca-a')).toBeNull()
  })

  it('enforce: desactivado → null; rol fresco en la sesión', async () => {
    await setMode('enforce')
    await User.updateOne({ _id: userId }, { role: 'admin' })
    expect((await getAdminSession('marca-a'))?.user.role).toBe('admin')
    clearFreshUserCache()
    await User.updateOne({ _id: userId }, { isActive: false })
    expect(await getAdminSession('marca-a')).toBeNull()
  })

  it('log: devuelve la del JWT y registra la divergencia', async () => {
    await setMode('log')
    await User.updateOne({ _id: userId }, { isActive: false })
    expect(await getAdminSession('marca-a')).not.toBeNull()
    await waitShadow(1)
    expect((await AccessShadowEvent.findOne().lean())?.family).toBe('admin-page')
  })

  it('superadmin entra a cualquier comercio', async () => {
    await setMode('off')
    jwt({ id: userId, role: 'superadmin', tenantSlug: null })
    expect(await getAdminSession('marca-b')).not.toBeNull()
  })
})

describe('PR 4: páginas por rol y API keys', () => {
  it('getRoleSession: off por el JWT; enforce por la base (vendedor con comercios frescos)', async () => {
    jwt({ id: userId, role: 'seller', assignedTenants: [] })
    await setMode('off')
    expect((await getRoleSession('seller'))?.user.role).toBe('seller')
    expect(await getRoleSession('superadmin')).toBeNull()

    await setMode('enforce')
    expect(await getRoleSession('seller')).toBeNull() // en la base es manager
    clearFreshUserCache()
    await User.updateOne({ _id: userId }, { role: 'seller', assignedTenants: [tenantA, tenantB] })
    const s = await getRoleSession('seller')
    expect(s?.user.assignedTenants.sort()).toEqual([tenantA, tenantB].sort())
  })

  it('sessionTenantDecision: sin sesión → none (sigue la API key); otro comercio → denied', async () => {
    const req = new Request('http://localhost/api/x') as never
    authMock.mockResolvedValue(null)
    await setMode('off')
    expect(await sessionTenantDecision(req, tenantA)).toBe('none')
    jwt({ id: userId, role: 'manager', tenantId: tenantA, tenantSlug: 'marca-a' })
    expect(await sessionTenantDecision(req, tenantA)).toBe('ok')
    expect(await sessionTenantDecision(req, tenantB)).toBe('denied')
    await setMode('enforce')
    await User.updateOne({ _id: userId }, { isActive: false })
    expect(await sessionTenantDecision(req, tenantA)).toBe('denied')
  })
})

