// ============================================================================
// security-hardening.test.ts — Auditoría de seguridad 30/10/2026
// ============================================================================
// C1: rol mínimo DURO (no depende del flag rbac.sedeScope) en acciones de
//     dinero y usuarios. Decisión del dueño: CBU/alias solo admin.
// C1/B8: un consumidor con tenantId no opera el panel.
// A1: el token del POS solo vale en /api/{tenant}/pos/* y en el logout.
// A2: una cuenta corporativa compartida no se edita desde un comercio.
// ============================================================================

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

import Tenant from '@/models/Tenant'
import User from '@/models/User'
import CorporateAccount from '@/models/CorporateAccount'
import { auth } from '@/lib/auth'
import { clearFreshUserCache, isPosBearerPath } from '@/lib/apiAuth'
import { signJwt } from '@takeasygo/business/jwt'
import { __resetPosJwtKeyCacheForTests } from '@/lib/posJwt'
import { safeEqual } from '@/lib/safe-equal'
import { PUT as putTransfer } from '@/app/api/[tenant]/settings/transfer/route'
import { POST as createUser } from '@/app/api/[tenant]/users/route'
import { PATCH as patchCompany } from '@/app/api/[tenant]/business/companies/[accountId]/route'

const SLUG = 'seg-test'
let tenant: { _id: mongoose.Types.ObjectId }
const ids = {
  admin: new mongoose.Types.ObjectId(),
  manager: new mongoose.Types.ObjectId(),
  cashier: new mongoose.Types.ObjectId(),
  staff: new mongoose.Types.ObjectId(),
  consumer: new mongoose.Types.ObjectId(),
}
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string

beforeAll(() => {
  process.env.POS_JWT_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }) as string
  __resetPosJwtKeyCacheForTests()
})

beforeEach(async () => {
  tenant = await Tenant.create({ slug: SLUG, name: 'Seguridad (test)', isActive: true, status: 'active', plan: 'full', flags: {} })
  clearFreshUserCache()
  await User.create(
    (Object.keys(ids) as (keyof typeof ids)[]).map((role, i) => ({
      _id: ids[role], name: role, email: `${role}@seg.test`, phone: `+54911000000${i}`, role, tenantId: tenant._id,
    }))
  )
  vi.mocked(auth).mockResolvedValue(null)
})

function as(role: keyof typeof ids) {
  vi.mocked(auth).mockResolvedValue({
    user: { id: ids[role].toString(), role, tenantId: tenant._id.toString(), tenantSlug: SLUG, assignedLocations: [], assignedTenants: [] },
    expires: '',
  } as unknown as Awaited<ReturnType<typeof auth>>)
}
const P = () => ({ params: Promise.resolve({ tenant: SLUG }) })
const req = (path: string, method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost/api/${SLUG}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

describe('C1 — CBU/alias de transferencia: solo admin', () => {
  const body = { enabled: true, alias: 'nuevo.alias', cbu: '0000000000000000000000' }

  it('cajero, staff y encargado reciben 403', async () => {
    for (const role of ['cashier', 'staff', 'manager'] as const) {
      as(role)
      expect((await putTransfer(req('/settings/transfer', 'PUT', body), P())).status, role).toBe(403)
    }
    const fresh = await Tenant.findById(tenant._id).lean<{ transfer?: { alias?: string | null } }>()
    expect(fresh?.transfer?.alias ?? null).not.toBe('nuevo.alias')
  })

  it('el admin lo cambia', async () => {
    as('admin')
    expect((await putTransfer(req('/settings/transfer', 'PUT', body), P())).status).toBe(200)
  })
})

describe('C1 — crear usuarios: solo admin (nada de escalar a manager)', () => {
  const nuevo = { name: 'Nuevo', email: 'nuevo@seg.test', password: 'Clave-Segura-123', role: 'manager' }

  it('staff, cajero y encargado reciben 403', async () => {
    for (const role of ['staff', 'cashier', 'manager'] as const) {
      as(role)
      expect((await createUser(req('/users', 'POST', nuevo), P())).status, role).toBe(403)
    }
    expect(await User.countDocuments({ email: 'nuevo@seg.test' })).toBe(0)
  })
})

describe('C1/B8 — un consumidor con tenantId no opera el panel', () => {
  it('403 aunque su usuario tenga el tenantId del comercio', async () => {
    as('consumer')
    expect((await putTransfer(req('/settings/transfer', 'PUT', { enabled: false }), P())).status).toBe(403)
  })
})

describe('A1 — el token del POS no abre el panel', () => {
  it('solo rutas /pos/* y el logout', () => {
    expect(isPosBearerPath(`/api/${SLUG}/pos/orders`)).toBe(true)
    expect(isPosBearerPath('/api/auth/logout')).toBe(true)
    expect(isPosBearerPath(`/api/${SLUG}/settings/transfer`)).toBe(false)
    expect(isPosBearerPath(`/api/${SLUG}/possible`)).toBe(false)
  })

  it('un token de admin del POS en settings/transfer → 401', async () => {
    const token = signJwt({ sub: ids.admin.toString(), tenantId: tenant._id.toString(), role: 'admin', deviceType: 'hub' }, PRIVATE_PEM)
    const res = await putTransfer(req('/settings/transfer', 'PUT', { enabled: false }, { authorization: `Bearer ${token}` }), P())
    expect(res.status).toBe(401)
  })
})

describe('A2 — cuenta corporativa compartida', () => {
  async function account(accessMode: 'all' | 'specific', tenantIds: unknown[]) {
    return CorporateAccount.create({
      companyName: 'Empresa', companyTaxId: '30-00000000-0', companyAdminEmail: 'rrhh@empresa.test',
      employeeEmails: [], accessMode, tenantIds, status: 'active', tenantSettings: [], registeredBy: 'superadmin', registeredById: new mongoose.Types.ObjectId(),
    } as unknown as Parameters<typeof CorporateAccount.create>[0])
  }

  it('compartida (accessMode all): el admin del comercio no cambia nombre, estado ni empleados', async () => {
    const acc = await account('all', [])
    as('admin')
    const P2 = { params: Promise.resolve({ tenant: SLUG, accountId: String(acc._id) }) }
    expect((await patchCompany(req(`/business/companies/${acc._id}`, 'PATCH', { status: 'suspended' }), P2)).status).toBe(403)
    expect((await patchCompany(req(`/business/companies/${acc._id}`, 'PATCH', { addEmployeeEmails: ['x@y.z'] }), P2)).status).toBe(403)
    const fresh = await CorporateAccount.findById(acc._id).lean<{ status: string; employeeEmails: string[] }>()
    expect(fresh?.status).toBe('active')
    expect(fresh?.employeeEmails).toEqual([])
  })

  it('exclusiva del comercio: el admin sí la gestiona', async () => {
    const acc = await account('specific', [tenant._id])
    as('admin')
    const P2 = { params: Promise.resolve({ tenant: SLUG, accountId: String(acc._id) }) }
    expect((await patchCompany(req(`/business/companies/${acc._id}`, 'PATCH', { notes: 'ok' }), P2)).status).toBe(200)
  })
})

describe('B2 — comparación en tiempo constante', () => {
  it('safeEqual', () => {
    expect(safeEqual('abc123', 'abc123')).toBe(true)
    expect(safeEqual('abc123', 'abc124')).toBe(false)
    expect(safeEqual('abc', 'abc123')).toBe(false)
    expect(safeEqual(null, 'x')).toBe(false)
    expect(safeEqual('', '')).toBe(false)
  })
})
