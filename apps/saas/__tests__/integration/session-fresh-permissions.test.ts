// ============================================================================
// session-fresh-permissions.test.ts — Revocación sin esperar al JWT (H6)
// ============================================================================
// getSessionUser relee role/tenantId/assignedLocations de la DB: quitarle una
// sede a un usuario, cambiarle el rol o desactivarlo tiene efecto en las APIs
// aunque el JWT (8 h) todavía tenga los claims viejos.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import './setup'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

import User from '@/models/User'
import { auth } from '@/lib/auth'
import { getSessionUser, clearFreshUserCache } from '@/lib/apiAuth'

const tenantId = new mongoose.Types.ObjectId()
const locA = new mongoose.Types.ObjectId()
const locB = new mongoose.Types.ObjectId()

function setStaleSession(id: string) {
  // Claims del login: manager con acceso a A y B.
  vi.mocked(auth).mockResolvedValue({
    user: {
      id, role: 'manager', tenantId: tenantId.toString(),
      assignedLocation: locA.toString(),
      assignedLocations: [locA.toString(), locB.toString()],
    },
    expires: '',
  } as any)
}

beforeEach(() => {
  clearFreshUserCache()
})

describe('getSessionUser — permisos frescos', () => {
  it('sede quitada después del login: deja de figurar', async () => {
    const user = await User.create({
      name: 'Ana', email: 'ana@test.com', role: 'manager', tenantId, assignedLocations: [locA],
    })
    setStaleSession(user._id.toString())
    const session = await getSessionUser()
    expect(session?.assignedLocations).toEqual([locA.toString()])
    expect(session?.assignedLocation).toBe(locA.toString())
  })

  it('rol cambiado después del login: se usa el de la DB', async () => {
    const user = await User.create({
      name: 'Beto', email: 'beto@test.com', role: 'waiter', tenantId, assignedLocations: [locA],
    })
    setStaleSession(user._id.toString())
    expect((await getSessionUser())?.role).toBe('waiter')
  })

  it('usuario desactivado → sin sesión', async () => {
    const user = await User.create({
      name: 'Caro', email: 'caro@test.com', role: 'manager', tenantId, assignedLocations: [locA], isActive: false,
    })
    setStaleSession(user._id.toString())
    expect(await getSessionUser()).toBeNull()
  })

  it('usuario borrado → sin sesión', async () => {
    setStaleSession(new mongoose.Types.ObjectId().toString())
    expect(await getSessionUser()).toBeNull()
  })

  it('id sintético (no ObjectId) → se respetan los claims del token', async () => {
    setStaleSession('admin-id')
    const session = await getSessionUser()
    expect(session?.assignedLocations).toHaveLength(2)
  })

  it('caché de 30 s: dos lecturas seguidas consultan la DB una sola vez', async () => {
    const user = await User.create({
      name: 'Dani', email: 'dani@test.com', role: 'manager', tenantId, assignedLocations: [locA],
    })
    setStaleSession(user._id.toString())
    const spy = vi.spyOn(User, 'findById')
    await getSessionUser()
    await getSessionUser()
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })
})
