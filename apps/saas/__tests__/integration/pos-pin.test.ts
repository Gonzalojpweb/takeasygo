import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from 'vitest'
import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import './setup'

import Tenant from '@/models/Tenant'
import User from '@/models/User'
import { posPinLookup, validateNewPosPin } from '@takeasygo/business/pos-pin'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/apiAuth', () => ({
  requireAuth: vi.fn().mockResolvedValue(null),
  getSessionUser: vi.fn().mockResolvedValue({ id: 'admin-id', role: 'admin', assignedLocations: [] }),
}))
vi.mock('@/lib/rbac', () => ({
  enforcePermissionForRequest: vi.fn().mockResolvedValue(null),
}))

import { POST, DELETE } from '@/app/api/[tenant]/users/[userId]/pos-pin/route'

/**
 * PIN del POS generado por el server (hallazgo de la validación de la
 * Auditoría POS Online V1: el SaaS no tenía cómo asignar PINs y el login por
 * PIN del Sync comparaba contra un solo usuario).
 */

const SLUG = 'pin-tenant'
const PEPPER = 'pin-test-pepper-0123456789'

let tenantId: string

function req(method: 'POST' | 'DELETE') {
  return new NextRequest(`http://localhost/api/${SLUG}/users/x/pos-pin`, { method })
}
const params = (userId: string, slug = SLUG) => ({ params: Promise.resolve({ tenant: slug, userId }) })

async function createUser(role: string, tid = tenantId) {
  return User.create({
    name: role,
    email: `${role}-${Math.random().toString(36).slice(2)}@test.com`,
    password: 'x-secret-123',
    // phone explícito: el schema declara phone unique+sparse con default null
    // (ver informe — riesgo de índice), y dos usuarios con null chocarían.
    phone: `+54${Math.floor(Math.random() * 1e10)}`,
    role,
    tenantId: tid,
    isActive: true,
  })
}

beforeAll(() => {
  process.env.POS_PIN_PEPPER = PEPPER
})
afterAll(() => {
  delete process.env.POS_PIN_PEPPER
})

beforeEach(async () => {
  const tenant = await Tenant.create({ slug: SLUG, name: 'Pin', isActive: true })
  tenantId = tenant._id.toString()
  // Solo el índice del PIN: syncIndexes() choca con el índice duplicado de
  // email (deuda D5, preexistente).
  await User.collection.createIndex(
    { tenantId: 1, posPinLookup: 1 },
    { unique: true, partialFilterExpression: { posPinLookup: { $type: 'string' } } }
  )
})

describe('POST /users/[userId]/pos-pin', () => {
  it('genera un PIN de 6 dígitos no trivial, guarda bcrypt + lookup y no lo persiste en claro', async () => {
    const cajera = await createUser('cashier')
    const res = await POST(req('POST'), params(cajera._id.toString()))
    expect(res.status).toBe(201)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const { pin } = await res.json()
    expect(pin).toMatch(/^\d{6}$/)
    expect(validateNewPosPin(pin)).toBeNull()

    const stored = await User.findById(cajera._id).select('+pin +posPinLookup').lean()
    expect(stored!.pin).not.toBe(pin)
    expect(await bcrypt.compare(pin, stored!.pin!)).toBe(true)
    expect(stored!.posPinLookup).toBe(posPinLookup(PEPPER, tenantId, pin))
    expect(stored!.posPinUpdatedAt).toBeTruthy()
  })

  it('el PIN no aparece en las lecturas normales del usuario', async () => {
    const cajera = await createUser('cashier')
    await POST(req('POST'), params(cajera._id.toString()))
    const plain = await User.findById(cajera._id).select('-password').lean()
    expect(plain).not.toHaveProperty('pin')
    expect(plain).not.toHaveProperty('posPinLookup')
  })

  it('mozos (staff) también tienen PIN — POS mobile; roles sin POS no', async () => {
    const staff = await createUser('staff')
    expect((await POST(req('POST'), params(staff._id.toString()))).status).toBe(201)
    const auditor = await createUser('auditor')
    expect((await POST(req('POST'), params(auditor._id.toString()))).status).toBe(400)
  })

  it('usuario de OTRO tenant → 404', async () => {
    const other = await Tenant.create({ slug: 'otro-pin', name: 'Otro', isActive: true })
    const ajeno = await createUser('cashier', other._id.toString())
    expect((await POST(req('POST'), params(ajeno._id.toString()))).status).toBe(404)
  })

  it('el índice impide dos usuarios con el mismo lookup en el tenant', async () => {
    const a = await createUser('cashier')
    const b = await createUser('manager')
    const lookup = posPinLookup(PEPPER, tenantId, '482915')
    await User.updateOne({ _id: a._id }, { $set: { posPinLookup: lookup } })
    await expect(User.updateOne({ _id: b._id }, { $set: { posPinLookup: lookup } })).rejects.toThrow(/duplicate key/)
  })

  it('DELETE quita el PIN', async () => {
    const cajera = await createUser('cashier')
    await POST(req('POST'), params(cajera._id.toString()))
    expect((await DELETE(req('DELETE'), params(cajera._id.toString()))).status).toBe(200)
    const stored = await User.findById(cajera._id).select('+pin +posPinLookup').lean()
    expect(stored!.pin).toBeUndefined()
    expect(stored!.posPinLookup).toBeUndefined()
  })
})

describe('validateNewPosPin', () => {
  it('rechaza triviales', () => {
    expect(validateNewPosPin('1111')).not.toBeNull()
    expect(validateNewPosPin('1234')).not.toBeNull()
    expect(validateNewPosPin('9876')).not.toBeNull()
    expect(validateNewPosPin('12a4')).not.toBeNull()
    expect(validateNewPosPin('482915')).toBeNull()
  })
})
