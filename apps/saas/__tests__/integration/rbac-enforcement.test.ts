// ============================================================================
// rbac-enforcement.test.ts — Matriz v3 + flag `rbac.sedeScope` (M3, B.8)
// ============================================================================
// Cablea `enforcePermission` en rutas core y prueba las 3 formas:
//   Pattern A (requireAuth + enforce):     flag off = sin cambios; flag on = matriz
//   Pattern B (admin-only → matriz):       flag off = admin-only; flag on = admin+manager
//   Pattern C (requireAdminRole + matriz): admin-only en ambos flags
//
// Regla "no romper lo que funciona": con flag OFF (default) ninguna ruta
// nueva devuelve 403 por RBAC.
//
// Ejecutar: npx vitest run __tests__/integration/rbac-enforcement.test.ts
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

import Tenant from '@/models/Tenant'
import UserLocationRole from '@/models/UserLocationRole'
import User from '@/models/User'
import { clearFreshUserCache } from '@/lib/apiAuth'
import { POST as cashAdjustment } from '@/app/api/[tenant]/cash-adjustment/route'
import { GET as listUsers } from '@/app/api/[tenant]/users/route'
import { PUT as putBranding } from '@/app/api/[tenant]/settings/branding/route'
import { POST as cleanupCancelled } from '@/app/api/[tenant]/orders/cleanup-cancelled/route'
import { GET as getApiKeys } from '@/app/api/[tenant]/settings/api-keys/route'
import { auth } from '@/lib/auth'

const SLUG = 'rbac-test'
const FLAG = 'rbac.sedeScope'

let tenant: any
const staffId = new mongoose.Types.ObjectId()
const managerId = new mongoose.Types.ObjectId()
const cashierId = new mongoose.Types.ObjectId()
const adminId = new mongoose.Types.ObjectId()

beforeEach(async () => {
  tenant = await Tenant.create({
    slug: SLUG,
    name: 'RBAC (test)',
    isActive: true,
    status: 'active',
    plan: 'full',
    flags: {},
  })
  // getSessionUser relee el usuario de la DB (permisos frescos): las
  // sesiones de los tests apuntan a usuarios reales con el mismo rol.
  clearFreshUserCache()
  await User.create([
    { _id: staffId, name: 'Staff', email: 'staff@rbac.test', phone: '+549110000001', role: 'staff', tenantId: tenant._id },
    { _id: managerId, name: 'Manager', email: 'manager@rbac.test', phone: '+549110000002', role: 'manager', tenantId: tenant._id },
    { _id: cashierId, name: 'Cashier', email: 'cashier@rbac.test', phone: '+549110000003', role: 'cashier', tenantId: tenant._id },
    { _id: adminId, name: 'Admin', email: 'admin@rbac.test', phone: '+549110000004', role: 'admin', tenantId: tenant._id },
  ])
})

async function setFlag(value: boolean) {
  tenant.flags = { [FLAG]: value }
  tenant.markModified('flags')
  await tenant.save()
}

async function seedRole(userId: mongoose.Types.ObjectId, role: string) {
  await UserLocationRole.create({
    tenantId: tenant._id,
    userId,
    locationId: null,
    role,
    isActive: true,
  })
}

function setSession(user: { id: mongoose.Types.ObjectId; role: string }) {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: user.id.toString(),
      role: user.role,
      tenantId: tenant._id.toString(),
      tenantSlug: SLUG,
      assignedLocations: [],
      assignedTenants: [tenant._id.toString()],
    },
    expires: '',
  } as any)
}

function jsonRequest(path: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/${SLUG}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function params() {
  return { params: Promise.resolve({ tenant: SLUG }) }
}

describe('Pattern A — requireAuth + enforcePermission (rutas con guard de sesión)', () => {
  // Auditoría de seguridad 30/10/2026 (C1): con el flag apagado (estado de
  // todos los comercios) staff podía cambiar la marca y ajustar caja. Ahora
  // hay una guardia de rol DURA que no depende del flag (requireTenantRole);
  // las lecturas (GET /users) siguen igual.
  it('flag OFF (default): staff lee users, pero NO cambia branding ni ajusta caja', async () => {
    setSession({ id: staffId, role: 'staff' })

    const usersRes = await listUsers(jsonRequest('/users', 'GET'), params())
    expect(usersRes.status).toBe(200)

    const brandingRes = await putBranding(
      jsonRequest('/settings/branding', 'PUT', {}),
      params()
    )
    expect(brandingRes.status).toBe(403)

    const cashRes = await cashAdjustment(
      jsonRequest('/cash-adjustment', 'POST', { orderId: new mongoose.Types.ObjectId().toString() }),
      params()
    )
    expect(cashRes.status).toBe(403)
  })

  it('flag OFF: manager cambia branding (400 = pasó la guardia) y cashier ajusta caja (404)', async () => {
    setSession({ id: managerId, role: 'manager' })
    expect((await putBranding(jsonRequest('/settings/branding', 'PUT', {}), params())).status).toBe(400)
    setSession({ id: cashierId, role: 'cashier' })
    expect(
      (await cashAdjustment(
        jsonRequest('/cash-adjustment', 'POST', { orderId: new mongoose.Types.ObjectId().toString() }),
        params()
      )).status
    ).toBe(404)
  })

  it('flag ON: staff recibe 403 en users/branding/cash-adjustment; manager y cashier pasan', async () => {
    await setFlag(true)
    await seedRole(staffId, 'staff')
    await seedRole(managerId, 'manager')
    await seedRole(cashierId, 'cashier')

    setSession({ id: staffId, role: 'staff' })
    expect((await listUsers(jsonRequest('/users', 'GET'), params())).status).toBe(403)
    expect((await putBranding(jsonRequest('/settings/branding', 'PUT', {}), params())).status).toBe(403)
    expect(
      (await cashAdjustment(
        jsonRequest('/cash-adjustment', 'POST', { orderId: new mongoose.Types.ObjectId().toString() }),
        params()
      )).status
    ).toBe(403)

    // manager tiene users.read y settings.write en la matriz v3.
    setSession({ id: managerId, role: 'manager' })
    expect((await listUsers(jsonRequest('/users', 'GET'), params())).status).toBe(200)
    expect((await putBranding(jsonRequest('/settings/branding', 'PUT', {}), params())).status).toBe(400)

    // cashier tiene cash.movements.write (no orders ni settings).
    setSession({ id: cashierId, role: 'cashier' })
    expect(
      (await cashAdjustment(
        jsonRequest('/cash-adjustment', 'POST', { orderId: new mongoose.Types.ObjectId().toString() }),
        params()
      )).status
    ).toBe(404)
    expect((await listUsers(jsonRequest('/users', 'GET'), params())).status).toBe(403)
  })
})

describe('Pattern B — enforcePermissionOrAdmin (admin-only hoy, admin+manager con flag)', () => {
  it('flag OFF: manager recibe 403 (cleanup-cancelled sigue siendo admin-only)', async () => {
    setSession({ id: managerId, role: 'manager' })
    const res = await cleanupCancelled(jsonRequest('/orders/cleanup-cancelled', 'POST', {}), params())
    expect(res.status).toBe(403)
  })

  it('flag ON: manager pasa el guard, staff recibe 403', async () => {
    await setFlag(true)
    await seedRole(managerId, 'manager')
    await seedRole(staffId, 'staff')

    setSession({ id: managerId, role: 'manager' })
    const okRes = await cleanupCancelled(jsonRequest('/orders/cleanup-cancelled', 'POST', {}), params())
    expect(okRes.status).toBe(200)

    setSession({ id: staffId, role: 'staff' })
    const deniedRes = await cleanupCancelled(jsonRequest('/orders/cleanup-cancelled', 'POST', {}), params())
    expect(deniedRes.status).toBe(403)
    expect((await deniedRes.json()).error).toBe('Acceso denegado')
  })
})

describe('Pattern C — requireAdminRole + matriz (admin-only en ambos flags)', () => {
  it('flag ON: manager sigue fuera de api-keys; admin del tenant pasa por fallback legacy', async () => {
    await setFlag(true)
    await seedRole(managerId, 'manager')

    setSession({ id: managerId, role: 'manager' })
    const managerRes = await getApiKeys(jsonRequest('/settings/api-keys', 'GET'), params())
    expect(managerRes.status).toBe(403)

    // admin sin fila en user_location_roles → fallback legacy (rollout seguro).
    setSession({ id: adminId, role: 'admin' })
    const adminRes = await getApiKeys(jsonRequest('/settings/api-keys', 'GET'), params())
    expect(adminRes.status).toBe(200)
    expect((await adminRes.json()).keys).toEqual([])
  })

  it('flag OFF: admin funciona y manager queda fuera (comportamiento actual)', async () => {
    setSession({ id: adminId, role: 'admin' })
    expect((await getApiKeys(jsonRequest('/settings/api-keys', 'GET'), params())).status).toBe(200)

    setSession({ id: managerId, role: 'manager' })
    expect((await getApiKeys(jsonRequest('/settings/api-keys', 'GET'), params())).status).toBe(403)
  })
})
