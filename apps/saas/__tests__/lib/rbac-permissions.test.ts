import { describe, it, expect, vi, afterEach } from 'vitest'

// rbac.ts importa @/lib/apiAuth (para los helpers de ruta), que a su vez
// carga next-auth — no debe resolverse en unit tests (en integración ya lo
// mockea setup.ts).
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('next-auth/jwt', () => ({ getToken: vi.fn() }))

// rbac.ts registra denegaciones simuladas (modo sombra) vía logAudit.
const logAuditMock = vi.fn()
vi.mock('@/lib/audit', () => ({ logAudit: (...args: unknown[]) => logAuditMock(...args) }))

// getSessionUser resuelve la sesión del request (NextAuth) — lo controlamos.
const getSessionUserMock = vi.fn()
vi.mock('@/lib/apiAuth', () => ({
  getSessionUser: (...args: unknown[]) => getSessionUserMock(...args),
  requireAuth: vi.fn(async () => null),
  requireAdminRole: vi.fn(async () => null),
}))

import {
  ROLE_PERMISSIONS,
  roleHasPermission,
  legacyHasPermission,
  userHasPermission,
  enforcePermission,
  enforcePermissionForRequest,
  type Permission,
} from '@/lib/rbac'
import { NextRequest } from 'next/server'
import { LOCATION_ROLES } from '@/models/UserLocationRole'
import { FLAGS } from '@/lib/feature-flags'

// Mock del modelo: solo find().lean() para userHasPermission con flag on.
const findMock = vi.fn()
vi.mock('@/models/UserLocationRole', () => ({
  LOCATION_ROLES: ['admin', 'manager', 'staff', 'cashier', 'waiter', 'host', 'auditor', 'seller'],
  default: {
    find: (...args: unknown[]) => ({
      lean: async () => findMock(...args),
    }),
  },
}))

const ENV_KEY = 'NEXT_PUBLIC_FF_' + FLAGS.RBAC_SEDE_SCOPE

afterEach(() => {
  delete process.env[ENV_KEY]
  findMock.mockReset()
  logAuditMock.mockReset()
  getSessionUserMock.mockReset()
})

describe('matriz de permisos por rol de sede', () => {
  it('todos los LocationRoles tienen permisos definidos', () => {
    for (const role of LOCATION_ROLES) {
      expect(ROLE_PERMISSIONS[role]).toBeDefined()
      expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0)
    }
  })

  it('admin puede todo', () => {
    expect(roleHasPermission('admin', 'orders.write')).toBe(true)
    expect(roleHasPermission('admin', 'users.write')).toBe(true)
    expect(roleHasPermission('admin', 'settings.write')).toBe(true)
    expect(roleHasPermission('admin', 'cash.close')).toBe(true)
  })

  it('waiter: toma pedidos y lee menú, pero no toca dinero ni usuarios', () => {
    expect(roleHasPermission('waiter', 'orders.write')).toBe(true)
    expect(roleHasPermission('waiter', 'orders.read')).toBe(true)
    expect(roleHasPermission('waiter', 'menu.read')).toBe(true)
    expect(roleHasPermission('waiter', 'reservations.read')).toBe(true)
    // Corrección Gonzalo 2026-10-13: el mozo solo VE reservas (lectura).
    expect(roleHasPermission('waiter', 'reservations.write')).toBe(false)
    expect(roleHasPermission('waiter', 'reservations.delete')).toBe(false)
    expect(roleHasPermission('waiter', 'kitchen.read')).toBe(true)
    expect(roleHasPermission('waiter', 'cash.open')).toBe(false)
    expect(roleHasPermission('waiter', 'cash.close')).toBe(false)
    expect(roleHasPermission('waiter', 'users.write')).toBe(false)
    expect(roleHasPermission('waiter', 'settings.write')).toBe(false)
  })

  it('host: reservas y sala, sin dinero', () => {
    expect(roleHasPermission('host', 'reservations.write')).toBe(true)
    expect(roleHasPermission('host', 'reservations.read')).toBe(true)
    expect(roleHasPermission('host', 'orders.read')).toBe(true)
    expect(roleHasPermission('host', 'menu.read')).toBe(true)
    expect(roleHasPermission('host', 'cash.open')).toBe(false)
    expect(roleHasPermission('host', 'orders.write')).toBe(false)
  })

  it('auditor (contador): solo lectura, jamás escritura ni dinero en efectivo', () => {
    for (const perm of ROLE_PERMISSIONS.auditor) {
      // Lectura: *.read, más rooms.access (unirse a salas en tiempo real)
      // y reports.view_consolidated (ver el consolidado de sedes).
      expect(
        perm.endsWith('.read') || perm === 'rooms.access' || perm === 'reports.view_consolidated'
      ).toBe(true)
    }
    expect(roleHasPermission('auditor', 'orders.read')).toBe(true)
    expect(roleHasPermission('auditor', 'reports.read')).toBe(true)
    expect(roleHasPermission('auditor', 'reports.view_consolidated')).toBe(true)
    expect(roleHasPermission('auditor', 'audit.read')).toBe(true)
    expect(roleHasPermission('auditor', 'reservations.read')).toBe(true)
    expect(roleHasPermission('auditor', 'cash.movements.read')).toBe(false)
    expect(roleHasPermission('auditor', 'orders.write')).toBe(false)
    expect(roleHasPermission('auditor', 'cash.open')).toBe(false)
    expect(roleHasPermission('auditor', 'cash.close')).toBe(false)
    expect(roleHasPermission('auditor', 'cash.movements.write')).toBe(false)
    expect(roleHasPermission('auditor', 'settings.write')).toBe(false)
    expect(roleHasPermission('auditor', 'settings.read')).toBe(false)
  })

  it('cashier: caja, pedidos y reservas, sin reports.read ni users/settings', () => {
    expect(roleHasPermission('cashier', 'orders.write')).toBe(true)
    expect(roleHasPermission('cashier', 'cash.close')).toBe(true)
    expect(roleHasPermission('cashier', 'cash.movements.write')).toBe(true)
    expect(roleHasPermission('cashier', 'reports.cash')).toBe(true)
    expect(roleHasPermission('cashier', 'reservations.write')).toBe(true)
    expect(roleHasPermission('cashier', 'reports.read')).toBe(false)
    expect(roleHasPermission('cashier', 'orders.cancel')).toBe(false)
    expect(roleHasPermission('cashier', 'users.write')).toBe(false)
    expect(roleHasPermission('cashier', 'settings.write')).toBe(false)
  })

  it('manager v3: gestiona usuarios y settings no-sensibles', () => {
    expect(roleHasPermission('manager', 'users.write')).toBe(true)
    expect(roleHasPermission('manager', 'settings.write')).toBe(true)
    expect(roleHasPermission('manager', 'orders.cancel')).toBe(true)
    expect(roleHasPermission('manager', 'reports.read')).toBe(true)
    expect(roleHasPermission('manager', 'discounts.write')).toBe(true)
    expect(roleHasPermission('manager', 'payments.configure')).toBe(false)
    expect(roleHasPermission('manager', 'fiscal.configure')).toBe(false)
    expect(roleHasPermission('manager', 'reports.view_consolidated')).toBe(false)
  })

  it('matriz v3: orders.cancel solo admin+manager', () => {
    expect(roleHasPermission('admin', 'orders.cancel')).toBe(true)
    expect(roleHasPermission('manager', 'orders.cancel')).toBe(true)
    expect(roleHasPermission('staff', 'orders.cancel')).toBe(false)
    expect(roleHasPermission('cashier', 'orders.cancel')).toBe(false)
  })

  it('matriz v3: staff y seller CREAN y ACTUALIZAN pedidos (orders.write)', () => {
    expect(roleHasPermission('staff', 'orders.write')).toBe(true)
    expect(roleHasPermission('seller', 'orders.write')).toBe(true)
    expect(roleHasPermission('staff', 'orders.read')).toBe(true)
    expect(roleHasPermission('seller', 'orders.read')).toBe(true)
    // ...pero no cancelan pedidos (eso es admin+manager).
    expect(roleHasPermission('staff', 'orders.cancel')).toBe(false)
    expect(roleHasPermission('seller', 'orders.cancel')).toBe(false)
    // Tampoco tocan caja ni usuarios.
    expect(roleHasPermission('staff', 'cash.open')).toBe(false)
    expect(roleHasPermission('seller', 'cash.open')).toBe(false)
    expect(roleHasPermission('staff', 'users.write')).toBe(false)
    expect(roleHasPermission('seller', 'users.write')).toBe(false)
  })

  it('matriz v3: cash.* solo admin+manager+cashier', () => {
    for (const perm of ['cash.open', 'cash.close', 'cash.movements.read', 'cash.movements.write'] as const) {
      expect(roleHasPermission('admin', perm)).toBe(true)
      expect(roleHasPermission('manager', perm)).toBe(true)
      expect(roleHasPermission('cashier', perm)).toBe(true)
      expect(roleHasPermission('staff', perm)).toBe(false)
      expect(roleHasPermission('auditor', perm)).toBe(false)
      expect(roleHasPermission('waiter', perm)).toBe(false)
    }
  })

  it('matriz v3: reports.read admin+manager+auditor; reports.cash +cashier', () => {
    expect(roleHasPermission('admin', 'reports.read')).toBe(true)
    expect(roleHasPermission('manager', 'reports.read')).toBe(true)
    expect(roleHasPermission('auditor', 'reports.read')).toBe(true)
    expect(roleHasPermission('cashier', 'reports.read')).toBe(false)
    expect(roleHasPermission('seller', 'reports.read')).toBe(false)
    expect(roleHasPermission('admin', 'reports.cash')).toBe(true)
    expect(roleHasPermission('manager', 'reports.cash')).toBe(true)
    expect(roleHasPermission('cashier', 'reports.cash')).toBe(true)
    expect(roleHasPermission('auditor', 'reports.cash')).toBe(false)
    expect(roleHasPermission('auditor', 'reports.view_consolidated')).toBe(true)
    expect(roleHasPermission('manager', 'reports.view_consolidated')).toBe(false)
  })

  it('matriz v3: reservations.view incluye auditor/host; write +cashier; delete admin+manager', () => {
    expect(roleHasPermission('auditor', 'reservations.read')).toBe(true)
    expect(roleHasPermission('host', 'reservations.read')).toBe(true)
    expect(roleHasPermission('cashier', 'reservations.write')).toBe(true)
    expect(roleHasPermission('host', 'reservations.write')).toBe(true)
    expect(roleHasPermission('cashier', 'reservations.delete')).toBe(false)
    expect(roleHasPermission('manager', 'reservations.delete')).toBe(true)
    expect(roleHasPermission('admin', 'reservations.delete')).toBe(true)
  })

  it('matriz v3: payments/fiscal.configure solo admin; rooms.access en todos los roles', () => {
    expect(roleHasPermission('admin', 'payments.configure')).toBe(true)
    expect(roleHasPermission('admin', 'fiscal.configure')).toBe(true)
    expect(roleHasPermission('manager', 'payments.configure')).toBe(false)
    expect(roleHasPermission('manager', 'fiscal.configure')).toBe(false)
    for (const role of LOCATION_ROLES) {
      expect(roleHasPermission(role, 'rooms.access')).toBe(true)
    }
  })

  it('roles desconocidos no tienen permisos', () => {
    expect(roleHasPermission('consumer', 'orders.read')).toBe(false)
    expect(roleHasPermission(null, 'orders.read')).toBe(false)
    expect(roleHasPermission(undefined, 'orders.read')).toBe(false)
  })
})

describe('legacyHasPermission (flag off)', () => {
  it('superadmin y admin: todo', () => {
    expect(legacyHasPermission({ role: 'superadmin' }, 'orders.write')).toBe(true)
    expect(legacyHasPermission({ role: 'admin' }, 'users.write')).toBe(true)
  })

  it('roles legacy caen a su matriz de sede', () => {
    expect(legacyHasPermission({ role: 'waiter' }, 'orders.write')).toBe(true)
    expect(legacyHasPermission({ role: 'waiter' }, 'cash.close')).toBe(false)
    expect(legacyHasPermission({ role: 'cashier' }, 'cash.close')).toBe(true)
    expect(legacyHasPermission({ role: 'staff' }, 'orders.write')).toBe(true)
  })

  it('consumer y sin rol: nada', () => {
    expect(legacyHasPermission({ role: 'consumer' }, 'orders.read')).toBe(false)
    expect(legacyHasPermission({}, 'orders.read')).toBe(false)
  })
})

describe('userHasPermission — flag off (sin cambio de conducta)', () => {
  const tenantOff = { flags: {} }

  it('superadmin pasa siempre', async () => {
    await expect(
      userHasPermission({ user: { role: 'superadmin' }, tenant: tenantOff, tenantId: 't1', permission: 'orders.write' })
    ).resolves.toBe(true)
  })

  it('sin user => false', async () => {
    await expect(
      userHasPermission({ user: null, tenant: tenantOff, tenantId: 't1', permission: 'orders.read' })
    ).resolves.toBe(false)
  })

  it('user scoped a L1 no puede en L2 (alcance Oleada 1)', async () => {
    await expect(
      userHasPermission({
        user: { role: 'admin', assignedLocations: ['L1'] },
        tenant: tenantOff,
        tenantId: 't1',
        locationId: 'L2',
        permission: 'orders.write',
      })
    ).resolves.toBe(false)
  })

  it('user scoped a L1 puede en L1', async () => {
    await expect(
      userHasPermission({
        user: { role: 'admin', assignedLocations: ['L1'] },
        tenant: tenantOff,
        tenantId: 't1',
        locationId: 'L1',
        permission: 'orders.write',
      })
    ).resolves.toBe(true)
  })

  it('user sin scope (tenant-wide) puede en cualquier sede', async () => {
    await expect(
      userHasPermission({
        user: { role: 'admin', assignedLocations: [] },
        tenant: tenantOff,
        tenantId: 't1',
        locationId: 'L9',
        permission: 'orders.write',
      })
    ).resolves.toBe(true)
  })
})

describe('userHasPermission — flag on (user_location_roles)', () => {
  const tenantOn = { flags: { [FLAGS.RBAC_SEDE_SCOPE]: true } }
  const staffUser = { _id: 'u1', role: 'staff', assignedLocations: [] }

  it('waiter con fila de sede: puede orders.write solo en su sede', async () => {
    findMock.mockReturnValueOnce([{ role: 'waiter', locationId: 'L1' }])
    await expect(
      userHasPermission({
        user: { _id: 'u1', role: 'waiter' },
        tenant: tenantOn,
        tenantId: 't1',
        locationId: 'L1',
        permission: 'orders.write',
      })
    ).resolves.toBe(true)

    findMock.mockReturnValueOnce([{ role: 'waiter', locationId: 'L1' }])
    await expect(
      userHasPermission({
        user: { _id: 'u1', role: 'waiter' },
        tenant: tenantOn,
        tenantId: 't1',
        locationId: 'L2',
        permission: 'orders.write',
      })
    ).resolves.toBe(true) // sin fila en L2 cae al fallback legacy (sin scope = ok)
  })

  it('auditor con fila: solo puede lo de lectura', async () => {
    findMock.mockReturnValueOnce([{ role: 'auditor', locationId: 'L1' }])
    await expect(
      userHasPermission({
        user: staffUser,
        tenant: tenantOn,
        tenantId: 't1',
        locationId: 'L1',
        permission: 'reports.read',
      })
    ).resolves.toBe(true)

    findMock.mockReturnValueOnce([{ role: 'auditor', locationId: 'L1' }])
    await expect(
      userHasPermission({
        user: staffUser,
        tenant: tenantOn,
        tenantId: 't1',
        locationId: 'L1',
        permission: 'cash.movements.write',
      })
    ).resolves.toBe(false)
  })

  it('consolidado: auditor de UNA sede no ve el consolidado; auditor tenant-wide sí', async () => {
    // reports.view_consolidated es de ÁMBITO TENANT: exige fila ULR
    // locationId:null. Un auditor asignado solo a L1 no debe verlo.
    // 1) Auditor con fila de sede (locationId:'L1') => DENY (no hay fila tenant-wide).
    findMock.mockReturnValueOnce([]) // la query tenant-wide no matchea su fila de sede
    await expect(
      userHasPermission({
        user: { _id: 'u1', role: 'auditor' },
        tenant: tenantOn,
        tenantId: 't1',
        permission: 'reports.view_consolidated',
      })
    ).resolves.toBe(false)
    // La query debe haber buscado específicamente locationId:null (tenant-wide).
    expect(findMock.mock.calls[0][0].locationId).toBeNull()

    // 2) Auditor tenant-wide (fila locationId:null) => ALLOW.
    findMock.mockReturnValueOnce([{ role: 'auditor', locationId: null }])
    await expect(
      userHasPermission({
        user: { _id: 'u2', role: 'auditor' },
        tenant: tenantOn,
        tenantId: 't1',
        permission: 'reports.view_consolidated',
      })
    ).resolves.toBe(true)

    // 3) manager tenant-wide NO ve consolidado (matriz: no lo tiene).
    findMock.mockReturnValueOnce([{ role: 'manager', locationId: null }])
    await expect(
      userHasPermission({
        user: { _id: 'u3', role: 'manager' },
        tenant: tenantOn,
        tenantId: 't1',
        permission: 'reports.view_consolidated',
      })
    ).resolves.toBe(false)
  })

  it('sin fila en la colección cae al fallback legacy (rollout seguro)', async () => {
    findMock.mockReturnValueOnce([])
    await expect(
      userHasPermission({
        user: { _id: 'u1', role: 'admin' },
        tenant: tenantOn,
        tenantId: 't1',
        locationId: 'L1',
        permission: 'orders.write',
      })
    ).resolves.toBe(true)
  })

  it('consulta incluye la sede pedida y la tenant-wide', async () => {
    findMock.mockReturnValueOnce([{ role: 'admin', locationId: 'L1' }])
    await userHasPermission({ user: staffUser, tenant: tenantOn, tenantId: 't1', locationId: 'L1', permission: 'orders.read' })
    const query = findMock.mock.calls[0][0]
    expect(query.tenantId).toBe('t1')
    expect(query.locationId).toEqual({ $in: ['L1', null] })
    expect(query.isActive).toBe(true)
  })

  it('override por env gana sobre el tenant', async () => {
    process.env[ENV_KEY] = 'false'
    findMock.mockReturnValueOnce([])
    await expect(
      userHasPermission({
        user: { role: 'cashier' },
        tenant: tenantOn,
        tenantId: 't1',
        permission: 'cash.close',
      })
    ).resolves.toBe(true)
    expect(findMock).not.toHaveBeenCalled()
  })
})

describe('enforcePermission', () => {
  it('flag off (default): devuelve null sin validar (sin cambio de conducta)', async () => {
    expect(
      await enforcePermission({
        user: { role: 'admin' },
        tenant: {},
        tenantId: 't1',
        permission: 'orders.write' as Permission,
      })
    ).toBeNull()

    // Ni siquiera un consumer recibe 403: con flag off la defensa son los
    // guards de siempre (requireAuth/requireAdminRole).
    expect(
      await enforcePermission({
        user: { role: 'consumer' },
        tenant: {},
        tenantId: 't1',
        permission: 'orders.write' as Permission,
      })
    ).toBeNull()
    expect(findMock).not.toHaveBeenCalled()
  })

  it('flag on: null si la matriz lo permite y 403 si no', async () => {
    process.env[ENV_KEY] = 'true'

    // admin sin fila: fallback legacy => permitido.
    findMock.mockReturnValueOnce([])
    expect(
      await enforcePermission({
        user: { _id: 'u1', role: 'admin' },
        tenant: {},
        tenantId: 't1',
        permission: 'orders.write' as Permission,
      })
    ).toBeNull()

    // staff con fila: puede orders.write...
    findMock.mockReturnValueOnce([{ role: 'staff', locationId: null }])
    expect(
      await enforcePermission({
        user: { _id: 'u2', role: 'staff' },
        tenant: {},
        tenantId: 't1',
        permission: 'orders.write' as Permission,
      })
    ).toBeNull()

    // ...pero no cash.close (matriz v3).
    findMock.mockReturnValueOnce([{ role: 'staff', locationId: null }])
    const res = await enforcePermission({
      user: { _id: 'u2', role: 'staff' },
      tenant: {},
      tenantId: 't1',
      permission: 'cash.close' as Permission,
    })
    expect(res?.status).toBe(403)

    // consumer sin id: nunca tiene fila => 403.
    const consumerRes = await enforcePermission({
      user: { role: 'consumer' },
      tenant: {},
      tenantId: 't1',
      permission: 'orders.write' as Permission,
    })
    expect(consumerRes?.status).toBe(403)
  })

  it('flag on: superadmin pasa sin consultar la DB', async () => {
    process.env[ENV_KEY] = 'true'
    expect(
      await enforcePermission({
        user: { role: 'superadmin' },
        tenant: {},
        tenantId: 't1',
        permission: 'fiscal.configure' as Permission,
      })
    ).toBeNull()
    expect(findMock).not.toHaveBeenCalled()
  })

  it('acciones 8-10 (tabla rol): staff y seller ACTUALIZAN pedidos; host recibe 403', async () => {
    process.env[ENV_KEY] = 'true'

    // 8. staff con fila ULR: PATCH /orders/[id]/status (orders.write) → pasa.
    findMock.mockReturnValueOnce([{ role: 'staff', locationId: null }])
    expect(
      await enforcePermission({
        user: { _id: 'u-staff', role: 'staff' },
        tenant: {},
        tenantId: 't1',
        locationId: 'L1',
        permission: 'orders.write' as Permission,
        route: '/api/t1/orders/abc/status',
      })
    ).toBeNull()

    // 9. seller con fila ULR: orders.write → pasa.
    findMock.mockReturnValueOnce([{ role: 'seller', locationId: null }])
    expect(
      await enforcePermission({
        user: { _id: 'u-seller', role: 'seller' },
        tenant: {},
        tenantId: 't1',
        locationId: 'L1',
        permission: 'orders.write' as Permission,
        route: '/api/t1/orders/abc/status',
      })
    ).toBeNull()

    // 10. host con fila ULR: orders.write → 403 (matriz v3: host no toca pedidos).
    findMock.mockReturnValueOnce([{ role: 'host', locationId: null }])
    const hostRes = await enforcePermission({
      user: { _id: 'u-host', role: 'host' },
      tenant: {},
      tenantId: 't1',
      locationId: 'L1',
      permission: 'orders.write' as Permission,
      route: '/api/t1/orders/abc/status',
    })
    expect(hostRes?.status).toBe(403)
  })
})

describe('enforcePermission - modo sombra rbac.sedeScope (log)', () => {
  it('NO bloquea la denegación: devuelve null y la registra en bitácora', async () => {
    process.env[ENV_KEY] = 'log'

    findMock.mockReturnValueOnce([{ role: 'staff', locationId: null }])
    const res = await enforcePermission({
      user: { _id: 'u2', role: 'staff' },
      tenant: {},
      tenantId: 't1',
      permission: 'cash.close' as Permission,
      route: '/api/t1/cash/close',
    })

    expect(res).toBeNull()
    expect(logAuditMock).toHaveBeenCalledTimes(1)
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't1',
        action: 'rbac.shadow_denied',
        entity: 'permission',
        locationId: null,
        userId: 'u2',
        userRole: 'staff',
        details: expect.objectContaining({
          route: '/api/t1/cash/close',
          permission: 'cash.close',
          role: 'staff',
          // Rol efectivo (fila ULR) — el eje de agrupación del reporte.
          effectiveRole: 'staff',
          via: 'ulr',
        }),
      })
    )
  })

  it('registra el rol EFECTIVO de la fila ULR aunque la sesión traiga otro rol', async () => {
    process.env[ENV_KEY] = 'log'

    // Sesión con role admin (token POS), fila ULR = staff en esta sede.
    findMock.mockReturnValueOnce([{ role: 'staff', locationId: null }])
    const res = await enforcePermission({
      user: { _id: 'u-pos', role: 'admin' },
      tenant: {},
      tenantId: 't1',
      locationId: 'L1',
      permission: 'cash.close' as Permission,
      route: '/api/t1/cash/close',
    })

    expect(res).toBeNull()
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userRole: 'admin',
        details: expect.objectContaining({ effectiveRole: 'staff', via: 'ulr' }),
      })
    )
  })

  it('misma decisión que enforce (fiel al reporte): lo permitido pasa sin registrar', async () => {
    process.env[ENV_KEY] = 'log'

    // staff con fila puede orders.write => nada que reportar.
    findMock.mockReturnValueOnce([{ role: 'staff', locationId: null }])
    expect(
      await enforcePermission({
        user: { _id: 'u2', role: 'staff' },
        tenant: {},
        tenantId: 't1',
        permission: 'orders.write' as Permission,
        route: '/api/t1/orders',
      })
    ).toBeNull()
    expect(logAuditMock).not.toHaveBeenCalled()

    // consumer NO tiene fila => mismo resultado que enforce lo habría decidido,
    // pero en log no se corta la request.
    const consumerRes = await enforcePermission({
      user: { role: 'consumer' },
      tenant: {},
      tenantId: 't1',
      permission: 'orders.write' as Permission,
      route: '/api/t1/orders',
    })
    expect(consumerRes).toBeNull()
    expect(logAuditMock).toHaveBeenCalledTimes(1)
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'rbac.shadow_denied' })
    )
  })

  it('flag via tenant.flags (sin env): string "log" se interpreta como modo log', async () => {
    const tenant = { flags: { [FLAGS.RBAC_SEDE_SCOPE]: 'log' } }

    findMock.mockReturnValueOnce([{ role: 'staff', locationId: null }])
    expect(
      await enforcePermission({
        user: { _id: 'u2', role: 'staff' },
        tenant,
        tenantId: 't1',
        permission: 'cash.close' as Permission,
        route: '/api/t1/cash/close',
      })
    ).toBeNull()
    expect(logAuditMock).toHaveBeenCalledTimes(1)
  })

  it('modo log: superadmin pasa sin consultar DB y sin registrar', async () => {
    process.env[ENV_KEY] = 'log'
    expect(
      await enforcePermission({
        user: { role: 'superadmin' },
        tenant: {},
        tenantId: 't1',
        permission: 'fiscal.configure' as Permission,
      })
    ).toBeNull()
    expect(findMock).not.toHaveBeenCalled()
    expect(logAuditMock).not.toHaveBeenCalled()
  })
})

describe('enforcePermissionForRequest - ruta en el registro de sombra', () => {
  it('registra usuario, rol, ruta y sede en la denegación simulada', async () => {
    process.env[ENV_KEY] = 'log'
    findMock.mockReturnValueOnce([{ role: 'staff', locationId: 'L1' }])
    getSessionUserMock.mockResolvedValueOnce({ _id: 'u9', role: 'staff', name: 'Staff Test' })

    const request = new NextRequest('http://localhost:3000/api/chopisburger/orders/abc/status')
    const res = await enforcePermissionForRequest(request, {
      tenant: {},
      tenantId: 't1',
      locationId: 'L1',
      permission: 'cash.close' as Permission,
    })

    expect(res).toBeNull()
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't1',
        action: 'rbac.shadow_denied',
        locationId: 'L1',
        userId: 'u9',
        userRole: 'staff',
        userName: 'Staff Test',
        details: expect.objectContaining({
          route: '/api/chopisburger/orders/abc/status',
          permission: 'cash.close',
          role: 'staff',
        }),
      })
    )
  })
})
