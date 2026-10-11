import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import './setup'

import Tenant from '@/models/Tenant'
import User from '@/models/User'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

import { DELETE } from '@/app/api/superadmin/tenants/[tenantId]/route'

/**
 * DELETE /api/superadmin/tenants/[tenantId] con cascade.
 *
 * Antes borramaba el Tenant sin tocar los usuarios: las cuentas quedaban
 * "vivas" con tenantId apuntando a un documento inexistente y podían
 * loguear (huérfanos Tigo/Baldo/Testy). Ahora se desactivan primero
 * (isActive: false, reversible) y la respuesta informa deactivatedUsers.
 */

describe('DELETE tenant + cascade de usuarios', () => {
  let tenantId: string

  beforeEach(async () => {
    await mongoose.connection.dropDatabase()
    const tenant = await Tenant.create({ name: 'Cascade Tenant', slug: 'cascade-tenant', plan: 'full' })
    tenantId = String(tenant._id)
  })

  function req(): NextRequest {
    return new NextRequest('http://localhost/api/superadmin/tenants/x', {
      method: 'DELETE',
    })
  }

  it('desactiva los usuarios del tenant antes de borrarlo', async () => {
    await User.create([
      { name: 'Admin', email: 'admin@cascade.test', password: 'Pass-123456!', role: 'admin', tenantId, phone: '541100000001' },
      { name: 'Staff', email: 'staff@cascade.test', password: 'Pass-123456!', role: 'staff', tenantId, phone: '541100000002' },
    ])

    const res = await DELETE(req(), { params: Promise.resolve({ tenantId }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.deactivatedUsers).toBe(2)

    expect(await Tenant.findById(tenantId)).toBeNull()

    const users = await User.find({ email: /@cascade\.test$/ }).lean()
    expect(users).toHaveLength(2)
    for (const u of users) expect(u.isActive).toBe(false)
  })

  it('404 si el tenant no existe y no toca usuarios', async () => {
    const ghost = String(new mongoose.Types.ObjectId())
    await User.create({
      name: 'Other', email: 'other@cascade.test', password: 'Pass-123456!', role: 'staff',
    })

    const res = await DELETE(req(), { params: Promise.resolve({ tenantId: ghost }) })
    expect(res.status).toBe(404)

    const other = await User.findOne({ email: 'other@cascade.test' }).lean()
    expect(other?.isActive).toBe(true)
  })

  it('responde deactivatedUsers: 0 cuando el tenant no tiene usuarios', async () => {
    const res = await DELETE(req(), { params: Promise.resolve({ tenantId }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.deactivatedUsers).toBe(0)
  })
})
