// ============================================================================
// display-studio.test.ts — Display Studio (plan apps/display/PLAN-STUDIO.md)
// ============================================================================
// · Catálogo y valores: validación por campo, defaults, vista previa tolerante.
// · Precio: USD → ARS redondeado; sin cotización no se cobra; última buena < 72 h.
// · Compra: aplicar pago aprobado/duplicado/monto corto/moneda/devuelto/ajeno,
//   comprobante numerado una sola vez.
// · Firma del webhook propio.
// · Guardar una Premium bloqueada → 402; el manifiesto la oculta hasta que se
//   desbloquea (y vuelve a ocultarla si se devuelve). Free se publica sin pago.
// · Fotos solo del comercio. Superficie 'studio' de subidas.
// Datos ficticios: nada de comercios reales.
// ============================================================================
import { describe, it, expect, beforeEach, vi } from 'vitest'
import crypto from 'node:crypto'
import { NextRequest } from 'next/server'
import mongoose from 'mongoose'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/rateLimit', () => ({ rateLimit: vi.fn().mockResolvedValue({ success: true }) }))
vi.mock('@/lib/display/fonts', async (orig) => ({ ...(await orig<typeof import('@/lib/display/fonts')>()), resolveGoogleFonts: vi.fn(async (fams: string[]) => Object.fromEntries(fams.map((f) => [f, `https://fonts.gstatic.com/s/${f.toLowerCase().replace(/ /g, '')}/v1/a.woff2`]))) }))
vi.mock('@/lib/media/ads', async (orig) => ({ ...(await orig<typeof import('@/lib/media/ads')>()), markSaved: vi.fn(async () => {}) }))
vi.mock('@/lib/email', async (orig) => ({ ...(await orig<typeof import('@/lib/email')>()), sendEmail: vi.fn(async () => {}) }))

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import AppStory from '@/models/AppStory'
import DisplayDevice from '@/models/DisplayDevice'
import DisplayTemplatePurchase, { DisplayStudioState, formatReceipt } from '@/models/DisplayTemplatePurchase'
import { POST as createTemplate } from '@/app/api/[tenant]/screen-pieces/templates/route'
import { GET as manifest } from '@/app/api/display/manifest/route'
import { POST as preview } from '@/app/api/[tenant]/screen-pieces/preview/route'
import { GET as library } from '@/app/api/[tenant]/display-studio/route'
import { GET as purchases } from '@/app/api/[tenant]/display-studio/purchases/route'
import { auth } from '@/lib/auth'
import { generateDisplayToken, hashDisplayToken } from '@/lib/display/auth'
import { STUDIO_TEMPLATES, parseStudioConfig, studioDefaults, studioPreviewValues, studioTemplate, studioConfigSchema } from '@/lib/display/studio/catalog'
import { applyTemplatePayment, priceArsCents, usdArsRate } from '@/lib/display/studio/purchase'
import { validMpSignature } from '@/lib/display/studio/webhook-signature'
import { checkMedia, cropWarning } from '@/lib/media/spec'

const oid = () => new mongoose.Types.ObjectId()
let A: any, loc: any, token: string
/** public_id real: 18 hex al azar dentro de la carpeta del comercio. */
const own = (n: string, surface = 'studio') => `https://res.cloudinary.com/tgoads/image/upload/v1/ads/t-${A._id}/${surface}/${crypto.createHash('md5').update(n).digest('hex').slice(0, 18)}.png`

beforeEach(async () => {
  vi.clearAllMocks()
  delete process.env.DISPLAY_STUDIO_USD_ARS
  delete process.env.DISPLAY_STUDIO_ENABLED
  Object.assign(process.env, { CLOUDINARY_ADS_CLOUD_NAME: 'tgoads', CLOUDINARY_ADS_API_KEY: '123456789012345', CLOUDINARY_ADS_API_SECRET: 'secreto-de-prueba-27-chars!', CLOUDINARY_ADS_FOLDER_ROOT: 'ads' })
  A = await Tenant.create({ slug: 'ds-a', name: 'Cafetería Demo', isActive: true, status: 'active', plan: 'high', branding: { primaryColor: '#3366CC' } })
  loc = await Location.create({ tenantId: A._id, slug: 'a1', name: 'A1', address: 'x', isActive: true })
  token = generateDisplayToken()
  await DisplayDevice.create({ status: 'active', tenantId: A._id, locationId: loc._id, name: 'Tótem', orientation: 'portrait', tokenHash: hashDisplayToken(token) })
  vi.mocked(auth).mockResolvedValue({ user: { id: 'u1', role: 'admin', tenantId: String(A._id), assignedLocations: [] }, expires: '' } as any)
})

const p = { params: Promise.resolve({ tenant: 'ds-a' }) }
const post = (body: unknown) => createTemplate(new NextRequest('http://localhost/api/ds-a/screen-pieces/templates', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), p)
const getManifest = () => manifest(new NextRequest('http://localhost/api/display/manifest', { headers: { authorization: `Bearer ${token}` } }))
const studio = (templateId: string, values: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  title: 'Pieza Studio', locationId: String(loc._id), isActive: true,
  template: { kind: 'studio', config: { templateId, orientation: 'portrait', designWidth: 1080, designHeight: 1920, viewing: 'near', pageSeconds: 12, values, ...extra } },
})

describe('catálogo y valores', () => {
  it('3 plantillas: 1 Free y 2 Premium de USD 10, en vertical y horizontal', () => {
    expect(STUDIO_TEMPLATES.map((t) => [t.id, t.tier, t.priceUsd])).toEqual([['golden-bites', 'free', null], ['cheese-burger', 'premium', 10], ['chocolate-croissant', 'premium', 10]])
    for (const t of STUDIO_TEMPLATES) expect(t.orientations).toEqual(['portrait', 'landscape'])
  })

  it('valida por campo: obligatorios, largo, color, fuente; descarta lo que no es un campo', () => {
    const t = studioTemplate('golden-bites')!
    const base = { ...studioDefaults(t), image: own('foto') }
    expect(parseStudioConfig({ templateId: t.id, values: base })?.values).toMatchObject({ title1: 'Golden', imageCutout: false })
    expect(parseStudioConfig({ templateId: t.id, values: { ...base, image: '' } })).toBeNull()
    expect(parseStudioConfig({ templateId: t.id, values: { ...base, title1: 'x'.repeat(40) } })).toBeNull()
    expect(parseStudioConfig({ templateId: t.id, values: { ...base, accent: 'rojo' } })).toBeNull()
    expect(parseStudioConfig({ templateId: t.id, values: { ...base, font: 'Comic Sans' } })).toBeNull()
    expect(parseStudioConfig({ templateId: t.id, values: { ...base, intruso: '<script>' } })?.values).not.toHaveProperty('intruso')
    // Orientación y tamaño tienen que coincidir.
    expect(studioConfigSchema.safeParse({ templateId: t.id, orientation: 'portrait', designWidth: 1920, designHeight: 1080, values: base }).success).toBe(false)
  })

  it('vista previa tolerante: lo inválido o vacío cae al valor por defecto, nunca falla', () => {
    const t = studioTemplate('cheese-burger')!
    const v = studioPreviewValues(t, { word1: '', background: 'no-es-color', price: 'abc', showMini: false })
    expect(v).toMatchObject({ word1: '', background: '#ff7a00', price: null, showMini: false, image: '' })
  })
})

describe('precio en pesos', () => {
  it('USD 10 al cambio del día, redondeado hacia arriba a la centena (centavos)', () => {
    expect(priceArsCents(10, 1234.5)).toBe(1240000)
    expect(priceArsCents(10, 1000)).toBe(1000000)
  })

  it('dólar automático; si falla, la última buena (< 72 h); si no hay ninguna, no se cobra', async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify({ venta: 1450 }), { status: 200 })) as unknown as typeof fetch
    const down = vi.fn(async () => { throw new Error('sin red') }) as unknown as typeof fetch
    await DisplayStudioState.deleteMany({})
    expect(await usdArsRate(down, Date.now() + 10 * 3600_000)).toBeNull()
    expect(await usdArsRate(ok, Date.now() + 20 * 3600_000)).toBe(1450)
    expect(await usdArsRate(down, Date.now() + 40 * 3600_000)).toBe(1450)
    expect(await usdArsRate(down, Date.now() + 120 * 3600_000)).toBeNull()
    const absurd = vi.fn(async () => new Response(JSON.stringify({ venta: 3 }), { status: 200 })) as unknown as typeof fetch
    await DisplayStudioState.deleteMany({})
    expect(await usdArsRate(absurd, Date.now() + 200 * 3600_000)).toBeNull()
  })
})

describe('compra con Mercado Pago (cobro nuevo, aparte)', () => {
  const pending = (amountArs = 1450000) => DisplayTemplatePurchase.create({ tenantId: A._id, templateId: 'cheese-burger', status: 'pending', source: 'mercadopago', amountArs, amountUsd: 10, rate: 1450 })
  const pay = (id: unknown, extra: Record<string, unknown> = {}) => ({ status: 'approved', external_reference: `display-template:${id}`, transaction_amount: 14500, currency_id: 'ARS', ...extra })

  it('aprobado → desbloquea con comprobante numerado; repetido no duplica', async () => {
    const pr = await pending()
    expect(await applyTemplatePayment('111', pay(pr._id))).toMatchObject({ status: 'approved' })
    const row = await DisplayTemplatePurchase.findById(pr._id).lean()
    expect(row).toMatchObject({ status: 'approved', mpPaymentId: '111' })
    expect(formatReceipt(row!.receiptNumber)).toMatch(/^DS-\d{6}$/)
    expect(await applyTemplatePayment('111', pay(pr._id))).toMatchObject({ status: 'already' })
    expect((await DisplayTemplatePurchase.findById(pr._id).lean())!.receiptNumber).toBe(row!.receiptNumber)
  })

  it('monto corto, otra moneda o no aprobado → no desbloquea', async () => {
    const pr = await pending()
    expect((await applyTemplatePayment('1', pay(pr._id, { transaction_amount: 100 }))).status).toBe('amount_mismatch')
    expect((await applyTemplatePayment('2', pay(pr._id, { currency_id: 'USD' }))).status).toBe('amount_mismatch')
    expect((await applyTemplatePayment('3', pay(pr._id, { status: 'pending' }))).status).toBe('not_approved')
    expect((await DisplayTemplatePurchase.findById(pr._id).lean())!.status).toBe('pending')
  })

  it('referencias ajenas (comisiones u otras) se ignoran: no toca nada de comisiones', async () => {
    expect((await applyTemplatePayment('9', pay('x', { external_reference: 'commission-intent:abc' }))).status).toBe('ignored')
    expect((await applyTemplatePayment('9', pay('x', { external_reference: `commission:${A._id}:2026-01-01:2026-01-07` }))).status).toBe('ignored')
    expect((await applyTemplatePayment('9', pay(oid()))).status).toBe('not_found')
  })

  it('devolución o contracargo del mismo pago → vuelve a bloquearse', async () => {
    const pr = await pending()
    await applyTemplatePayment('222', pay(pr._id))
    expect((await applyTemplatePayment('222', pay(pr._id, { status: 'refunded' }))).status).toBe('refunded')
    expect((await DisplayTemplatePurchase.findById(pr._id).lean())!.status).toBe('refunded')
  })

  it('firma del webhook: válida pasa, inválida o ausente no', () => {
    const secret = 'secreto-webhook'
    const ts = '1700000000'
    const v1 = crypto.createHmac('sha256', secret).update(`id:555;request-id:req-1;ts:${ts};`).digest('hex')
    expect(validMpSignature(`ts=${ts},v1=${v1}`, 'req-1', '555', secret)).toBe(true)
    expect(validMpSignature(`ts=${ts},v1=${v1}`, 'req-1', '556', secret)).toBe(false)
    expect(validMpSignature(null, 'req-1', '555', secret)).toBe(false)
    expect(validMpSignature(`ts=${ts},v1=zz`, 'req-1', '555', secret)).toBe(false)
  })
})

describe('publicación y manifiesto', () => {
  const cheese = () => studio('cheese-burger', { ...studioDefaults(studioTemplate('cheese-burger')!), image: own('burger'), imageCutout: true })

  it('Free se publica sin pago y el manifiesto la manda con fotos y fuentes como archivos a guardar', async () => {
    const res = await post(studio('golden-bites', { ...studioDefaults(studioTemplate('golden-bites')!), image: own('burger'), imageCutout: true }))
    expect(res.status).toBe(201)
    const m = await (await getManifest()).json()
    expect(m.items).toHaveLength(1)
    const t = m.items[0].template
    expect(t).toMatchObject({ kind: 'studio', templateId: 'golden-bites', tier: 'free', orientation: 'portrait', pageMs: 12000 })
    expect(t.values.imageCutout).toBe(true)
    expect(t.fontFiles).toEqual([{ family: 'Archivo Black', url: 'https://fonts.gstatic.com/s/archivoblack/v1/a.woff2' }])
    expect(m.items[0].assets).toEqual(expect.arrayContaining([t.values.image, t.fontFiles[0].url]))
  })

  it('Premium sin desbloquear → 402 al guardar; desbloqueada se publica; devuelta deja de mostrarse', async () => {
    const r1 = await post(cheese())
    expect(r1.status).toBe(402)
    expect((await r1.json()).code).toBe('template_locked')
    await DisplayTemplatePurchase.create({ tenantId: A._id, templateId: 'cheese-burger', status: 'approved', source: 'manual' })
    expect((await post(cheese())).status).toBe(201)
    expect((await (await getManifest()).json()).items).toHaveLength(1)
    await DisplayTemplatePurchase.updateOne({ tenantId: A._id, templateId: 'cheese-burger' }, { $set: { status: 'refunded' } })
    expect((await (await getManifest()).json()).items).toHaveLength(0)
  })

  it('el desbloqueo es por comercio: otra marca no lo hereda', async () => {
    const B = await Tenant.create({ slug: 'ds-b', name: 'Otra Marca Demo', isActive: true, status: 'active', plan: 'high' })
    await DisplayTemplatePurchase.create({ tenantId: B._id, templateId: 'cheese-burger', status: 'approved', source: 'manual' })
    expect((await post(cheese())).status).toBe(402)
  })

  it('fotos: solo subidas por el comercio (studio o pantalla); de otro comercio o de afuera → 400', async () => {
    const base = studioDefaults(studioTemplate('golden-bites')!)
    expect((await post(studio('golden-bites', { ...base, image: 'https://otro.com/x.png' }))).status).toBe(400)
    expect((await post(studio('golden-bites', { ...base, image: `https://res.cloudinary.com/tgoads/image/upload/v1/ads/t-${oid()}/studio/${'b'.repeat(18)}.png` }))).status).toBe(400)
    expect((await post(studio('golden-bites', { ...base, image: own('pantalla', 'screen') }))).status).toBe(201)
  })

  it('otra orientación que la pantalla → no se manda; config rota en la base no tira el manifiesto', async () => {
    await post(studio('golden-bites', { ...studioDefaults(studioTemplate('golden-bites')!), image: own('x') }, { orientation: 'landscape', designWidth: 1920, designHeight: 1080 }))
    await AppStory.create({ title: 'Rota', surfaces: ['screen'], owner: { kind: 'tenant', tenantId: A._id, locationId: loc._id }, isActive: true, screenTemplate: { kind: 'studio', config: { templateId: 'no-existe' } } })
    const res = await getManifest()
    expect(res.status).toBe(200)
    expect((await res.json()).items).toHaveLength(0)
  })

  it('interruptor DISPLAY_STUDIO_ENABLED=0: biblioteca 404 y piezas ocultas', async () => {
    await post(studio('golden-bites', { ...studioDefaults(studioTemplate('golden-bites')!), image: own('x') }))
    process.env.DISPLAY_STUDIO_ENABLED = '0'
    expect((await library(new NextRequest('http://localhost/api/ds-a/display-studio'), p)).status).toBe(404)
    expect((await (await getManifest()).json()).items).toHaveLength(0)
  })

  it('vista previa: Premium sin desbloquear y a medio completar igual se ve', async () => {
    const res = await preview(new NextRequest('http://localhost/api/ds-a/screen-pieces/preview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ locationId: String(loc._id), template: { kind: 'studio', config: { templateId: 'chocolate-croissant', orientation: 'landscape', designWidth: 1920, designHeight: 1080, values: { word1: 'Medialuna' } } } }) }), p)
    expect(res.status).toBe(200)
    const d = await res.json()
    expect(d.template).toMatchObject({ kind: 'studio', templateId: 'chocolate-croissant', values: { word1: 'Medialuna', word2: 'Croissant' } })
  })

  it('biblioteca y «Mis compras»', async () => {
    process.env.DISPLAY_STUDIO_USD_ARS = '1500'
    const lib = await (await library(new NextRequest('http://localhost/api/ds-a/display-studio'), p)).json()
    expect(lib.templates.map((t: any) => [t.id, t.unlocked, t.priceArs])).toEqual([['golden-bites', true, null], ['cheese-burger', false, 15000], ['chocolate-croissant', false, 15000]])
    expect(lib.bgRemoval).toBe('free')
    const pr = await DisplayTemplatePurchase.create({ tenantId: A._id, templateId: 'chocolate-croissant', status: 'pending', source: 'mercadopago', amountArs: 1500000, amountUsd: 10, rate: 1500 })
    await applyTemplatePayment('333', { status: 'approved', external_reference: `display-template:${pr._id}`, transaction_amount: 15000, currency_id: 'ARS' })
    const list = await (await purchases(new NextRequest('http://localhost/api/ds-a/display-studio/purchases'), p)).json()
    expect(list.purchases).toEqual([expect.objectContaining({ templateName: 'Chocolate Croissant', amountArs: 15000, receipt: expect.stringMatching(/^DS-/) })])
  })
})

describe('subidas de Studio', () => {
  it('acepta recortes chicos y cuadrados (mín. 400 px) sin aviso de recorte', () => {
    expect(checkMedia('studio', { kind: 'image', format: 'png', bytes: 200_000, width: 600, height: 600 })).toBeNull()
    expect(checkMedia('studio', { kind: 'image', format: 'png', bytes: 200_000, width: 300, height: 600 })).toMatch(/al menos 400/)
    expect(cropWarning('studio', 600, 900)).toBeNull()
    expect(checkMedia('studio', { kind: 'video', format: 'mp4', bytes: 1, width: 1080, height: 1920, duration: 10 })).toMatch(/solo acepta imágenes/)
  })
})
