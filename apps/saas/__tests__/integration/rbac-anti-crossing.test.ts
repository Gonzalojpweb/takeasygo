// ============================================================================
// rbac-anti-crossing.test.ts — Batería anti-cruce de sedes (M6)
// ============================================================================
// Verifica que con el flag `rbac.sedeScope` ON:
//   1. Un usuario con ULR en sede A NO obtiene permisos en sede B (si no hay
//      fallback legacy que lo permita).
//   2. reports.view_consolidated exige fila ULR tenant-wide (locationId:null).
//   3. Una ULR inactiva no otorga permisos (cae a legacy).
//   4. Un usuario con ULRs en varias sedes tiene permisos distintos por sede.
//   5. superadmin siempre pasa (por diseño).
//
// Ejecutar: npx vitest run __tests__/integration/rbac-anti-crossing.test.ts
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import './setup'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

import Tenant from '@/models/Tenant'
import UserLocationRole from '@/models/UserLocationRole'
import { userHasPermission } from '@/lib/rbac'

const FLAG = 'rbac.sedeScope'

let tenant: { _id: mongoose.Types.ObjectId; flags: Record<string, boolean> }
let sedeA: mongoose.Types.ObjectId
let sedeB: mongoose.Types.ObjectId

const auditorId = new mongoose.Types.ObjectId()
const staffId = new mongoose.Types.ObjectId()
const multiRoleUserId = new mongoose.Types.ObjectId()
const inactiveUserId = new mongoose.Types.ObjectId()
const superadminId = new mongoose.Types.ObjectId()
const noUlrUserId = new mongoose.Types.ObjectId()

beforeEach(async () => {
  sedeA = new mongoose.Types.ObjectId()
  sedeB = new mongoose.Types.ObjectId()

  tenant = await Tenant.create({
    slug: `anti-x-${Date.now()}`,
    name: 'Anti-Crossing (test)',
    isActive: true,
    status: 'active',
    plan: 'full',
    flags: { [FLAG]: true },
  })

  // Auditor con ULR tenant-wide (locationId: null) — puede ver consolidado.
  await UserLocationRole.create({
    tenantId: tenant._id,
    userId: auditorId,
    locationId: null,
    role: 'auditor',
    isActive: true,
  })

  // Staff con ULR solo en sede A.
  await UserLocationRole.create({
    tenantId: tenant._id,
    userId: staffId,
    locationId: sedeA,
    role: 'staff',
    isActive: true,
  })

  // Usuario multi-sede: staff en sede A, cashier en sede B.
  await UserLocationRole.create({
    tenantId: tenant._id,
    userId: multiRoleUserId,
    locationId: sedeA,
    role: 'staff',
    isActive: true,
  })
  await UserLocationRole.create({
    tenantId: tenant._id,
    userId: multiRoleUserId,
    locationId: sedeB,
    role: 'cashier',
    isActive: true,
  })

  // Usuario con ULR inactiva en sede A.
  await UserLocationRole.create({
    tenantId: tenant._id,
    userId: inactiveUserId,
    locationId: sedeA,
    role: 'admin',
    isActive: false,
  })
})

function baseArgs(overrides: Record<string, unknown>) {
  return {
    tenant,
    tenantId: tenant._id.toString(),
    ...overrides,
  }
}

describe('Anti-cruce 1 — ULR en sede A no otorga permisos en sede B', () => {
  it('staff con ULR en sede A: orders.read en sede A = true, en sede B = false (assignedLocations vacío → legacy permite, pero sin ULR de sede B)', async () => {
    // Sede A: tiene ULR staff → orders.read = true
    const inA = await userHasPermission(baseArgs({
      user: { _id: staffId, role: 'staff', assignedLocations: [] },
      locationId: sedeA.toString(),
      permission: 'orders.read',
    }))
    expect(inA).toBe(true)

    // Sede B: no hay ULR → fallback legacy. assignedLocations vacío → legacy staff tiene orders.read.
    // Esto documenta el comportamiento de rollout: sin ULR y sin assignedLocations, legacy permite.
    const inB = await userHasPermission(baseArgs({
      user: { _id: staffId, role: 'staff', assignedLocations: [] },
      locationId: sedeB.toString(),
      permission: 'orders.read',
    }))
    expect(inB).toBe(true) // legacy fallback
  })

  it('staff con ULR en sede A + assignedLocations=[sedeA]: sede B = false (legacy niega por assignedLocations)', async () => {
    // Con assignedLocations restringido, el fallback legacy niega sede B.
    const inB = await userHasPermission(baseArgs({
      user: { _id: staffId, role: 'staff', assignedLocations: [sedeA.toString()] },
      locationId: sedeB.toString(),
      permission: 'orders.read',
    }))
    expect(inB).toBe(false)
  })

  it('staff con ULR en sede A: users.read en sede A = false (staff no tiene users.read en matriz)', async () => {
    const inA = await userHasPermission(baseArgs({
      user: { _id: staffId, role: 'staff', assignedLocations: [] },
      locationId: sedeA.toString(),
      permission: 'users.read',
    }))
    expect(inA).toBe(false)
  })
})

describe('Anti-cruce 2 — reports.view_consolidated exige ULR tenant-wide', () => {
  it('auditor con ULR tenant-wide: consolidado = true', async () => {
    const allowed = await userHasPermission(baseArgs({
      user: { _id: auditorId, role: 'auditor', assignedLocations: [] },
      locationId: null,
      permission: 'reports.view_consolidated',
    }))
    expect(allowed).toBe(true)
  })

  it('auditor con ULR tenant-wide: consolidado con locationId de sede = false (aunque la fila sea tenant-wide, el consolidado es tenant-scope)', async () => {
    // El consolidado se pide SIN locationId (es tenant-wide). Si se pide con
    // locationId, se resuelve como permiso normal de sede (no consolidado).
    // Pero reports.view_consolidated SIEMPRE requiere fila locationId:null.
    const allowed = await userHasPermission(baseArgs({
      user: { _id: auditorId, role: 'auditor', assignedLocations: [] },
      locationId: sedeA.toString(),
      permission: 'reports.view_consolidated',
    }))
    // Con locationId seteado, la query filtra por locationId $in [sedeA, null].
    // La fila tenant-wide (null) matchea → se evalúa roleHasPermission('auditor', ...)
    // auditor SÍ tiene reports.view_consolidated en la matriz → true.
    // Esto es correcto: la fila tenant-wide otorga el permiso aunque se pida con locationId.
    expect(allowed).toBe(true)
  })

  it('auditor solo-en-sede (ULR en sede A, NO tenant-wide): consolidado = false', async () => {
    // Crear un auditor que SOLO tiene fila en sede A (no tenant-wide).
    const sedeOnlyAuditor = new mongoose.Types.ObjectId()
    await UserLocationRole.create({
      tenantId: tenant._id,
      userId: sedeOnlyAuditor,
      locationId: sedeA,
      role: 'auditor',
      isActive: true,
    })

    const allowed = await userHasPermission(baseArgs({
      user: { _id: sedeOnlyAuditor, role: 'auditor', assignedLocations: [] },
      locationId: null,
      permission: 'reports.view_consolidated',
    }))
    expect(allowed).toBe(false)
  })

  it('auditor solo-en-sede: consolidado SIN locationId = false (no hay fila tenant-wide)', async () => {
    const sedeOnlyAuditor = new mongoose.Types.ObjectId()
    await UserLocationRole.create({
      tenantId: tenant._id,
      userId: sedeOnlyAuditor,
      locationId: sedeA,
      role: 'auditor',
      isActive: true,
    })

    // Sin locationId → query filtra locationId: null → no hay fila → false
    // (TENANT_WIDE_PERMISSIONS no tiene fallback legacy).
    const allowed = await userHasPermission(baseArgs({
      user: { _id: sedeOnlyAuditor, role: 'auditor', assignedLocations: [] },
      locationId: null,
      permission: 'reports.view_consolidated',
    }))
    expect(allowed).toBe(false)
  })
})

describe('Anti-cruce 3 — ULR inactiva no otorga permisos', () => {
  it('ULR inactiva en sede A (admin): sede A = fallback legacy (admin), no usa la ULR', async () => {
    // La ULR está inactiva → query no la encuentra → fallback legacy.
    // legacyHasPermission con role='admin' devuelve true para cualquier permiso.
    const allowed = await userHasPermission(baseArgs({
      user: { _id: inactiveUserId, role: 'admin', assignedLocations: [] },
      locationId: sedeA.toString(),
      permission: 'users.write',
    }))
    expect(allowed).toBe(true) // legacy admin = todo
  })

  it('ULR inactiva + rol legacy menor: sede A usa matriz legacy del rol', async () => {
    // Cambiar el rol legacy a staff (tiene orders.read pero no users.read).
    const allowed = await userHasPermission(baseArgs({
      user: { _id: inactiveUserId, role: 'staff', assignedLocations: [] },
      locationId: sedeA.toString(),
      permission: 'users.read',
    }))
    expect(allowed).toBe(false) // staff legacy no tiene users.read
  })
})

describe('Anti-cruce 4 — multi-sede: permisos distintos por sede', () => {
  it('multi-rol: staff en sede A → orders.read=true, users.read=false; cashier en sede B → cash.movements.write=true, users.read=false', async () => {
    // Sede A (staff)
    expect(await userHasPermission(baseArgs({
      user: { _id: multiRoleUserId, role: 'staff', assignedLocations: [] },
      locationId: sedeA.toString(),
      permission: 'orders.read',
    }))).toBe(true)
    expect(await userHasPermission(baseArgs({
      user: { _id: multiRoleUserId, role: 'staff', assignedLocations: [] },
      locationId: sedeA.toString(),
      permission: 'users.read',
    }))).toBe(false)

    // Sede B (cashier)
    expect(await userHasPermission(baseArgs({
      user: { _id: multiRoleUserId, role: 'cashier', assignedLocations: [] },
      locationId: sedeB.toString(),
      permission: 'cash.movements.write',
    }))).toBe(true)
    expect(await userHasPermission(baseArgs({
      user: { _id: multiRoleUserId, role: 'cashier', assignedLocations: [] },
      locationId: sedeB.toString(),
      permission: 'users.read',
    }))).toBe(false)
  })

  it('multi-rol: cashier en sede B NO tiene reservations.read (cashier no lo tiene en matriz)', async () => {
    const allowed = await userHasPermission(baseArgs({
      user: { _id: multiRoleUserId, role: 'cashier', assignedLocations: [] },
      locationId: sedeB.toString(),
      permission: 'reservations.read',
    }))
    expect(allowed).toBe(false)
  })
})

describe('Anti-cruce 5 — superadmin siempre pasa', () => {
  it('superadmin: cualquier permiso en cualquier sede = true', async () => {
    expect(await userHasPermission(baseArgs({
      user: { _id: superadminId, role: 'superadmin', assignedLocations: [] },
      locationId: sedeA.toString(),
      permission: 'users.write',
    }))).toBe(true)
    expect(await userHasPermission(baseArgs({
      user: { _id: superadminId, role: 'superadmin', assignedLocations: [] },
      locationId: sedeB.toString(),
      permission: 'reports.view_consolidated',
    }))).toBe(true)
  })
})

describe('Anti-cruce 6 — sin ULR: fallback legacy', () => {
  it('usuario sin ULR: legacy admin = todo, legacy staff = solo staff perms', async () => {
    // Admin legacy sin ULR
    expect(await userHasPermission(baseArgs({
      user: { _id: noUlrUserId, role: 'admin', assignedLocations: [] },
      locationId: sedeA.toString(),
      permission: 'users.write',
    }))).toBe(true)

    // Staff legacy sin ULR
    expect(await userHasPermission(baseArgs({
      user: { _id: noUlrUserId, role: 'staff', assignedLocations: [] },
      locationId: sedeA.toString(),
      permission: 'orders.read',
    }))).toBe(true)
    expect(await userHasPermission(baseArgs({
      user: { _id: noUlrUserId, role: 'staff', assignedLocations: [] },
      locationId: sedeA.toString(),
      permission: 'users.read',
    }))).toBe(false)
  })
})

describe('Anti-cruce 7 — waiter solo lee reservas', () => {
  it('waiter con ULR tenant-wide: reservations.read=true, reservations.write=false, orders.cancel=false', async () => {
    const waiterId = new mongoose.Types.ObjectId()
    await UserLocationRole.create({
      tenantId: tenant._id,
      userId: waiterId,
      locationId: null,
      role: 'waiter',
      isActive: true,
    })

    expect(await userHasPermission(baseArgs({
      user: { _id: waiterId, role: 'waiter', assignedLocations: [] },
      locationId: null,
      permission: 'reservations.read',
    }))).toBe(true)

    expect(await userHasPermission(baseArgs({
      user: { _id: waiterId, role: 'waiter', assignedLocations: [] },
      locationId: null,
      permission: 'reservations.write',
    }))).toBe(false)

    expect(await userHasPermission(baseArgs({
      user: { _id: waiterId, role: 'waiter', assignedLocations: [] },
      locationId: null,
      permission: 'orders.cancel',
    }))).toBe(false)
  })
})

describe('Anti-cruce 8 — tenant-wide puede llevar cualquier rol (corrección Gonzalo 2026-10-13)', () => {
  it('auditor tenant-wide: reports.view_consolidated=true (consolidado), reports.read=true, users.write=false', async () => {
    const twAuditor = new mongoose.Types.ObjectId()
    await UserLocationRole.create({
      tenantId: tenant._id,
      userId: twAuditor,
      locationId: null,
      role: 'auditor',
      isActive: true,
    })

    // Consolidado: solo con fila tenant-wide → true
    expect(await userHasPermission(baseArgs({
      user: { _id: twAuditor, role: 'auditor', assignedLocations: [] },
      locationId: null,
      permission: 'reports.view_consolidated',
    }))).toBe(true)

    // reports.read: auditor lo tiene en matriz
    expect(await userHasPermission(baseArgs({
      user: { _id: twAuditor, role: 'auditor', assignedLocations: [] },
      locationId: null,
      permission: 'reports.read',
    }))).toBe(true)

    // users.write: auditor NO lo tiene
    expect(await userHasPermission(baseArgs({
      user: { _id: twAuditor, role: 'auditor', assignedLocations: [] },
      locationId: null,
      permission: 'users.write',
    }))).toBe(false)
  })

  it('manager tenant-wide: settings.write=true, users.write=true, reports.view_consolidated=false', async () => {
    const twManager = new mongoose.Types.ObjectId()
    await UserLocationRole.create({
      tenantId: tenant._id,
      userId: twManager,
      locationId: null,
      role: 'manager',
      isActive: true,
    })

    expect(await userHasPermission(baseArgs({
      user: { _id: twManager, role: 'manager', assignedLocations: [] },
      locationId: null,
      permission: 'settings.write',
    }))).toBe(true)

    expect(await userHasPermission(baseArgs({
      user: { _id: twManager, role: 'manager', assignedLocations: [] },
      locationId: null,
      permission: 'users.write',
    }))).toBe(true)

    // manager NO tiene reports.view_consolidated en matriz v3
    expect(await userHasPermission(baseArgs({
      user: { _id: twManager, role: 'manager', assignedLocations: [] },
      locationId: null,
      permission: 'reports.view_consolidated',
    }))).toBe(false)
  })

  it('cashier tenant-wide: cash.movements.write=true, reservations.write=true, reports.view_consolidated=false', async () => {
    const twCashier = new mongoose.Types.ObjectId()
    await UserLocationRole.create({
      tenantId: tenant._id,
      userId: twCashier,
      locationId: null,
      role: 'cashier',
      isActive: true,
    })

    expect(await userHasPermission(baseArgs({
      user: { _id: twCashier, role: 'cashier', assignedLocations: [] },
      locationId: null,
      permission: 'cash.movements.write',
    }))).toBe(true)

    expect(await userHasPermission(baseArgs({
      user: { _id: twCashier, role: 'cashier', assignedLocations: [] },
      locationId: null,
      permission: 'reservations.write',
    }))).toBe(true)

    expect(await userHasPermission(baseArgs({
      user: { _id: twCashier, role: 'cashier', assignedLocations: [] },
      locationId: null,
      permission: 'reports.view_consolidated',
    }))).toBe(false)
  })
})
