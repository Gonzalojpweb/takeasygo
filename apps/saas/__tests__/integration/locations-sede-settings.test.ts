import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { requireAuth, requireAdminRole, getSessionUser } from '@/lib/apiAuth'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/apiAuth', () => ({
  requireAuth: vi.fn().mockResolvedValue(null),
  requireAdminRole: vi.fn().mockResolvedValue(null),
  // El PUT de sede exige rol de gestión: por defecto, admin del tenant.
  getSessionUser: vi.fn().mockResolvedValue({ id: 'admin-id', role: 'admin', assignedLocations: [] }),
}))
vi.mock('@/lib/rbac', () => ({
  enforcePermissionForRequest: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/audit', () => ({
  logAudit: vi.fn(),
}))

import { PUT as putLocation, DELETE as deleteLocation } from '@/app/api/[tenant]/locations/[locationId]/route'
import { DELETE as deleteTransferAccount } from '@/app/api/[tenant]/settings/transfer-accounts/[accountId]/route'

/**
 * Campos nuevos de `Location.settings` (cuenta de transferencia, WhatsApp de
 * notificaciones y flags con herencia) + permisos de escritura por sede.
 * Regla: `null`/vacío = hereda el valor global del tenant.
 */

const SLUG = 'sede-settings-tenant'
const ACTIVE_ACC = '64b0000000000000000000c1'
const REF_ACC = '64b0000000000000000000c2'
const DELETED_ACC = '64b0000000000000000000c9'
const OTHER_LOCATION = '64b0000000000000000000d1'

let tenant!: Awaited<ReturnType<typeof Tenant.create>>
let location!: Awaited<ReturnType<typeof Location.create>>

function locParams() {
  return { params: Promise.resolve({ tenant: SLUG, locationId: location._id.toString() }) }
}

function putReq(body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/${SLUG}/locations/${location._id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function accParams(accountId: string) {
  return { params: Promise.resolve({ tenant: SLUG, accountId }) }
}

function deleteAccReq(accountId: string) {
  return new NextRequest(`http://localhost/api/${SLUG}/settings/transfer-accounts/${accountId}`, {
    method: 'DELETE',
  })
}

function mockSession(role: string, assignedLocations: string[]) {
  vi.mocked(getSessionUser).mockResolvedValue({
    role,
    assignedLocations,
  } as unknown as Awaited<ReturnType<typeof getSessionUser>>)
}

beforeEach(async () => {
  vi.mocked(requireAuth).mockResolvedValue(null)
  vi.mocked(requireAdminRole).mockResolvedValue(null)
  mockSession('admin', [])

  tenant = await Tenant.create({
    name: 'Tenant sedes',
    slug: SLUG,
    plan: 'full',
    status: 'active',
    isActive: true,
    transfer: { enabled: true, alias: 'legacy.alias', cbu: '0000000000000000000000' },
    transferAccounts: [
      { _id: ACTIVE_ACC, label: 'Activa', alias: 'activa', cbu: '111', isActive: true },
      { _id: REF_ACC, label: 'Referenciada', alias: 'referenciada', cbu: '222', isActive: false },
    ],
    notifications: { whatsappPhone: '+5491100000000', notifyOnOrder: true, notifyOnReservation: true },
  })
  location = await Location.create({
    tenantId: tenant._id,
    name: 'Sede Centro',
    slug: 'centro',
    address: 'Av. Siempreviva 742',
    settings: {},
  })
})

describe('PUT /locations/[locationId] — cuenta de transferencia por sede', () => {
  it('rechaza un transferAccountId que no pertenece al tenant (400) y no guarda nada', async () => {
    const res = await putLocation(putReq({ settings: { transferAccountId: DELETED_ACC } }), locParams())
    expect(res.status).toBe(400)
    const after = await Location.findById(location._id).lean()
    expect(after!.settings.transferAccountId).toBeNull()
  })

  it('acepta una cuenta existente aunque NO esté activa (existence-wins en la resolución)', async () => {
    const res = await putLocation(putReq({ settings: { transferAccountId: REF_ACC } }), locParams())
    expect(res.status).toBe(200)
    const after = await Location.findById(location._id).lean()
    expect(String(after!.settings.transferAccountId)).toBe(REF_ACC)
  })

  it('transferAccountId null limpia el override (vuelve a heredar del tenant)', async () => {
    await Location.updateOne(
      { _id: location._id },
      { $set: { 'settings.transferAccountId': REF_ACC } }
    )
    const res = await putLocation(putReq({ settings: { transferAccountId: null } }), locParams())
    expect(res.status).toBe(200)
    const after = await Location.findById(location._id).lean()
    expect(after!.settings.transferAccountId).toBeNull()
  })
})

describe('PUT /locations/[locationId] — WhatsApp y flags por sede', () => {
  it('whatsappPhone vacío o con espacios → null (hereda el WhatsApp general)', async () => {
    const res = await putLocation(putReq({ settings: { whatsappPhone: '   ' } }), locParams())
    expect(res.status).toBe(200)
    const after = await Location.findById(location._id).lean()
    expect(after!.settings.whatsappPhone).toBeNull()
  })

  it('normaliza el número con espacios al costado (mismo criterio que el global)', async () => {
    const res = await putLocation(
      putReq({ settings: { whatsappPhone: '  +54 9 11 4444-5555  ' } }),
      locParams()
    )
    expect(res.status).toBe(200)
    const after = await Location.findById(location._id).lean()
    expect(after!.settings.whatsappPhone).toBe('+54 9 11 4444-5555')
  })

  it('notifyOnOrder no booleano → 400', async () => {
    const res = await putLocation(putReq({ settings: { notifyOnOrder: 'yes' } }), locParams())
    expect(res.status).toBe(400)
    const after = await Location.findById(location._id).lean()
    expect(after!.settings.notifyOnOrder).toBeNull()
  })

  it('flags booleanos y null (heredar) se guardan tal cual', async () => {
    const res = await putLocation(
      putReq({ settings: { notifyOnOrder: false, notifyOnReservation: null } }),
      locParams()
    )
    expect(res.status).toBe(200)
    const after = await Location.findById(location._id).lean()
    expect(after!.settings.notifyOnOrder).toBe(false)
    expect(after!.settings.notifyOnReservation).toBeNull()
  })
})

describe('PUT /locations/[locationId] — aislamiento de escritura por sede', () => {
  it('usuario NO admin con sede asignada ajena → 403 y la sede NO se modifica', async () => {
    mockSession('manager', [OTHER_LOCATION])
    const res = await putLocation(
      putReq({ settings: { whatsappPhone: '+5491177778888' } }),
      locParams()
    )
    expect(res.status).toBe(403)
    const after = await Location.findById(location._id).lean()
    expect(after!.settings.whatsappPhone).toBeNull()
  })

  it('usuario NO admin sobre SU sede asignada → 200', async () => {
    mockSession('manager', [location._id.toString()])
    const res = await putLocation(
      putReq({ settings: { whatsappPhone: '+5491177778888' } }),
      locParams()
    )
    expect(res.status).toBe(200)
    const after = await Location.findById(location._id).lean()
    expect(after!.settings.whatsappPhone).toBe('+5491177778888')
  })

  it('admin (sin sede asignada) → 200: cruce de sedes permitido', async () => {
    mockSession('admin', [])
    const res = await putLocation(putReq({ settings: { notifyOnOrder: false } }), locParams())
    expect(res.status).toBe(200)
    const after = await Location.findById(location._id).lean()
    expect(after!.settings.notifyOnOrder).toBe(false)
  })

  it('DELETE de sede ajena con scope asignado → 403', async () => {
    mockSession('manager', [OTHER_LOCATION])
    const res = await deleteLocation(
      new NextRequest(`http://localhost/api/${SLUG}/locations/${location._id}`, { method: 'DELETE' }),
      locParams()
    )
    expect(res.status).toBe(403)
    const after = await Location.findById(location._id).lean()
    expect(after!.isActive).toBe(true)
  })
})

describe('DELETE /settings/transfer-accounts/[accountId]', () => {
  it('cuenta referenciada por una sede → 409 y la cuenta NO se borra', async () => {
    await Location.updateOne(
      { _id: location._id },
      { $set: { 'settings.transferAccountId': REF_ACC } }
    )
    const res = await deleteTransferAccount(deleteAccReq(REF_ACC), accParams(REF_ACC))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain('Sede Centro')
    const tenantAfter = await Tenant.findById(tenant._id).lean()
    expect(tenantAfter!.transferAccounts.some((a: { _id: unknown }) => String(a._id) === REF_ACC)).toBe(true)
  })

  it('cuenta inactiva sin referencias → 200 y desaparece', async () => {
    const res = await deleteTransferAccount(deleteAccReq(REF_ACC), accParams(REF_ACC))
    expect(res.status).toBe(200)
    const tenantAfter = await Tenant.findById(tenant._id).lean()
    expect(tenantAfter!.transferAccounts.some((a: { _id: unknown }) => String(a._id) === REF_ACC)).toBe(false)
  })

  it('la cuenta activa sigue protegida por la regla previa (400)', async () => {
    const res = await deleteTransferAccount(deleteAccReq(ACTIVE_ACC), accParams(ACTIVE_ACC))
    expect(res.status).toBe(400)
  })
})
