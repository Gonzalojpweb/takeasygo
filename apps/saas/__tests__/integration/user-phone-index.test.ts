// ============================================================================
// user-phone-index.test.ts — Altas de usuarios sin teléfono (error 500)
// ============================================================================
// User.phone tenía default null + índice único sparse: sparse solo ignora
// documentos SIN el campo, así que el segundo usuario sin teléfono daba E11000.
// Ahora «sin teléfono» = campo ausente y el índice único aplica solo a
// teléfonos con texto.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

import User from '@/models/User'

const tenantId = new mongoose.Types.ObjectId()
const mk = (n: number, phone?: unknown) =>
  User.create({ name: `Usuario ${n}`, email: `u${n}@example.com`, role: 'admin', tenantId, ...(phone !== undefined ? { phone } : {}) })

beforeEach(async () => {
  // Estado del índice como lo declara el modelo (sin el viejo phone_1).
  await User.collection.dropIndex('phone_1').catch(() => {})
  await User.collection.createIndex({ phone: 1 }, { name: 'phone_unique_text', unique: true, partialFilterExpression: { phone: { $gt: '' } } }).catch(() => {})
})

describe('User.phone', () => {
  it('varios usuarios sin teléfono (ausente, null o vacío) se crean sin chocar', async () => {
    await mk(1)
    await mk(2, null)
    await mk(3, '')
    await mk(4, '   ')
    expect(await User.countDocuments()).toBe(4)
    // Nunca queda guardado null ni '': el campo no existe.
    expect(await User.collection.countDocuments({ phone: { $exists: true } })).toBe(0)
  })

  it('un teléfono con texto sigue siendo único', async () => {
    await mk(10, '+5491160019734')
    await expect(mk(11, ' +5491160019734 ')).rejects.toMatchObject({ code: 11000 })
  })

  it('quitar el teléfono de un usuario lo deja sin el campo', async () => {
    const u = await mk(20, '+5491100000000')
    await User.updateOne({ _id: u._id }, { $set: { phone: '' } })
    await mk(21) // otro usuario sin teléfono no choca
    expect(await User.collection.countDocuments({ phone: { $exists: true } })).toBe(0)
  })

  it('con el índice viejo de producción (phone_1 único+sparse) las altas nuevas ya no fallan', async () => {
    await User.collection.dropIndex('phone_unique_text').catch(() => {})
    await User.collection.createIndex({ phone: 1 }, { name: 'phone_1', unique: true, sparse: true })
    await mk(30)
    await mk(31, null)
    await mk(32)
    expect(await User.countDocuments()).toBe(3)
  })
})
