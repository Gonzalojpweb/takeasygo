import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'
import mongoose from 'mongoose'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

import { auth } from '@/lib/auth'
import { rateLimit } from '@/lib/rateLimit'
import Tenant from '@/models/Tenant'
import CorporateAccount from '@/models/CorporateAccount'
import User from '@/models/User'
import { signCorpActivationToken, verifyCorpActivationToken } from '@/lib/corpActivation'

import { GET as summaryGET } from '@/app/api/[tenant]/business/corp/summary/route'
import { GET as exportGET } from '@/app/api/[tenant]/business/corp/orders/export/route'
import { GET as employeesGET, POST as employeesPOST } from '@/app/api/[tenant]/business/corp/employees/route'
import { DELETE as employeeDelete } from '@/app/api/[tenant]/business/corp/employees/[email]/route'
import { POST as activationLinkPOST } from '@/app/api/business/corp/activation-link/route'
import { POST as activatePOST } from '@/app/api/business/corp/activate/route'

const TENANT_SLUG = 'kekelarry'
const ADMIN_EMAIL = 'admin-corp@empresa.com'
const EMPLOYEE_EMAIL = 'empleado@empresa.com'

let tenantId: mongoose.Types.ObjectId
let accountId: mongoose.Types.ObjectId

function session(email: string) {
  return { user: { id: 'user-' + email, email, role: 'staff', tenantId: String(tenantId) } }
}

function req(url: string, init: RequestInit = {}) {
  return new NextRequest(`http://localhost/api${url}`, init)
}

beforeEach(async () => {
  vi.clearAllMocks()
  process.env.AUTH_SECRET = 'test-secret-corp-activation'
  vi.mocked(rateLimit).mockResolvedValue({ success: true, remaining: 99 })
  vi.mocked(auth).mockResolvedValue(null as any)

  const tenant = await Tenant.create({ name: 'Keké', slug: TENANT_SLUG, isActive: true })
  tenantId = tenant._id as mongoose.Types.ObjectId

  const account = await CorporateAccount.create({
    accessMode: 'specific',
    tenantIds: [tenantId],
    companyName: 'ACME SA',
    status: 'active',
    registeredBy: 'superadmin',
    registeredById: new mongoose.Types.ObjectId(),
    companyAdminEmail: ADMIN_EMAIL,
    employeeEmails: [EMPLOYEE_EMAIL],
  })
  accountId = account._id as mongoose.Types.ObjectId

  await User.create({ name: 'Admin', email: ADMIN_EMAIL, role: 'staff', tenantId, phone: '541100000001' })
  await User.create({ name: 'Emp', email: EMPLOYEE_EMAIL, role: 'staff', tenantId, phone: '541100000002' })
})

describe('cierre business/corp/* con requireCorpAccess', () => {
  it('summary sin sesión → 401', async () => {
    const res = await summaryGET(req(`/${TENANT_SLUG}/business/corp/summary`), { params: Promise.resolve({ tenant: TENANT_SLUG }) })
    expect(res.status).toBe(401)
  })

  it('summary con sesión de email que no es de la cuenta → 403', async () => {
    vi.mocked(auth).mockResolvedValue(session('otro@empresa.com'))
    const res = await summaryGET(req(`/${TENANT_SLUG}/business/corp/summary`), { params: Promise.resolve({ tenant: TENANT_SLUG }) })
    expect(res.status).toBe(403)
  })

  it('summary con sesión de admin → 200', async () => {
    vi.mocked(auth).mockResolvedValue(session(ADMIN_EMAIL))
    const res = await summaryGET(req(`/${TENANT_SLUG}/business/corp/summary`), { params: Promise.resolve({ tenant: TENANT_SLUG }) })
    expect(res.status).toBe(200)
  })

  it('summary con sesión de empleado → 200 (lectura permitida)', async () => {
    vi.mocked(auth).mockResolvedValue(session(EMPLOYEE_EMAIL))
    const res = await summaryGET(req(`/${TENANT_SLUG}/business/corp/summary`), { params: Promise.resolve({ tenant: TENANT_SLUG }) })
    expect(res.status).toBe(200)
  })

  it('export con empleado → 403; con admin → 200 (CSV)', async () => {
    vi.mocked(auth).mockResolvedValue(session(EMPLOYEE_EMAIL))
    const denied = await exportGET(req(`/${TENANT_SLUG}/business/corp/orders/export`), { params: Promise.resolve({ tenant: TENANT_SLUG }) })
    expect(denied.status).toBe(403)

    vi.mocked(auth).mockResolvedValue(session(ADMIN_EMAIL))
    const ok = await exportGET(req(`/${TENANT_SLUG}/business/corp/orders/export`), { params: Promise.resolve({ tenant: TENANT_SLUG }) })
    expect(ok.status).toBe(200)
    expect(ok.headers.get('content-type')).toContain('text/csv')
  })

  it('employees GET: empleado → 403; admin → 200 con lista', async () => {
    vi.mocked(auth).mockResolvedValue(session(EMPLOYEE_EMAIL))
    const denied = await employeesGET(req(`/${TENANT_SLUG}/business/corp/employees`), { params: Promise.resolve({ tenant: TENANT_SLUG }) })
    expect(denied.status).toBe(403)

    vi.mocked(auth).mockResolvedValue(session(ADMIN_EMAIL))
    const ok = await employeesGET(req(`/${TENANT_SLUG}/business/corp/employees`), { params: Promise.resolve({ tenant: TENANT_SLUG }) })
    expect(ok.status).toBe(200)
    const data = await ok.json()
    expect(data.employees).toContain(EMPLOYEE_EMAIL)
  })

  it('employees POST como admin agrega un email; como empleado → 403', async () => {
    vi.mocked(auth).mockResolvedValue(session(EMPLOYEE_EMAIL))
    const denied = await employeesPOST(
      req(`/${TENANT_SLUG}/business/corp/employees`, { method: 'POST', body: JSON.stringify({ newEmployeeEmails: ['nuevo@empresa.com'] }) }),
      { params: Promise.resolve({ tenant: TENANT_SLUG }) }
    )
    expect(denied.status).toBe(403)

    vi.mocked(auth).mockResolvedValue(session(ADMIN_EMAIL))
    const ok = await employeesPOST(
      req(`/${TENANT_SLUG}/business/corp/employees`, { method: 'POST', body: JSON.stringify({ newEmployeeEmails: ['nuevo@empresa.com'] }) }),
      { params: Promise.resolve({ tenant: TENANT_SLUG }) }
    )
    expect(ok.status).toBe(200)
    const updated = await CorporateAccount.findById(accountId).lean()
    expect(updated?.employeeEmails).toContain('nuevo@empresa.com')
  })

  it('DELETE employees/[email] como admin funciona; body/email del cliente ya no autentican', async () => {
    // Sin sesión: el body con el email del admin ya no alcanza
    const sinSesion = await employeeDelete(
      req(`/${TENANT_SLUG}/business/corp/employees/${encodeURIComponent(EMPLOYEE_EMAIL)}`, {
        method: 'DELETE',
        body: JSON.stringify({ corporateAccountId: String(accountId), email: ADMIN_EMAIL }),
      }),
      { params: Promise.resolve({ tenant: TENANT_SLUG, email: EMPLOYEE_EMAIL }) }
    )
    expect(sinSesion.status).toBe(401)

    vi.mocked(auth).mockResolvedValue(session(ADMIN_EMAIL))
    const ok = await employeeDelete(
      req(`/${TENANT_SLUG}/business/corp/employees/${encodeURIComponent(EMPLOYEE_EMAIL)}`, { method: 'DELETE' }),
      { params: Promise.resolve({ tenant: TENANT_SLUG, email: EMPLOYEE_EMAIL }) }
    )
    expect(ok.status).toBe(200)
    const updated = await CorporateAccount.findById(accountId).lean()
    expect(updated?.employeeEmails).not.toContain(EMPLOYEE_EMAIL)
  })
})

describe('activación de cuenta corporativa (token de un solo uso, 24 h)', () => {
  it('sign/verify roundtrip y rechaza firma ajena', () => {
    const token = signCorpActivationToken(String(accountId), EMPLOYEE_EMAIL)
    expect(token).toBeTruthy()
    const v = verifyCorpActivationToken(token!)
    expect(v.valid).toBe(true)
    if (v.valid) {
      expect(v.email).toBe(EMPLOYEE_EMAIL)
      expect(v.accountId).toBe(String(accountId))
    }
    const tampered = token!.slice(0, -4) + 'AAAA'
    expect(verifyCorpActivationToken(tampered).valid).toBe(false)
  })

  it('token expirado → inválido', () => {
    vi.useFakeTimers()
    try {
      const token = signCorpActivationToken(String(accountId), EMPLOYEE_EMAIL)!
      vi.advanceTimersByTime(25 * 60 * 60 * 1000)
      const v = verifyCorpActivationToken(token)
      expect(v.valid).toBe(false)
      if (!v.valid) expect(v.reason).toBe('expired')
    } finally {
      vi.useRealTimers()
    }
  })

  it('activation-link requiere sesión de admin de la cuenta', async () => {
    const sinSesion = await activationLinkPOST(
      req('/business/corp/activation-link', { method: 'POST', body: JSON.stringify({ email: EMPLOYEE_EMAIL }) })
    )
    expect(sinSesion.status).toBe(401)

    vi.mocked(auth).mockResolvedValue(session(EMPLOYEE_EMAIL))
    const empleado = await activationLinkPOST(
      req('/business/corp/activation-link', { method: 'POST', body: JSON.stringify({ email: EMPLOYEE_EMAIL }) })
    )
    expect(empleado.status).toBe(403)

    vi.mocked(auth).mockResolvedValue(session(ADMIN_EMAIL))
    const admin = await activationLinkPOST(
      req('/business/corp/activation-link', { method: 'POST', body: JSON.stringify({ email: EMPLOYEE_EMAIL }) })
    )
    expect(admin.status).toBe(200)
    const data = await admin.json()
    expect(data.activationUrl).toContain('token=')
  })

  it('activate crea el usuario con el email del token; segundo canje → 409; no permite otro email', async () => {
    const pendiente = 'pendiente@empresa.com'
    await CorporateAccount.updateOne({ _id: accountId }, { $addToSet: { employeeEmails: pendiente } })
    const token = signCorpActivationToken(String(accountId), pendiente)!

    const res = await activatePOST(
      req('/business/corp/activate', { method: 'POST', body: JSON.stringify({ token, password: 'password123' }) })
    )
    expect(res.status).toBe(200)
    const created = await User.findOne({ email: pendiente })
    expect(created).toBeTruthy()

    // Un solo uso
    const again = await activatePOST(
      req('/business/corp/activate', { method: 'POST', body: JSON.stringify({ token, password: 'password123' }) })
    )
    expect(again.status).toBe(409)

    // El token no puede crear un usuario con otro email (el email sale del token)
    const otherToken = signCorpActivationToken(String(accountId), 'otro@empresa.com')!
    const other = await activatePOST(
      req('/business/corp/activate', { method: 'POST', body: JSON.stringify({ token: otherToken, password: 'password123' }) })
    )
    // 'otro@empresa.com' no pertenece a la cuenta → 403
    expect(other.status).toBe(403)
    expect(await User.findOne({ email: 'otro@empresa.com' })).toBeNull()
  })
})

