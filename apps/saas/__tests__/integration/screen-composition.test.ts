// ============================================================================
// screen-composition.test.ts — Composiciones (Élite) (23/11/2026)
// ============================================================================
// · Se crean como pieza automática (kind 'composition') de una sede.
// · El manifiesto hidrata cada módulo con la carta, combos (lo que incluye
//   sale del itemPool), promos (con ventana y franja) y la marca (fuentes como
//   archivos a guardar). La lista de precios no lleva fotos.
// · Una ilustración tiene que ser del comercio; una config rota guardada no
//   tira el manifiesto. Catálogo para el armador del panel.
// ============================================================================
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import mongoose from 'mongoose'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/rateLimit', () => ({ rateLimit: vi.fn().mockResolvedValue({ success: true }) }))
vi.mock('@/lib/display/fonts', async (orig) => ({ ...(await orig<typeof import('@/lib/display/fonts')>()), resolveGoogleFonts: vi.fn(async (fams: string[]) => Object.fromEntries(fams.map((f) => [f, `https://fonts.gstatic.com/s/${f.toLowerCase().replace(/ /g, '')}/v1/a.woff2`]))) }))
vi.mock('@/lib/media/ads', async (orig) => ({ ...(await orig<typeof import('@/lib/media/ads')>()), markSaved: vi.fn(async () => {}) }))

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import AppStory from '@/models/AppStory'
import Combo from '@/models/Combo'
import Promotion from '@/models/Promotion'
import DisplayDevice from '@/models/DisplayDevice'
import { GET as catalog, POST as createTemplate } from '@/app/api/[tenant]/screen-pieces/templates/route'
import { GET as manifest } from '@/app/api/display/manifest/route'
import { auth } from '@/lib/auth'
import { markSaved } from '@/lib/media/ads'
import { generateDisplayToken, hashDisplayToken } from '@/lib/display/auth'
import { buildCompositionBoard, compositionAssets, compositionHasContent } from '@/lib/display/composition'
import { compositionConfigSchema, parseCompositionConfig } from '@/lib/display/composition-schema'
import { fontUrlFromCss } from '@/lib/display/fonts'

const oid = () => new mongoose.Types.ObjectId()
const ids = { burgers: oid(), vinos: oid(), bebidas: oid(), doble: oid(), simple: oid(), malbec: oid(), torrontes: oid(), coca: oid(), pausada: oid() }
const img = (n: string) => `https://res.cloudinary.com/tgo/image/upload/v1/menus/${n}.png`
let A: any, loc: any, token: string, combo: any, promo: any, menu: any

beforeEach(async () => {
  vi.clearAllMocks()
  Object.assign(process.env, { CLOUDINARY_ADS_CLOUD_NAME: 'tgoads', CLOUDINARY_ADS_API_KEY: '123456789012345', CLOUDINARY_ADS_API_SECRET: 'secreto-de-prueba-27-chars!', CLOUDINARY_ADS_FOLDER_ROOT: 'ads' })
  A = await Tenant.create({ slug: 'sc-a', name: 'Hamburguesería Demo', isActive: true, status: 'active', plan: 'high', branding: { logoUrl: img('logo'), primaryColor: '#3366CC', fonts: { heading: { source: 'google', family: 'Roboto Slab' }, body: { source: 'custom', family: 'Mi Fuente', files: { woff2: 'https://res.cloudinary.com/tgo/raw/upload/mi.woff2' } } } } })
  loc = await Location.create({ tenantId: A._id, slug: 'a1', name: 'A1', address: 'x', isActive: true })
  menu = await Menu.create({ tenantId: A._id, locationId: loc._id, isActive: true, categories: [
    { _id: ids.burgers, name: 'Burgers', items: [
      { _id: ids.doble, name: 'Doble Clásica', description: 'Doble smash', price: 1500000, imageUrl: img('doble'), isAvailable: true },
      { _id: ids.simple, name: 'Simple', price: 1400000, imageUrl: img('simple'), isAvailable: true },
      { _id: ids.pausada, name: 'Pausada', price: 1000000, isAvailable: false, pausedReason: 'stock' },
    ] },
    { _id: ids.vinos, name: 'Vinos', items: [
      { _id: ids.malbec, name: 'Malbec Reserva', price: 1250000, isAvailable: true },
      { _id: ids.torrontes, name: 'Torrontés', price: 920000, isAvailable: true },
    ] },
    { _id: ids.bebidas, name: 'Bebidas', items: [{ _id: ids.coca, name: 'Coca', price: 300000, imageUrl: img('coca'), isAvailable: true }] },
  ] })
  combo = await Combo.collection.insertOne({ tenantId: A._id, locationId: null, name: 'Combo Doble', priceMode: 'fixed', fixedPrice: 1650000, itemPool: [String(ids.doble), String(ids.coca)], isActive: true, minItems: 1, maxItems: 2, sortOrder: 0, style: { imageUrl: img('combo') }, createdAt: new Date() })
  promo = await Promotion.create({ scope: 'tenant', tenantId: A._id, type: 'sale', title: 'Martes 2×1', price: 1500000, originalPrice: 3000000, activeDays: [2], isActive: true, slots: [{ name: 'x', requiredQuantity: 1 }] })
  token = generateDisplayToken()
  await DisplayDevice.create({ status: 'active', tenantId: A._id, locationId: loc._id, name: 'TV', orientation: 'landscape', tokenHash: hashDisplayToken(token) })
  vi.mocked(auth).mockResolvedValue({ user: { id: 'u1', role: 'admin', tenantId: String(A._id), assignedLocations: [] }, expires: '' } as any)
})

const p = { params: Promise.resolve({ tenant: 'sc-a' }) }
const post = (body: unknown) => createTemplate(new NextRequest('http://localhost/api/sc-a/screen-pieces/templates', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), p)
const getManifest = () => manifest(new NextRequest('http://localhost/api/display/manifest', { headers: { authorization: `Bearer ${token}` } }))
const composition = (modules: unknown[], extra: Record<string, unknown> = {}) => ({ title: 'Composición', locationId: String(loc._id), template: { kind: 'composition', config: { style: 'dark', pageSeconds: 12, modules, ...extra } } })

describe('composiciones', () => {
  it('se crean y el manifiesto hidrata cada módulo (carta, combo con lo que incluye, promo con franja, lista sin fotos, fuentes)', async () => {
    const res = await post(composition([
      { type: 'brand-header', config: { tagline: 'Smash burgers', showLogo: true } },
      { type: 'hero-product', config: { productId: String(ids.doble), badge: 'MÁS PEDIDA' } },
      { type: 'product-grid', config: { productIds: [String(ids.simple), String(ids.pausada), String(oid())] } },
      { type: 'combo-highlight', config: { comboId: String(combo.insertedId), badge: 'PROMO' } },
      { type: 'promo-banner', config: { promotionId: String(promo._id), headline: '¡HOY!' } },
      { type: 'drinks-row', config: { productIds: [String(ids.coca)] } },
      { type: 'price-list', config: { categoryIds: [String(ids.vinos)] } },
      { type: 'qr-cta', config: {} },
    ]))
    expect(res.status).toBe(201)
    const m = await (await getManifest()).json()
    expect(m.items).toHaveLength(1)
    const t = m.items[0].template
    expect(t).toMatchObject({ kind: 'composition', style: 'dark', pageMs: 12000 })
    const mod = (type: string) => t.modules.find((x: any) => x.type === type)
    expect(mod('hero-product').product).toMatchObject({ name: 'Doble Clásica', price: 1500000, badge: 'MÁS PEDIDA' })
    expect(mod('hero-product').product.image).toContain('w_960')
    // Producto que no existe: fuera; pausado: viaja con available=false (la pantalla lo oculta).
    expect(mod('product-grid').products.map((x: any) => [x.name, x.available])).toEqual([['Simple', true], ['Pausada', false]])
    expect(mod('combo-highlight').combo).toMatchObject({ name: 'Combo Doble', price: 1650000, includes: ['Doble Clásica', 'Coca'] })
    expect(mod('promo-banner').promo).toMatchObject({ title: 'Martes 2×1', price: 1500000, originalPrice: 3000000, days: [2] })
    expect(mod('price-list').sections).toEqual([expect.objectContaining({ name: 'Vinos', products: [expect.objectContaining({ name: 'Malbec Reserva', price: 1250000 }), expect.objectContaining({ name: 'Torrontés' })] })])
    expect(JSON.stringify(mod('price-list'))).not.toContain('image')
    expect(mod('qr-cta').config).toMatchObject({ headline: 'Pedí desde tu celular' })
    expect(t.brand).toMatchObject({ fontHeading: 'Roboto Slab', fontBody: 'Mi Fuente' })
    expect(t.brand.fontFiles.map((f: any) => f.url)).toEqual(['https://fonts.gstatic.com/s/robotoslab/v1/a.woff2', 'https://res.cloudinary.com/tgo/raw/upload/mi.woff2'])
    expect(m.items[0].assets).toEqual(expect.arrayContaining([t.brand.logo, ...t.brand.fontFiles.map((f: any) => f.url), mod('combo-highlight').combo.image]))
  })

  it('la composición es de una sede; config inválida → 400', async () => {
    expect((await post({ ...composition([{ type: 'brand-header', config: {} }]), locationId: null })).status).toBe(400)
    expect((await post(composition([]))).status).toBe(400)
    expect((await post(composition([{ type: 'product-grid', config: { productIds: [] } }]))).status).toBe(400)
  })

  it('ilustración: solo imágenes subidas a la carpeta de pantallas del comercio (y queda marcada como guardada)', async () => {
    const own = `https://res.cloudinary.com/tgoads/image/upload/v1/ads/t-${A._id}/screen/${'a'.repeat(18)}.png`
    const foreign = `https://res.cloudinary.com/tgoads/image/upload/v1/ads/t-${oid()}/screen/${'b'.repeat(18)}.png`
    expect((await post(composition([{ type: 'brand-header', config: {} }, { type: 'illustration-block', config: { imageUrl: 'https://otro.com/x.png' } }]))).status).toBe(400)
    expect((await post(composition([{ type: 'brand-header', config: {} }, { type: 'illustration-block', config: { imageUrl: foreign } }]))).status).toBe(400)
    expect((await post(composition([{ type: 'brand-header', config: {} }, { type: 'illustration-block', config: { imageUrl: own, text: 'Hecho a mano' } }]))).status).toBe(201)
    expect(vi.mocked(markSaved)).toHaveBeenCalledWith([own])
  })

  it('una config rota guardada en la base no tira el manifiesto: se saltea esa pieza', async () => {
    await AppStory.create({ title: 'Rota', surfaces: ['screen'], owner: { kind: 'tenant', tenantId: A._id, locationId: loc._id }, isActive: true, screenTemplate: { kind: 'composition', config: { modules: 'nada' } } })
    await post(composition([{ type: 'brand-header', config: {} }, { type: 'hero-product', config: { productId: String(ids.simple) } }]))
    const res = await getManifest()
    expect(res.status).toBe(200)
    expect((await res.json()).items).toHaveLength(1)
  })

  it('catálogo para el armador: productos (con foto o no), combos y promos de la sede', async () => {
    const r = await (await catalog(new NextRequest(`http://localhost/api/sc-a/screen-pieces/templates?locationId=${loc._id}&catalog=1`), p)).json()
    expect(r.products.find((x: any) => x.name === 'Malbec Reserva')).toMatchObject({ category: 'Vinos', hasPhoto: false })
    expect(r.products.find((x: any) => x.name === 'Doble Clásica')).toMatchObject({ hasPhoto: true })
    expect(r.combos.map((c: any) => c.name)).toEqual(['Combo Doble'])
    expect(r.promotions.map((c: any) => c.title)).toEqual(['Martes 2×1'])
  })
})

describe('armado (puro)', () => {
  it('sin contenido real no se manda; archivos sin repetir', () => {
    const cfg = compositionConfigSchema.parse({ modules: [{ type: 'hero-product', config: { productId: String(oid()) } }] })
    const b = buildCompositionBoard(menu.toObject(), A.toObject(), cfg, [], [], {})
    expect(compositionHasContent(b)).toBe(false)
    const cfg2 = compositionConfigSchema.parse({ modules: [{ type: 'product-grid', config: { productIds: [String(ids.doble), String(ids.doble)] } }] })
    const b2 = buildCompositionBoard(menu.toObject(), A.toObject(), cfg2, [], [], {})
    expect(compositionAssets(b2).filter((u) => u.includes('doble'))).toHaveLength(1)
    expect(parseCompositionConfig({ modules: 'x' })).toBeNull()
  })
  it('fuente de Google: toma el archivo del subconjunto latino', () => {
    const css = `/* cyrillic */\n@font-face { src: url(https://fonts.gstatic.com/s/inter/cyr.woff2) format('woff2'); }\n/* latin */\n@font-face { src: url(https://fonts.gstatic.com/s/inter/lat.woff2) format('woff2'); }`
    expect(fontUrlFromCss(css)).toBe('https://fonts.gstatic.com/s/inter/lat.woff2')
    expect(fontUrlFromCss('nada')).toBeNull()
  })
})
