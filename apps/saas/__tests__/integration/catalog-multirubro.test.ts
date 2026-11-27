// ============================================================================
// catalog-multirubro.test.ts — etapa 1 multi-rubro de punta a punta
// ============================================================================
// Tienda de tecnología: alta de producto con variantes → carta de la sede →
// insumo de mercadería por variante → venta descuenta stock directo (sin
// receta) → cancelación devuelve. Más permisos, aislamiento y códigos únicos.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import CatalogProduct from '@/models/CatalogProduct'
import InventorySKU from '@/models/InventorySKU'
import InventoryState from '@/models/InventoryState'
import { auth } from '@/lib/auth'
import { syncOrderConsumption } from '@/lib/inventory/sales'
import { GET as listGet, POST as productPost } from '@/app/api/[tenant]/catalog/products/route'
import { GET as productGet, PUT as productPut, DELETE as productDelete } from '@/app/api/[tenant]/catalog/products/[productId]/route'
import { POST as setupPost } from '@/app/api/[tenant]/inventory/setup/route'
import { POST as countsPost } from '@/app/api/[tenant]/inventory/counts/route'
import { PUT as menuItemPut } from '@/app/api/[tenant]/menu/categories/[categoryId]/items/route'
import { DELETE as menuItemDelete } from '@/app/api/[tenant]/menu/categories/[categoryId]/items/[itemId]/route'

const SLUG = 'tecno-shop'
let tenant: any
let loc: any
const ADMIN_ID = 'admin-1'

function as(user: Record<string, unknown>, t = tenant) {
  vi.mocked(auth).mockResolvedValue({ user: { tenantId: t._id.toString(), assignedLocations: [], ...user }, expires: '' } as any)
}
const req = (method: string, path: string, body?: unknown, slug = SLUG) =>
  new NextRequest(`http://localhost/api/${slug}/${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
const P = (slug = SLUG) => ({ params: Promise.resolve({ tenant: slug }) })
const PP = (productId: string, slug = SLUG) => ({ params: Promise.resolve({ tenant: slug, productId }) })

const funda = () => ({
  name: 'Funda de silicona',
  category: 'Fundas',
  brand: 'Acme',
  variants: [
    { code: 'FUN-NEG', barcode: '7790000000011', name: 'Negra · iPhone 15', options: [{ name: 'Color', value: 'Negro' }], listPrice: 1_500_000 },
    { code: 'FUN-ROJ', name: 'Roja · iPhone 15', listPrice: 1_600_000 },
  ],
})

async function menuItems() {
  const menu = await Menu.findOne({ tenantId: tenant._id, locationId: loc._id }).lean() as any
  return (menu?.categories ?? []).flatMap((c: any) => c.items ?? [])
}

beforeEach(async () => {
  vi.clearAllMocks()
  await CatalogProduct.init()
  await InventorySKU.init()
  tenant = await Tenant.create({ slug: SLUG, name: 'Tecno', isActive: true, status: 'active', plan: 'full', vertical: 'tecnologia', storefrontTemplate: 'tecnologia' })
  loc = await Location.create({ tenantId: tenant._id, slug: 'centro', name: 'Centro', address: 'X', isActive: true })
  as({ id: ADMIN_ID, role: 'admin' })
})

describe('catálogo comercial', () => {
  it('alta: guarda el producto, lo publica en la carta de la sede y crea un insumo por variante', async () => {
    const res = await productPost(req('POST', 'catalog/products', funda()), P())
    expect(res.status).toBe(201)
    const { product } = await res.json()
    expect(product.variants).toHaveLength(2)

    const items = await menuItems()
    expect(items).toHaveLength(1)
    expect(items[0].catalogLink.productId).toBe(product._id)
    expect(items[0].variants.map((v: any) => v.variantId)).toEqual(product.variants.map((v: any) => v._id))

    const skus = await InventorySKU.find({ tenantId: tenant._id, kind: 'merchandise' }).lean()
    expect(skus.map(s => s.catalogVariantId).sort()).toEqual(product.variants.map((v: any) => v._id).sort())
    expect(skus.every(s => s.canonicalUnit === 'unit')).toBe(true)

    const list = await (await listGet(req('GET', 'catalog/products'), P())).json()
    expect(list.products).toHaveLength(1)
  })

  it('edición: cada variante conserva su id; un id ajeno no se adopta', async () => {
    const { product } = await (await productPost(req('POST', 'catalog/products', funda()), P())).json()
    const [negra, roja] = product.variants
    const foreignId = new mongoose.Types.ObjectId().toString()
    const body = {
      ...funda(),
      name: 'Funda premium',
      variants: [
        { id: negra._id, code: 'FUN-NEG', name: 'Negra', listPrice: 1_700_000 },
        { id: roja._id, code: 'FUN-ROJ', name: 'Roja', listPrice: 1_600_000 },
        { id: foreignId, code: 'FUN-AZU', name: 'Azul', listPrice: 1_600_000 },
      ],
    }
    const res = await productPut(req('PUT', `catalog/products/${product._id}`, body), PP(product._id))
    expect(res.status).toBe(200)
    const saved = (await res.json()).product
    expect(saved.variants[0]._id).toBe(negra._id)
    expect(saved.variants[1]._id).toBe(roja._id)
    expect(saved.variants[2]._id).not.toBe(foreignId)

    const items = await menuItems()
    expect(items[0].name).toBe('Funda premium')
    expect(items[0].variants.find((v: any) => v.variantId === negra._id).price).toBe(1_700_000)
  })

  it('códigos únicos en la marca y archivar quita el producto de la carta', async () => {
    const { product } = await (await productPost(req('POST', 'catalog/products', funda()), P())).json()
    const dup = await productPost(req('POST', 'catalog/products', { name: 'Otra', variants: [{ code: 'fun-neg', listPrice: 1 }] }), P())
    expect(dup.status).toBe(400)
    expect((await dup.json()).error).toMatch(/código/)

    const del = await productDelete(req('DELETE', `catalog/products/${product._id}`), PP(product._id))
    expect(del.status).toBe(200)
    expect(await menuItems()).toHaveLength(0)
    expect((await CatalogProduct.findById(product._id).lean() as any).status).toBe('archived')
  })

  it('permisos y aislamiento: cajero no entra, otro comercio no ve el producto, restaurante sin módulo → 403', async () => {
    const { product } = await (await productPost(req('POST', 'catalog/products', funda()), P())).json()

    as({ id: 'caj-1', role: 'cashier' })
    expect((await listGet(req('GET', 'catalog/products'), P())).status).toBe(403)

    // Encargado limitado a una sede: ve, pero no edita el catálogo de la marca.
    as({ id: 'enc-1', role: 'manager', assignedLocations: [loc._id.toString()] })
    expect((await productPost(req('POST', 'catalog/products', { name: 'X', variants: [{ code: 'X1', listPrice: 1 }] }), P())).status).toBe(403)

    const other = await Tenant.create({ slug: 'resto', name: 'Resto', isActive: true, status: 'active', plan: 'full' })
    as({ id: 'admin-2', role: 'admin' }, other)
    // El producto de la tienda no existe para el restaurante (y el restaurante no tiene el módulo).
    expect((await productGet(req('GET', `catalog/products/${product._id}`, undefined, 'resto'), PP(product._id, 'resto'))).status).toBe(403)
    // Con el módulo prendido sigue sin ver productos ajenos.
    await Tenant.updateOne({ _id: other._id }, { $set: { flags: { 'multirubro.catalog': true } } })
    expect((await productGet(req('GET', `catalog/products/${product._id}`, undefined, 'resto'), PP(product._id, 'resto'))).status).toBe(404)
  })
})

describe('inventario de mercadería (sin receta)', () => {
  it('la venta descuenta la variante vendida; la cancelación la devuelve; sirve también sin id en la línea', async () => {
    const setup = await (await setupPost(req('POST', 'inventory/setup', { locationId: loc._id.toString(), skus: [] }), P())).json()
    const storageId = setup.storageLocationId
    const { product } = await (await productPost(req('POST', 'catalog/products', funda()), P())).json()
    const [negra, roja] = product.variants
    const skuNegra = await InventorySKU.findOne({ tenantId: tenant._id, catalogVariantId: negra._id }).lean() as any
    const skuRoja = await InventorySKU.findOne({ tenantId: tenant._id, catalogVariantId: roja._id }).lean() as any

    for (const sku of [skuNegra, skuRoja]) {
      const c = await countsPost(req('POST', 'inventory/counts', { skuId: String(sku._id), storageLocationId: storageId, observedQuantity: 10, unit: 'unit', observationMethod: 'visual_count' }), P())
      expect([200, 201]).toContain(c.status)
    }
    const stock = async (sku: any) => ((await InventoryState.findOne({ skuId: sku._id, storageLocationId: storageId }).lean()) as any).mu

    const item = (await menuItems())[0]
    const order = {
      _id: new mongoose.Types.ObjectId(),
      tenantId: tenant._id,
      locationId: loc._id,
      orderNumber: 'T-1',
      status: 'confirmed',
      statusTimestamps: { confirmedAt: new Date() },
      items: [
        // Checkout: la línea trae la variante del catálogo.
        { _id: new mongoose.Types.ObjectId(), menuItemId: item._id, name: 'Funda', quantity: 2, catalogVariantId: negra._id, selectedVariant: { name: 'Negra · iPhone 15', variantId: negra._id } },
        // Sin id (POS / pedido viejo): se resuelve por la carta y el nombre de la variante.
        { _id: new mongoose.Types.ObjectId(), menuItemId: item._id, name: 'Funda', quantity: 1, selectedVariant: { name: 'Roja · iPhone 15' } },
        // POS (venta vieja o sin conexión): la variante viene como opción «Variante: …».
        { _id: new mongoose.Types.ObjectId(), menuItemId: item._id, name: 'Funda', quantity: 1, customizations: [{ groupName: 'Modificadores', selectedOptions: [{ name: 'Variante: Negra · iPhone 15' }] }] },
      ],
    }
    const r = await syncOrderConsumption(order)
    expect(r.events).toBe(3)
    expect(r.unmappedLines).toBe(0)
    expect(await stock(skuNegra)).toBeCloseTo(7, 6)
    expect(await stock(skuRoja)).toBeCloseTo(9, 6)

    // Reintento idempotente: no descuenta dos veces.
    expect((await syncOrderConsumption(order)).events).toBe(0)

    await syncOrderConsumption({ ...order, status: 'cancelled' })
    expect(await stock(skuNegra)).toBeCloseTo(10, 6)
    expect(await stock(skuRoja)).toBeCloseTo(10, 6)
  })
})

describe('editor de la carta con productos del catálogo (etapa 2)', () => {
  it('se puede pausar (y la pausa sobrevive a republicar), pero no cambiar el precio ni borrarlo', async () => {
    const { product } = await (await productPost(req('POST', 'catalog/products', funda()), P())).json()
    const menu = await Menu.findOne({ tenantId: tenant._id, locationId: loc._id }).lean() as any
    const cat = menu.categories.find((c: any) => c.catalogCategory)
    const item = cat.items[0]
    const CP = { params: Promise.resolve({ tenant: SLUG, categoryId: String(cat._id) }) }

    const priceRes = await menuItemPut(req('PUT', `menu/categories/${cat._id}/items`, { locationId: String(loc._id), itemId: String(item._id), price: 1 }), CP)
    expect(priceRes.status).toBe(409)
    expect((await priceRes.json()).code).toBe('CATALOG_ITEM')

    const pauseRes = await menuItemPut(req('PUT', `menu/categories/${cat._id}/items`, { locationId: String(loc._id), itemId: String(item._id), isAvailable: false }), CP)
    expect(pauseRes.status).toBe(200)

    const delRes = await menuItemDelete(
      req('DELETE', `menu/categories/${cat._id}/items/${item._id}?locationId=${loc._id}`),
      { params: Promise.resolve({ tenant: SLUG, categoryId: String(cat._id), itemId: String(item._id) }) },
    )
    expect(delRes.status).toBe(409)

    // Editar el producto en Catálogo republica la carta: la pausa manual se respeta.
    const body = { ...funda(), name: 'Funda nueva', variants: product.variants.map((v: any) => ({ id: v._id, code: v.code, listPrice: v.listPrice })) }
    expect((await productPut(req('PUT', `catalog/products/${product._id}`, body), PP(product._id))).status).toBe(200)
    const after = (await menuItems())[0]
    expect(after.name).toBe('Funda nueva')
    expect(after.isAvailable).toBe(false)
    expect(after.pausedReason).toBe('manual')
    expect(String(after._id)).toBe(String(item._id))
  })
})
