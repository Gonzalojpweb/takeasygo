import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import './setup'

import Tenant from '@/models/Tenant'
import User from '@/models/User'
import { auth } from '@/lib/auth'
import { SUPERADMIN_DB_FIELDS, superAdminSession } from '../fixtures/superadmin-session'

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

// Desde el 19/11/2026 las rutas de SuperAdmin exigen sesión con MFA verificado
// (lib/superadmin-guard): sin esto todo respondía 403.
async function signInSuperAdmin() {
  const sa = await User.create({ name: 'SA', email: `sa-${Math.random().toString(36).slice(2, 8)}@t.test`, password: 'x'.repeat(20), phone: `+54911${Math.floor(Math.random() * 1e8)}`, tenantId: null, ...SUPERADMIN_DB_FIELDS })
  vi.mocked(auth).mockResolvedValue(superAdminSession(String(sa._id)) as any)
}

describe('alta del superadmin: slug reservado', () => {
  beforeEach(async () => { await mongoose.connection.dropDatabase(); await signInSuperAdmin() })

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
    await signInSuperAdmin()
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

describe('multi-rubro en el alta y la edición del superadmin', () => {
  beforeEach(async () => { await mongoose.connection.dropDatabase(); await signInSuperAdmin() })

  it('el alta clásica guarda rubro, plantilla y módulos (solo las diferencias con el rubro)', async () => {
    const res = await POST(post({ name: 'Tecno', slug: 'tecno', vertical: 'tecnologia', storefrontTemplate: 'retail', modules: ['catalog', 'inventory', 'takeaway', 'reservations'] }))
    expect(res.status).toBe(201)
    const t = await Tenant.findOne({ slug: 'tecno' }).lean() as any
    expect(t).toMatchObject({ vertical: 'tecnologia', storefrontTemplate: 'retail', moduleOverrides: { enabled: ['reservations'], disabled: ['delivery'] } })
  })

  it('sin rubro el alta queda Gastronomía; la edición cambia el rubro y descarta módulos desconocidos', async () => {
    await POST(post({ name: 'Resto', slug: 'resto' }))
    const t = await Tenant.findOne({ slug: 'resto' }).lean() as any
    expect(t).toMatchObject({ vertical: 'gastronomia', storefrontTemplate: 'gastronomia' })

    const res = await PUT(put({ verticalSelection: { vertical: 'kiosco', modules: ['catalog', 'takeaway', 'inventada'] } }), { params: Promise.resolve({ tenantId: String(t._id) }) })
    expect(res.status).toBe(200)
    const after = await Tenant.findById(t._id).lean() as any
    expect(after).toMatchObject({ vertical: 'kiosco', storefrontTemplate: 'retail', moduleOverrides: { enabled: [], disabled: ['inventory', 'delivery'] } })
  })
})
