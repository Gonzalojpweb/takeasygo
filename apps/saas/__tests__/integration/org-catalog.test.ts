// ============================================================================
// org-catalog.test.ts — carta central del grupo (F3), de punta a punta
// ============================================================================
// Acceso por rol e interruptor, edición, armado desde una sede, vista previa
// sin guardar, envío real (ids conservados, carta nueva, registro), segundo
// envío sin cambios, precio local, deshacer (y deshacer bloqueado si la sede
// tocó la carta), alcance del gerente de marca y carta pública sin vínculos.
// ============================================================================

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

import { auth } from '@/lib/auth'
import { clearFreshUserCache } from '@/lib/apiAuth'
import { clearProjectionCaches } from '@/lib/organizations/projection'
import { sanitizeMenuForPublic } from '@/lib/menu-sanitize'
import { GET as catalogGET, POST as catalogPOST } from '@/app/api/grupo/[slug]/catalogo/route'
import { POST as pushPOST } from '@/app/api/grupo/[slug]/catalogo/enviar/route'
import { POST as undoPOST } from '@/app/api/grupo/[slug]/catalogo/deshacer/route'
import Organization from '@/models/Organization'
import OrgMembership from '@/models/OrgMembership'
import OrgCatalogPush from '@/models/OrgCatalogPush'
import Tenant from '@/models/Tenant'
import User from '@/models/User'
import Menu from '@/models/Menu'

const authMock = vi.mocked(auth)
const oid = () => new mongoose.Types.ObjectId()
let orgA: mongoose.Types.ObjectId
let tAlfa: string, tBeta: string, tAjena: string
let lCentro: string, lNorte: string, lBeta: string, lAjena: string
let norteClasicaId: string

const P = { params: Promise.resolve({ slug: 'grupo-a' }) }
const req = (method: string, body?: unknown) =>
  new NextRequest('http://localhost/api/grupo/grupo-a/catalogo', { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
const json = async (res: Response) => ({ status: res.status, body: await res.json() })

async function member(email: string, orgRole: string, scope: Record<string, unknown>) {
  const u = await User.create({ name: email, email, password: 'Pass-123456!', role: 'member', tenantId: null, phone: `+54911${Math.floor(Math.random() * 1e8)}` })
  await OrgMembership.create({ organizationId: orgA, userId: u._id, orgRole, scope, grantedBy: oid() })
  return u
}
function loginAs(u: { _id: unknown; email?: string } | null) {
  if (!u) { authMock.mockResolvedValue(null as never); return }
  authMock.mockResolvedValue({ user: { id: String(u._id), role: 'member', email: u.email, name: 'X', tenantId: null, tenantSlug: null, assignedLocations: [], issuedAt: Math.floor(Date.now() / 1000) } } as never)
}
async function location(tenantId: string, name: string) {
  return String((await mongoose.connection.db!.collection('locations').insertOne({ tenantId: new mongoose.Types.ObjectId(tenantId), name, slug: `${name.toLowerCase()}-${String(oid()).slice(-6)}`, isActive: true })).insertedId)
}

const edit = (body: Record<string, unknown>) => catalogPOST(req('POST', body), P).then(json)
const push = (body: Record<string, unknown>) => pushPOST(req('POST', body), P).then(json)
const undo = (body: Record<string, unknown>) => undoPOST(req('POST', body), P).then(json)
const view = () => catalogGET(req('GET'), P).then(json)
const menuOf = (tenantId: string, locationId: string) => Menu.findOne({ tenantId, locationId }).lean<any>()

const ORIGINAL_MODE = process.env.ORG_DASHBOARD_MODE
afterAll(() => { process.env.ORG_DASHBOARD_MODE = ORIGINAL_MODE })

beforeEach(async () => {
  await mongoose.connection.dropDatabase()
  clearFreshUserCache()
  clearProjectionCaches()
  process.env.ORG_DASHBOARD_MODE = 'on'
  orgA = (await Organization.create({ name: 'Grupo A', slug: 'grupo-a' }))._id
  tAlfa = String((await Tenant.create({ name: 'Alfa', slug: 'alfa', plan: 'full', organizationId: orgA }))._id)
  tBeta = String((await Tenant.create({ name: 'Beta', slug: 'beta', plan: 'full', organizationId: orgA }))._id)
  tAjena = String((await Tenant.create({ name: 'Ajena', slug: 'ajena', plan: 'full' }))._id)
  lCentro = await location(tAlfa, 'Centro')
  lNorte = await location(tAlfa, 'Norte')
  lBeta = await location(tBeta, 'Unica')
  lAjena = await location(tAjena, 'Ajena')

  // Alfa · Centro: la carta de la que se arma la central.
  await Menu.create({
    tenantId: tAlfa, locationId: lCentro, isActive: true, categories: [
      { name: 'Hamburguesas', sortOrder: 0, items: [
        { name: 'Clásica', price: 1_000_000, takeawayPrice: 950_000, description: 'Carne y queso', variants: [{ name: 'Doble', price: 1_300_000 }] },
        { name: 'Bacon', price: 1_200_000 },
      ] },
    ],
  })
  // Alfa · Norte: ya tiene una «Clásica» propia (sin vínculo), pausada por stock.
  const norte = await Menu.create({
    tenantId: tAlfa, locationId: lNorte, isActive: true, categories: [
      { name: 'Burgers', sortOrder: 0, items: [{ name: 'clasica', price: 900_000, isAvailable: false, pausedReason: 'stock', isFeatured: true }] },
    ],
  })
  norteClasicaId = String((norte.toObject() as any).categories[0].items[0]._id)
  // Beta no tiene carta todavía.
})

async function ownerWithCatalog() {
  const owner = await member('owner@t.test', 'owner', { allTenants: true })
  loginAs(owner)
  const imp = await edit({ action: 'importFromMenu', tenantId: tAlfa, locationId: lCentro })
  expect(imp.status).toBe(200)
  const items = imp.body.view.items as Array<{ key: string; name: string }>
  return { owner, items, keys: items.map((i) => i.key) }
}

describe('acceso', () => {
  it('propietario: ve la carta y las sedes de sus marcas (no las ajenas); sin sesión 401; no miembro 404; contador 403', async () => {
    const owner = await member('owner@t.test', 'owner', { allTenants: true })
    loginAs(owner)
    const v = await view()
    expect(v.status).toBe(200)
    expect(v.body).toMatchObject({ canEdit: true, catalogId: null, items: [] })
    expect(v.body.targets.map((t: any) => `${t.tenantName} · ${t.locationName}`)).toEqual(['Alfa · Centro', 'Alfa · Norte', 'Beta · Unica'])

    loginAs(null)
    expect((await view()).status).toBe(401)
    loginAs(await User.create({ name: 'x', email: 'x@t.test', password: 'Pass-123456!', role: 'member', tenantId: null, phone: '+5491100000001' }))
    expect((await view()).status).toBe(404)
    loginAs(await member('conta@t.test', 'accountant', { allTenants: true }))
    expect((await view()).status).toBe(403)
  })

  it('con el interruptor org.dashboard apagado: 404', async () => {
    loginAs(await member('owner@t.test', 'owner', { allTenants: true }))
    process.env.ORG_DASHBOARD_MODE = 'off'
    expect((await view()).status).toBe(404)
    expect((await push({ itemKeys: ['x'], targets: [{ tenantId: tBeta, locationId: lBeta }], fields: ['info'] })).status).toBe(404)
  })
})

describe('editar la carta central', () => {
  it('categorías y platos; nombres repetidos 409; IVA inválido y datos mal formados 400', async () => {
    loginAs(await member('owner@t.test', 'owner', { allTenants: true }))
    const cat = await edit({ action: 'upsertCategory', name: 'Postres' })
    expect(cat.status).toBe(200)
    const catKey = cat.body.key as string
    expect((await edit({ action: 'upsertCategory', name: 'postres' })).status).toBe(409)

    const item = await edit({ action: 'upsertItem', categoryKey: catKey, name: 'Flan', price: 300_000, variants: [{ name: 'Con dulce', price: 350_000 }] })
    expect(item.status).toBe(200)
    expect(item.body.view.items[0]).toMatchObject({ name: 'Flan', price: 300_000, takeawayPrice: null, variants: [{ name: 'Con dulce', price: 350_000, takeawayPrice: null }] })
    expect((await edit({ action: 'upsertItem', categoryKey: catKey, name: 'FLAN', price: 1 })).status).toBe(409)
    expect((await edit({ action: 'upsertItem', categoryKey: catKey, name: 'Budín', price: 1, ivaRate: 13 })).status).toBe(400)
    expect((await edit({ action: 'upsertItem', categoryKey: catKey, name: 'Budín', price: -5 })).status).toBe(400)
    expect((await edit({ action: 'upsertItem', categoryKey: 'no-existe', name: 'Budín', price: 1 })).status).toBe(400)
    // Categoría con platos no se borra; archivado sí.
    expect((await edit({ action: 'deleteCategory', key: catKey })).status).toBe(409)
    await edit({ action: 'archiveItem', key: item.body.key, archived: true })
    expect((await edit({ action: 'deleteCategory', key: catKey })).status).toBe(200)
  })

  it('gerente de marca: ve y envía, pero no edita ni arma desde una sede', async () => {
    loginAs(await member('bm@t.test', 'brand_manager', { tenantIds: [tBeta] }))
    const v = await view()
    expect(v.body.canEdit).toBe(false)
    expect(v.body.targets.map((t: any) => t.tenantName)).toEqual(['Beta'])
    expect((await edit({ action: 'upsertCategory', name: 'X' })).status).toBe(403)
    expect((await edit({ action: 'importFromMenu', tenantId: tAlfa, locationId: lCentro })).status).toBe(403)
  })
})

describe('armar desde una sede y enviar', () => {
  it('armar desde Alfa · Centro: platos importados y la carta de origen queda vinculada', async () => {
    const { items } = await ownerWithCatalog()
    expect(items.map((i) => i.name)).toEqual(['Clásica', 'Bacon'])
    const centro = await menuOf(tAlfa, lCentro)
    expect(centro.categories[0].items.map((i: any) => i.master?.itemKey)).toEqual(items.map((i) => i.key))
    expect(centro.categories[0].items[0].master.syncedPrice).toBe(1_000_000)
  })

  it('vista previa: informa por sede y NO guarda nada', async () => {
    const { keys } = await ownerWithCatalog()
    const before = await menuOf(tAlfa, lNorte)
    const r = await push({ itemKeys: keys, targets: [{ tenantId: tAlfa, locationId: lNorte }, { tenantId: tBeta, locationId: lBeta }], fields: ['info', 'prices', 'options'] })
    expect(r.status).toBe(200)
    expect(r.body.dryRun).toBe(true)
    const [norte, beta] = r.body.results
    expect(norte).toMatchObject({ status: 'preview', newMenu: false, summary: { linked: 1, created: 1 } })
    expect(beta).toMatchObject({ status: 'preview', newMenu: true, summary: { created: 2, categoriesCreated: 1 } })
    const after = await menuOf(tAlfa, lNorte)
    expect(after.updatedAt).toEqual(before.updatedAt)
    expect(await menuOf(tBeta, lBeta)).toBeNull()
    expect(await OrgCatalogPush.countDocuments()).toBe(0)
  })

  it('envío real: vincula sin duplicar (mismo _id, pausa intacta), crea la carta de Beta, registra; el segundo envío no cambia nada', async () => {
    const { keys } = await ownerWithCatalog()
    const targets = [{ tenantId: tAlfa, locationId: lNorte }, { tenantId: tBeta, locationId: lBeta }]
    const r = await push({ itemKeys: keys, targets, fields: ['info', 'prices', 'options'], dryRun: false })
    expect(r.body.results.map((x: any) => x.status)).toEqual(['applied', 'applied'])
    expect(r.body.pushId).toBeTruthy()

    const norte = await menuOf(tAlfa, lNorte)
    const all = norte.categories.flatMap((c: any) => c.items)
    const clasica = all.find((i: any) => String(i._id) === norteClasicaId)
    expect(clasica).toMatchObject({ name: 'Clásica', price: 1_000_000, takeawayPrice: 950_000, isAvailable: false, pausedReason: 'stock', isFeatured: true })
    expect(clasica.variants.map((v: any) => [v.name, v.price])).toEqual([['Doble', 1_300_000]])
    expect(all.map((i: any) => i.name).sort()).toEqual(['Bacon', 'Clásica'])

    const beta = await menuOf(tBeta, lBeta)
    expect(beta.categories.map((c: any) => c.name)).toEqual(['Hamburguesas'])
    expect(beta.categories[0].items.map((i: any) => i.name)).toEqual(['Clásica', 'Bacon'])

    expect(await OrgCatalogPush.countDocuments({ pushId: r.body.pushId })).toBe(2)

    const again = await push({ itemKeys: keys, targets, fields: ['info', 'prices', 'options'], dryRun: false })
    expect(again.body.results.map((x: any) => x.status)).toEqual(['unchanged', 'unchanged'])
    expect(await OrgCatalogPush.countDocuments()).toBe(2)
  })

  it('precio cambiado por la sede: se conserva; con «pisar precios locales» se reemplaza', async () => {
    const { keys, items } = await ownerWithCatalog()
    const target = [{ tenantId: tAlfa, locationId: lNorte }]
    await push({ itemKeys: keys, targets: target, fields: ['info', 'prices', 'options'], dryRun: false })
    // La sede sube la Clásica a $11.000.
    await Menu.updateOne({ tenantId: tAlfa, locationId: lNorte }, { $set: { 'categories.0.items.0.price': 1_100_000 } })
    // El dueño sube la Clásica a $10.500 en la carta central.
    const clasicaKey = items.find((i) => i.name === 'Clásica')!.key
    const cat = (await view()).body.categories[0].key
    await edit({ action: 'upsertItem', key: clasicaKey, categoryKey: cat, name: 'Clásica', price: 1_050_000, takeawayPrice: 950_000, description: 'Carne y queso', variants: [{ name: 'Doble', price: 1_300_000 }] })

    const kept = await push({ itemKeys: [clasicaKey], targets: target, fields: ['prices'], dryRun: false })
    expect(kept.body.results[0]).toMatchObject({ status: 'unchanged', summary: { localPricesKept: 1 } })
    expect((await menuOf(tAlfa, lNorte)).categories[0].items[0].price).toBe(1_100_000)

    const forced = await push({ itemKeys: [clasicaKey], targets: target, fields: ['prices'], overrideLocalPrices: true, dryRun: false })
    expect(forced.body.results[0].status).toBe('applied')
    expect((await menuOf(tAlfa, lNorte)).categories[0].items[0].price).toBe(1_050_000)
  })

  it('deshacer: restaura la carta de antes; dos veces no; si la sede tocó la carta después, no se pisa', async () => {
    const { keys } = await ownerWithCatalog()
    const r = await push({ itemKeys: keys, targets: [{ tenantId: tAlfa, locationId: lNorte }, { tenantId: tBeta, locationId: lBeta }], fields: ['info', 'prices', 'options'], dryRun: false })
    const pushId = r.body.pushId

    const ok = await undo({ pushId, tenantId: tAlfa, locationId: lNorte })
    expect(ok.status).toBe(200)
    const norte = await menuOf(tAlfa, lNorte)
    expect(norte.categories[0].items.map((i: any) => [i.name, i.price, i.master ?? null])).toEqual([['clasica', 900_000, null]])
    expect((await undo({ pushId, tenantId: tAlfa, locationId: lNorte })).status).toBe(409)

    // Beta tocó su carta después del envío.
    await Menu.updateOne({ tenantId: tBeta, locationId: lBeta }, { $set: { 'categories.0.items.0.price': 1 } })
    const blocked = await undo({ pushId, tenantId: tBeta, locationId: lBeta })
    expect(blocked).toMatchObject({ status: 409, body: { code: 'menu_changed' } })
    expect((await menuOf(tBeta, lBeta)).categories[0].items[0].price).toBe(1)

    const v = await view()
    expect(v.body.pushes.map((p: any) => [p.target, p.undone]).sort()).toEqual([['Alfa · Norte', true], ['Beta · Unica', false]])
  })

  it('gerente de marca: envía a su marca; a otra marca o a una sede ajena 404', async () => {
    const { keys } = await ownerWithCatalog()
    loginAs(await member('bm@t.test', 'brand_manager', { tenantIds: [tBeta] }))
    const okRes = await push({ itemKeys: keys, targets: [{ tenantId: tBeta, locationId: lBeta }], fields: ['info'], dryRun: false })
    expect(okRes.body.results[0].status).toBe('applied')
    expect((await push({ itemKeys: keys, targets: [{ tenantId: tAlfa, locationId: lNorte }], fields: ['info'], dryRun: false })).status).toBe(404)
    expect((await push({ itemKeys: keys, targets: [{ tenantId: tAjena, locationId: lAjena }], fields: ['info'] })).status).toBe(404)
    // Solo ve los envíos de sus sedes.
    expect((await view()).body.pushes.every((p: any) => p.tenantId === tBeta)).toBe(true)
  })

  it('validaciones del envío y carta pública sin vínculos internos', async () => {
    const { keys } = await ownerWithCatalog()
    expect((await push({ itemKeys: ['no-existe'], targets: [{ tenantId: tBeta, locationId: lBeta }], fields: ['info'] })).status).toBe(400)
    expect((await push({ itemKeys: keys, targets: [{ tenantId: tBeta, locationId: lBeta }], fields: [] })).status).toBe(400)
    expect((await push({ itemKeys: keys, targets: [{ tenantId: tBeta, locationId: lBeta }], fields: ['todo'] })).status).toBe(400)

    await push({ itemKeys: keys, targets: [{ tenantId: tBeta, locationId: lBeta }], fields: ['info'], dryRun: false })
    const menu = await Menu.findOne({ tenantId: tBeta, locationId: lBeta })
    const pub = JSON.stringify(sanitizeMenuForPublic(menu))
    expect(pub).not.toContain('syncedPrice')
    expect(pub).not.toContain('masterCategoryKey')
  })
})
