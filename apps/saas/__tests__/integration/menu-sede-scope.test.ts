// ============================================================================
// menu-sede-scope.test.ts — Edición de menú con sede ajena
// ============================================================================
// Las rutas admin del menú toman la sede del body/query. Un usuario con sedes
// asignadas no puede editar el menú de otra sede, ni siquiera omitiendo el
// locationId (findOne sin sede resolvía a cualquier menú del tenant).
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/translate', () => ({
  translateToEnglish: vi.fn().mockResolvedValue(''),
}))

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import { POST as createCategory } from '@/app/api/[tenant]/menu/categories/route'
import { POST as createMenu } from '@/app/api/[tenant]/menu/route'
import { auth } from '@/lib/auth'

const SLUG = 'chopis-test'
let tenant: any
let loc1: any
let loc2: any

beforeEach(async () => {
  vi.clearAllMocks()
  tenant = await Tenant.create({ slug: SLUG, name: 'Chopis', isActive: true, status: 'active', plan: 'full' })
  loc1 = await Location.create({ tenantId: tenant._id, slug: 'a', name: 'Sede A', address: 'A', isActive: true })
  loc2 = await Location.create({ tenantId: tenant._id, slug: 'b', name: 'Sede B', address: 'B', isActive: true })
  await Menu.create({ tenantId: tenant._id, locationId: loc2._id, categories: [] })
})

function setSessionUser(user: Record<string, unknown>) {
  vi.mocked(auth).mockResolvedValue({ user, expires: '' } as any)
}

const params = { params: Promise.resolve({ tenant: SLUG }) }
const post = (path: string, body: Record<string, unknown>) =>
  new NextRequest(`http://localhost/api/${SLUG}/${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })

const managerL1 = () => ({ id: 'm1', role: 'manager', tenantId: tenant._id.toString(), assignedLocations: [loc1._id.toString()] })

describe('menú — scope de sede en escritura', () => {
  it('manager de L1 crea categoría en el menú de L2 → 404 y el menú no cambia', async () => {
    setSessionUser(managerL1())
    const res = await createCategory(post('menu/categories', { locationId: loc2._id.toString(), name: 'Intrusa' }), params)
    expect(res.status).toBe(404)
    const menu = await Menu.findOne({ locationId: loc2._id }).lean() as any
    expect(menu.categories).toHaveLength(0)
  })

  it('omitir locationId no saltea el guard (resuelve al menú de L2 → 404)', async () => {
    setSessionUser(managerL1())
    const res = await createCategory(post('menu/categories', { name: 'Intrusa' }), params)
    expect(res.status).toBe(404)
  })

  it('manager de L2 crea categoría en su menú → 201/200', async () => {
    setSessionUser({ ...managerL1(), assignedLocations: [loc2._id.toString()] })
    const res = await createCategory(post('menu/categories', { locationId: loc2._id.toString(), name: 'Bebidas' }), params)
    expect(res.status).toBeLessThan(300)
  })

  it('admin sin sedes asignadas edita cualquier menú (no regresión)', async () => {
    setSessionUser({ id: 'a1', role: 'admin', tenantId: tenant._id.toString(), assignedLocations: [] })
    const res = await createCategory(post('menu/categories', { locationId: loc2._id.toString(), name: 'Postres' }), params)
    expect(res.status).toBeLessThan(300)
  })

  it('manager de L1 no crea el menú de otra sede', async () => {
    setSessionUser({ ...managerL1(), role: 'admin' })
    const loc3 = await Location.create({ tenantId: tenant._id, slug: 'c', name: 'Sede C', address: 'C', isActive: true })
    const res = await createMenu(post('menu', { locationId: loc3._id.toString() }), params)
    expect(res.status).toBe(404)
  })
})
