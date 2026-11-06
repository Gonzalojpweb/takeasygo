import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import './setup'

import Tenant from '@/models/Tenant'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

import { POST } from '@/app/api/superadmin/tenants/route'
import { PUT } from '@/app/api/superadmin/tenants/[tenantId]/route'

/**
 * Multi-marca PR 5: el alta y la edición del superadmin validan el slug con
 * la misma lista de reservados que el alta pública (lib/reserved-slugs.ts).
 * Antes el alta solo chequeaba formato y la edición aceptaba cualquier cosa.
 */

function post(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/superadmin/tenants', {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  })
}
function put(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/superadmin/tenants/x', {
    method: 'PUT', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  })
}

describe('alta del superadmin: slug reservado', () => {
  beforeEach(async () => { await mongoose.connection.dropDatabase() })

  it.each(['grupo', 'superadmin', 'api', 'org'])('rechaza "%s" con 400 y no crea nada', async (slug) => {
    const res = await POST(post({ name: 'Marca X', slug }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/reservado/)
    expect(await Tenant.countDocuments()).toBe(0)
  })

  it('un slug normal se crea', async () => {
    const res = await POST(post({ name: 'Marca X', slug: 'marca-x' }))
    expect(res.status).toBe(201)
    expect(await Tenant.exists({ slug: 'marca-x' })).toBeTruthy()
  })
})

describe('edición del superadmin: cambio de slug', () => {
  let id: string
  beforeEach(async () => {
    await mongoose.connection.dropDatabase()
    const t = await Tenant.create({ name: 'Uno', slug: 'uno', plan: 'full' })
    await Tenant.create({ name: 'Dos', slug: 'dos', plan: 'full' })
    id = String(t._id)
  })
  const call = (body: unknown, tenantId = id) => PUT(put(body), { params: Promise.resolve({ tenantId }) })

  it('rechaza un slug reservado', async () => {
    const res = await call({ slug: 'grupo' })
    expect(res.status).toBe(400)
    expect((await Tenant.findById(id).lean())?.slug).toBe('uno')
  })

  it('rechaza formato inválido', async () => {
    const res = await call({ slug: 'Con Espacios!' })
    expect(res.status).toBe(400)
    expect((await Tenant.findById(id).lean())?.slug).toBe('uno')
  })

  it('rechaza un slug de otro comercio con 400 (no 500)', async () => {
    const res = await call({ slug: 'dos' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/en uso/)
  })

  it('acepta un cambio válido', async () => {
    const res = await call({ slug: 'uno-nuevo' })
    expect(res.status).toBe(200)
    expect((await Tenant.findById(id).lean())?.slug).toBe('uno-nuevo')
  })

  it('un comercio con slug viejo hoy reservado lo conserva al guardar otros campos', async () => {
    const legacy = await Tenant.create({ name: 'Ayuda SA', slug: 'ayuda', plan: 'full' })
    const res = await call({ slug: 'ayuda', name: 'Ayuda SRL' }, String(legacy._id))
    expect(res.status).toBe(200)
    const after = await Tenant.findById(legacy._id).lean()
    expect(after?.slug).toBe('ayuda')
    expect(after?.name).toBe('Ayuda SRL')
  })
})
