// ============================================================================
// provision-tenant.test.ts — Alta rápida de comercios (Superadmin)
// ============================================================================
// Una sola función crea comercio (aprobado), sedes, menú, identidad, dueño
// invitado y organización; si algo falla se deshace todo. Idempotente por clave.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import crypto from 'crypto'
import mongoose from 'mongoose'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

import Tenant from '@/models/Tenant'
import User from '@/models/User'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import Organization from '@/models/Organization'
import OrgMembership from '@/models/OrgMembership'
import { provisionTenant, regenerateInvite, ProvisionError } from '@/lib/provisioning/provision'
import { getActivationStatus } from '@/lib/provisioning/activation'
import { applyMenuJson } from '@/lib/provisioning/menu-apply'
import { parseMenuJson } from '@/lib/provisioning/menu-json'
import { POST as resetPassword } from '@/app/api/auth/reset-password/route'
import { NextRequest } from 'next/server'

const actor = { userId: null, name: 'Superadmin Test', email: 'sa@takeasygo.com' }
const sendInvite = vi.fn().mockResolvedValue(undefined)
const deps = { geocode: vi.fn().mockResolvedValue({ lat: -34.6, lng: -58.4 }), sendInvite, appUrl: 'https://app.test' }
let n = 0
const base = (over: Record<string, unknown> = {}) => ({
  idempotencyKey: `key-${++n}-${Date.now()}`,
  name: 'Pizza Crash',
  rubro: 'pizzeria',
  owner: { name: 'Ana Dueña', email: `ana${n}@example.com`, phone: '11 6001 9734' },
  locations: [{ address: 'Av. Corrientes 1234, CABA' }],
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  deps.geocode.mockResolvedValue({ lat: -34.6, lng: -58.4 })
})

describe('alta rápida — caso base', () => {
  it('crea comercio aprobado, sede con horarios del rubro, categorías vacías y dueño invitado', async () => {
    const r = await provisionTenant(base({ plan: 'buy' }), actor, deps)
    expect(r.reused).toBe(false)
    expect(r.tenant).toMatchObject({ name: 'Pizza Crash', slug: 'pizza-crash', plan: 'buy' })

    const t = await Tenant.findById(r.tenant.id).lean() as any
    expect(t.onboarding.status).toBe('none') // nace aprobado
    expect(t.isActive).toBe(true)
    expect(t.status).toBe('active')
    expect(t.branding.primaryColor).toBe('#C53030') // color del rubro
    expect(t.provisioning).toMatchObject({ rubro: 'pizzeria', menuSource: 'template', by: 'sa@takeasygo.com' })

    const loc = await Location.findOne({ tenantId: t._id }).lean() as any
    expect(loc).toMatchObject({ name: 'Sede Principal', slug: 'sede-principal', address: 'Av. Corrientes 1234, CABA' })
    expect(loc.hours).toMatch(/19:30/)
    expect(loc.serviceHours.takeaway).toHaveLength(1)
    expect(loc.geo.coordinates).toEqual([-58.4, -34.6])

    const menu = await Menu.findOne({ tenantId: t._id }).lean() as any
    expect(menu.categories.map((c: any) => c.name)).toContain('Pizzas')
    expect(menu.categories.every((c: any) => c.items.length === 0)).toBe(true)

    // Dueño: sin contraseña, con link de un solo uso guardado con hash.
    const owner = await User.findOne({ email: r.owner.email }).select('+password +resetToken +resetTokenExpiry').lean() as any
    expect(owner.role).toBe('admin')
    expect(owner.password ?? null).toBeNull()
    const raw = new URL(r.invite!.url).searchParams.get('token')!
    expect(r.invite!.url).toContain('bienvenida=1')
    expect(owner.resetToken).toBe(crypto.createHash('sha256').update(raw).digest('hex'))
    expect(new Date(owner.resetTokenExpiry).getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000)
    expect(r.invite!.whatsappUrl).toMatch(/^https:\/\/wa\.me\/541160019734\?text=/)
    expect(sendInvite).toHaveBeenCalledWith(r.owner.email, 'Pizza Crash', r.invite!.url)
    expect(r.emailSent).toBe(true)
  })

  it('el link de invitación activa la cuenta y verifica el email', async () => {
    const r = await provisionTenant(base(), actor, deps)
    const token = new URL(r.invite!.url).searchParams.get('token')!
    const res = await resetPassword(new NextRequest('http://localhost/api/auth/reset-password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, password: 'Clave-Segura-2026' }) }))
    expect(res.status).toBe(200)
    const owner = await User.findOne({ email: r.owner.email }).select('+password').lean() as any
    expect(owner.password).toBeTruthy()
    expect(owner.emailVerified).toBeTruthy()
    expect((await getActivationStatus(r.tenant.id))!.items.find(i => i.key === 'owner')!.done).toBe(true)
  })

  it('misma clave dos veces (doble toque) no crea dos comercios', async () => {
    const input = base()
    const first = await provisionTenant(input, actor, deps)
    const second = await provisionTenant(input, actor, deps)
    expect(second.reused).toBe(true)
    expect(second.tenant.id).toBe(first.tenant.id)
    expect(await Tenant.countDocuments({ name: 'Pizza Crash', 'provisioning.idempotencyKey': input.idempotencyKey })).toBe(1)
  })

  it('enlace usado: agrega un número; si se pidió explícito, avisa', async () => {
    await provisionTenant(base(), actor, deps)
    const second = await provisionTenant(base(), actor, deps)
    expect(second.tenant.slug).toBe('pizza-crash-2')
    await expect(provisionTenant(base({ slug: 'pizza-crash' }), actor, deps)).rejects.toMatchObject({ status: 409, code: 'slug_taken' })
  })

  it('varias sedes con enlaces distintos y la dirección que no se ubica queda como aviso', async () => {
    deps.geocode.mockResolvedValueOnce({ lat: -34.6, lng: -58.4 }).mockResolvedValueOnce(null)
    const r = await provisionTenant(base({ locations: [{ address: 'Av. Corrientes 1234' }, { name: 'Palermo', address: 'Honduras 4800' }] }), actor, deps)
    expect(r.locations.map(l => l.slug)).toEqual(['sede-principal', 'palermo'])
    expect(await Menu.countDocuments({ tenantId: r.tenant.id })).toBe(2)
    expect(r.warnings.some(w => w.includes('Palermo'))).toBe(true)
  })

  it('si el email falla, el alta queda igual y se avisa', async () => {
    sendInvite.mockRejectedValueOnce(new Error('smtp down'))
    const r = await provisionTenant(base(), actor, deps)
    expect(r.emailSent).toBe(false)
    expect(r.warnings.join(' ')).toMatch(/WhatsApp/)
    expect(await Tenant.exists({ _id: r.tenant.id })).toBeTruthy()
  })
})

describe('alta rápida — carta', () => {
  it('desde JSON v1: precios en pesos se guardan en centavos', async () => {
    const json = { version: 1, categories: [{ name: 'Pizzas', items: [{ name: 'Muzzarella', price: 12000 }] }] }
    const r = await provisionTenant(base({ menu: { source: 'json', json: JSON.stringify(json) } }), actor, deps)
    expect(r.menuItems).toBe(1)
    const menu = await Menu.findOne({ tenantId: r.tenant.id }).lean() as any
    expect(menu.categories[0].items[0].price).toBe(1_200_000)
  })

  it('JSON inválido: no crea nada', async () => {
    const before = await Tenant.countDocuments()
    await expect(provisionTenant(base({ menu: { source: 'json', json: '{"categories":[]}' } }), actor, deps)).rejects.toMatchObject({ status: 400, code: 'invalid_menu_json' })
    expect(await Tenant.countDocuments()).toBe(before)
  })

  it('copiar de otro comercio: con precios, sin likes ni premios ni pausas por stock; horarios y modos', async () => {
    const src = await Tenant.create({ name: 'Origen', slug: `origen-${n}`, plan: 'full', status: 'active', isActive: true })
    const srcLoc = await Location.create({ tenantId: src._id, name: 'Centro', slug: 'centro', address: 'Calle 1', timezone: 'America/Argentina/Cordoba', hours: 'Lun a lun · 9 a 18', settings: { orderModes: ['takeaway', 'delivery'] } })
    await Menu.create({ tenantId: src._id, locationId: srcLoc._id, categories: [{ name: 'Clásicos', items: [{ name: 'Lomo', price: 900000, likesCount: 40, pausedReason: 'stock', isAvailable: true, hiddenReward: { enabled: true, pointsCost: 100 } }] }] })

    const r = await provisionTenant(base({ menu: { source: 'clone' }, clone: { tenantId: String(src._id), menu: 'with_prices', schedules: true, orderModes: true } }), actor, deps)
    const menu = await Menu.findOne({ tenantId: r.tenant.id }).lean() as any
    const item = menu.categories[0].items[0]
    expect(item.price).toBe(900000)
    expect(item.likesCount).toBe(0)
    expect(item.pausedReason ?? null).toBeNull()
    expect(item.hiddenReward?.enabled ?? false).toBe(false)
    const loc = await Location.findOne({ tenantId: r.tenant.id }).lean() as any
    expect(loc.timezone).toBe('America/Argentina/Cordoba')
    expect(loc.hours).toBe('Lun a lun · 9 a 18')
    expect(loc.settings.orderModes).toEqual(['takeaway', 'delivery'])
    expect(loc.address).toBe('Av. Corrientes 1234, CABA') // la dirección es la propia
  })

  it('copiar sin precios: productos en $0 y pausados', async () => {
    const src = await Tenant.create({ name: 'Origen2', slug: `origen2-${n}`, plan: 'full', status: 'active', isActive: true })
    const srcLoc = await Location.create({ tenantId: src._id, name: 'Centro', slug: 'centro', address: 'Calle 1' })
    await Menu.create({ tenantId: src._id, locationId: srcLoc._id, categories: [{ name: 'Clásicos', items: [{ name: 'Lomo', price: 900000 }] }] })
    const r = await provisionTenant(base({ menu: { source: 'clone' }, clone: { tenantId: String(src._id), menu: 'without_prices', schedules: false, orderModes: false } }), actor, deps)
    const item = ((await Menu.findOne({ tenantId: r.tenant.id }).lean()) as any).categories[0].items[0]
    expect(item.price).toBe(0)
    expect(item.isAvailable).toBe(false)
  })
})

describe('alta rápida — dueño con cuenta y organizaciones', () => {
  it('email con cuenta y sin organización: no crea nada y explica', async () => {
    const other = await Tenant.create({ name: 'Otra', slug: `otra-${n}`, plan: 'trial', status: 'active', isActive: true })
    await User.create({ name: 'Dueño', email: 'dueno-existente@example.com', role: 'admin', tenantId: other._id, password: 'x'.repeat(60) })
    const before = await Tenant.countDocuments()
    await expect(provisionTenant(base({ owner: { email: 'dueno-existente@example.com' } }), actor, deps)).rejects.toMatchObject({ status: 409, code: 'owner_exists' })
    expect(await Tenant.countDocuments()).toBe(before)
  })

  it('email con cuenta + organización nueva: vincula la marca y le da acceso sin crear otra cuenta', async () => {
    const other = await Tenant.create({ name: 'Marca 1', slug: `marca1-${n}`, plan: 'full', status: 'active', isActive: true })
    const owner = await User.create({ name: 'Dueño', email: `grupo${n}@example.com`, role: 'admin', tenantId: other._id, password: 'x'.repeat(60) })
    const r = await provisionTenant(base({ owner: { email: owner.email }, organization: { mode: 'new', name: 'Grupo Crash' } }), actor, deps)
    expect(r.owner).toMatchObject({ existingAccount: true, id: String(owner._id) })
    expect(r.invite).toBeNull()
    const t = await Tenant.findById(r.tenant.id).lean() as any
    const org = await Organization.findById(t.organizationId).lean() as any
    expect(org.name).toBe('Grupo Crash')
    const m = await OrgMembership.findOne({ organizationId: org._id, userId: owner._id }).lean() as any
    expect(m).toMatchObject({ orgRole: 'owner', tenantRole: 'admin', status: 'active' })
    expect(await User.countDocuments({ email: owner.email })).toBe(1)
  })

  it('organización existente: el comercio queda vinculado', async () => {
    const org = await Organization.create({ name: 'Grupo Existente', slug: `grupo-existente-${n}` })
    const r = await provisionTenant(base({ organization: { mode: 'existing', orgId: String(org._id) } }), actor, deps)
    expect(String(((await Tenant.findById(r.tenant.id).lean()) as any).organizationId)).toBe(String(org._id))
  })
})

describe('alta rápida — deshacer si algo falla a mitad', () => {
  it('un error al crear el menú borra comercio, dueño y sedes', async () => {
    const spy = vi.spyOn(Menu, 'create').mockRejectedValueOnce(new Error('disco lleno') as never)
    const input = base({ owner: { email: `rollback${n}@example.com` } })
    await expect(provisionTenant(input, actor, deps)).rejects.toBeInstanceOf(ProvisionError)
    spy.mockRestore()
    expect(await Tenant.exists({ 'provisioning.idempotencyKey': input.idempotencyKey })).toBeNull()
    expect(await User.exists({ email: `rollback${n}@example.com` })).toBeNull()
    expect(await Location.countDocuments({ address: 'Av. Corrientes 1234, CABA', name: 'Sede Principal', tenantId: { $nin: (await Tenant.find().select('_id').lean()).map((t: any) => t._id) } })).toBe(0)
  })

  it('una organización nueva también se deshace', async () => {
    // Falla al vincular la marca, DESPUÉS de crear la organización.
    const spy = vi.spyOn(Tenant, 'updateOne').mockRejectedValueOnce(new Error('falla') as never)
    const input = base({ organization: { mode: 'new', name: `Grupo Fantasma ${n}` } })
    const orgName = `Grupo Fantasma ${n}`
    await expect(provisionTenant(input, actor, deps)).rejects.toBeInstanceOf(ProvisionError)
    spy.mockRestore()
    expect(await Organization.exists({ name: orgName })).toBeNull()
    expect(await Tenant.exists({ 'provisioning.idempotencyKey': input.idempotencyKey })).toBeNull()
  })
})

describe('invitación y pendientes', () => {
  it('reenviar genera un link nuevo y el anterior deja de servir', async () => {
    const r = await provisionTenant(base(), actor, deps)
    const oldToken = new URL(r.invite!.url).searchParams.get('token')!
    const again = await regenerateInvite(r.tenant.id, { ...deps, sendEmail: false })
    expect(again.emailSent).toBe(false)
    const newToken = new URL(again.url).searchParams.get('token')!
    expect(newToken).not.toBe(oldToken)
    const old = await resetPassword(new NextRequest('http://localhost/api/auth/reset-password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: oldToken, password: 'Clave-Segura-2026' }) }))
    expect(old.status).toBe(400)
  })

  it('no se reenvía si el dueño ya activó su cuenta', async () => {
    const r = await provisionTenant(base(), actor, deps)
    await User.updateOne({ email: r.owner.email }, { $set: { password: 'y'.repeat(60) } })
    await expect(regenerateInvite(r.tenant.id, deps)).rejects.toMatchObject({ status: 409, code: 'already_active' })
  })

  it('pendientes: dueño, carta, logo, horario, MercadoPago e historia', async () => {
    const r = await provisionTenant(base(), actor, deps)
    const s = (await getActivationStatus(r.tenant.id))!
    const by = Object.fromEntries(s.items.map(i => [i.key, i.done]))
    expect(by).toMatchObject({ owner: false, menu: false, logo: false, hours: true, mercadopago: false, profile: false })
    const json = parseMenuJson({ version: 1, categories: [{ name: 'Pizzas', items: [{ name: 'Muzza', price: 12000 }] }] })
    if (!json.ok) throw new Error(json.error)
    await applyMenuJson(r.tenant.id, r.locations[0].id, json.menu, 'append')
    expect((await getActivationStatus(r.tenant.id))!.items.find(i => i.key === 'menu')!.done).toBe(true)
    // append con el mismo nombre suma a la categoría existente (no la duplica).
    const menu = await Menu.findOne({ tenantId: r.tenant.id }).lean() as any
    expect(menu.categories.filter((c: any) => c.name === 'Pizzas')).toHaveLength(1)
    expect(new mongoose.Types.ObjectId(r.tenant.id)).toBeTruthy()
  })
})
