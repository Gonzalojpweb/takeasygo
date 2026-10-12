import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * M2 — API de user_location_roles.
 *
 * Cubre las reglas aprobadas:
 *  - nadie asigna un rol mayor o igual al suyo (salvo admin/superadmin);
 *  - locationId null (todo el tenant) solo lo da un admin;
 *  - doble escritura con User.role en altas/cambios de fila de tenant;
 *  - toda operación queda en la bitácora;
 *  - borrar no toca User.role.
 */

const state = vi.hoisted(() => ({
  session: null as null | { id: string; role: string; tenantId: string },
  auditCalls: [] as any[],
  userUpdates: [] as any[],
  ulr: new Map<string, any>(),
  users: new Map<string, any>(),
}))

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn(async () => {}) }))

vi.mock('@/lib/apiAuth', () => ({
  getSessionUser: vi.fn(async () => state.session),
}))

vi.mock('@/lib/audit', () => ({
  logAudit: vi.fn(async (opts: any) => {
    state.auditCalls.push(opts)
  }),
}))

vi.mock('@/models/Tenant', () => ({
  default: {
    findOne: vi.fn(async () => ({ _id: 'T1' })),
  },
}))

vi.mock('@/models/Location', () => ({
  default: {
    findOne: vi.fn(async (q: any) =>
      q._id === 'LOC1' && String(q.tenantId) === 'T1' ? { _id: 'LOC1' } : null
    ),
  },
}))

vi.mock('@/models/User', () => ({
  default: {
    findOne: vi.fn(async (q: any) => {
      const u = state.users.get(String(q._id))
      if (!u) return null
      if (q.tenantId != null && String(u.tenantId) !== String(q.tenantId)) return null
      return u
    }),
    updateOne: vi.fn(async (q: any, upd: any) => {
      state.userUpdates.push({ q, upd })
      return { modifiedCount: 1 }
    }),
  },
}))

vi.mock('@/models/UserLocationRole', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  const keyOf = (q: any) => `${String(q.userId)}|${q.locationId == null ? 'null' : String(q.locationId)}`
  return {
    LOCATION_ROLES: actual.LOCATION_ROLES,
    default: {
      find: vi.fn((q: any) => ({
        sort: () => ({
          limit: () => ({
            lean: async () =>
              [...state.ulr.values()].filter(
                (r: any) => String(r.tenantId) === String(q.tenantId)
              ),
          }),
        }),
      })),
      findOne: vi.fn((q: any) => {
        const doc = async () => {
          if (q._id != null) {
            const found = [...state.ulr.values()].find((r: any) => String(r._id) === String(q._id))
            return found ? { ...found } : null
          }
          const hit = state.ulr.get(keyOf(q))
          return hit ? { ...hit } : null
        }
        const chain: any = { lean: () => doc() }
        chain.then = (onF: any, onR: any) => doc().then(onF, onR)
        return chain
      }),
      findOneAndUpdate: vi.fn(async (q: any, upd: any, opts: any) => {
        const k = keyOf(q)
        const prev = state.ulr.get(k)
        const doc = prev ?? { _id: `ULR${state.ulr.size + 1}`, tenantId: q.tenantId, userId: q.userId, locationId: q.locationId, createdAt: new Date() }
        doc.role = upd.$set.role
        doc.isActive = true
        state.ulr.set(k, doc)
        return doc
      }),
      deleteOne: vi.fn(async (q: any) => {
        for (const [k, v] of state.ulr) if (String(v._id) === String(q._id)) state.ulr.delete(k)
        return { deletedCount: 1 }
      }),
    },
  }
})

import { GET, POST } from '@/app/api/[tenant]/admin/user-location-roles/route'
import { DELETE } from '@/app/api/[tenant]/admin/user-location-roles/[id]/route'

const params = { params: Promise.resolve({ tenant: 'acme' }) }

function req(method: string, body?: unknown, url = 'http://test/api/acme/admin/user-location-roles') {
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

const asAdmin = { id: 'U-ADMIN', role: 'admin', tenantId: 'T1' }
const asManager = { id: 'U-MGR', role: 'manager', tenantId: 'T1' }
const asStaff = { id: 'U-STAFF', role: 'staff', tenantId: 'T1' }

beforeEach(() => {
  state.session = null
  state.auditCalls = []
  state.userUpdates = []
  state.ulr.clear()
  state.users.clear()
  state.users.set('U-W1', { _id: 'U-W1', role: 'waiter', tenantId: 'T1' })
  state.users.set('U-W2', { _id: 'U-W2', role: 'waiter', tenantId: 'T1' })
  state.users.set('U-FOREIGN', { _id: 'U-FOREIGN', role: 'admin', tenantId: 'OTHER' })
})

describe('POST user-location-roles', () => {
  it('401 sin sesión', async () => {
    const res = await POST(req('POST', { userId: 'U-W1', role: 'waiter' }), params)
    expect(res.status).toBe(401)
  })

  it('403 sin permiso de manager', async () => {
    state.session = asStaff
    const res = await POST(req('POST', { userId: 'U-W1', role: 'waiter' }), params)
    expect(res.status).toBe(403)
  })

  it('403 manager de otro tenant', async () => {
    state.session = { ...asManager, tenantId: 'OTHER' }
    const res = await POST(req('POST', { userId: 'U-W1', role: 'waiter' }), params)
    expect(res.status).toBe(403)
  })

  it('admin crea fila de tenant: doble escritura en User.role + bitácora', async () => {
    state.session = asAdmin
    const res = await POST(req('POST', { userId: 'U-W1', role: 'cashier', locationId: null }), params)
    expect(res.status).toBe(201)
    expect(state.userUpdates).toHaveLength(1)
    expect(state.userUpdates[0].upd.$set.role).toBe('cashier')
    expect(state.auditCalls[0].action).toBe('user_location_role.created')
  })

  it('admin asigna admin de tenant', async () => {
    state.session = asAdmin
    const res = await POST(req('POST', { userId: 'U-W1', role: 'admin', locationId: null }), params)
    expect(res.status).toBe(201)
  })

  it('manager crea fila por sede: OK sin doble escritura', async () => {
    state.session = asManager
    const res = await POST(req('POST', { userId: 'U-W1', role: 'waiter', locationId: 'LOC1' }), params)
    expect(res.status).toBe(201)
    expect(state.userUpdates).toHaveLength(0)
  })

  it('manager no puede crear fila de todo el tenant', async () => {
    state.session = asManager
    const res = await POST(req('POST', { userId: 'U-W1', role: 'waiter', locationId: null }), params)
    expect(res.status).toBe(403)
  })

  it('manager no puede asignar admin', async () => {
    state.session = asManager
    const res = await POST(req('POST', { userId: 'U-W1', role: 'admin', locationId: 'LOC1' }), params)
    expect(res.status).toBe(403)
  })

  it('manager no puede asignar manager (rol igual al suyo)', async () => {
    state.session = asManager
    const res = await POST(req('POST', { userId: 'U-W1', role: 'manager', locationId: 'LOC1' }), params)
    expect(res.status).toBe(403)
  })

  it('404 si el usuario objetivo no pertenece al tenant', async () => {
    state.session = asAdmin
    const res = await POST(req('POST', { userId: 'U-FOREIGN', role: 'waiter', locationId: 'LOC1' }), params)
    expect(res.status).toBe(404)
  })

  it('400 con rol inválido', async () => {
    state.session = asAdmin
    const res = await POST(req('POST', { userId: 'U-W1', role: 'superadmin', locationId: 'LOC1' }), params)
    expect(res.status).toBe(400)
  })

  it('upsert existente audita como updated', async () => {
    state.session = asAdmin
    await POST(req('POST', { userId: 'U-W1', role: 'cashier', locationId: 'LOC1' }), params)
    const res = await POST(req('POST', { userId: 'U-W1', role: 'waiter', locationId: 'LOC1' }), params)
    expect(res.status).toBe(200)
    expect(state.auditCalls[1].action).toBe('user_location_role.updated')
    expect(state.auditCalls[1].details.previousRole).toBe('cashier')
  })
})

describe('DELETE user-location-roles/[id]', () => {
  const delParams = { params: Promise.resolve({ tenant: 'acme', id: 'ULR1' }) }

  it('admin borra fila de tenant sin tocar User.role', async () => {
    state.session = asAdmin
    await POST(req('POST', { userId: 'U-W1', role: 'cashier', locationId: null }), params)
    state.userUpdates.length = 0
    const res = await DELETE(req('DELETE', undefined, 'http://test/api/acme/admin/user-location-roles/ULR1'), delParams)
    expect(res.status).toBe(200)
    expect(state.userUpdates).toHaveLength(0)
    expect(state.auditCalls.at(-1).action).toBe('user_location_role.deleted')
  })

  it('manager no puede borrar fila de todo el tenant', async () => {
    state.session = asAdmin
    await POST(req('POST', { userId: 'U-W1', role: 'cashier', locationId: null }), params)
    state.session = asManager
    const res = await DELETE(req('DELETE', undefined, 'http://test/api/acme/admin/user-location-roles/ULR1'), delParams)
    expect(res.status).toBe(403)
  })

  it('manager borra fila por sede con rol inferior', async () => {
    state.session = asAdmin
    await POST(req('POST', { userId: 'U-W1', role: 'waiter', locationId: 'LOC1' }), params)
    state.session = asManager
    const res = await DELETE(req('DELETE', undefined, 'http://test/api/acme/admin/user-location-roles/ULR1'), delParams)
    expect(res.status).toBe(200)
  })

  it('manager no puede borrar fila con rol admin', async () => {
    state.session = asAdmin
    await POST(req('POST', { userId: 'U-W1', role: 'admin', locationId: 'LOC1' }), params)
    state.session = asManager
    const res = await DELETE(req('DELETE', undefined, 'http://test/api/acme/admin/user-location-roles/ULR1'), delParams)
    expect(res.status).toBe(403)
  })
})

describe('GET user-location-roles', () => {
  it('lista las filas del tenant', async () => {
    state.session = asAdmin
    await POST(req('POST', { userId: 'U-W1', role: 'waiter', locationId: 'LOC1' }), params)
    const res = await GET(req('GET'), params)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.roles).toHaveLength(1)
  })
})
