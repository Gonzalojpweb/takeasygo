// ============================================================================
// Catálogo comercial — operaciones con base de datos (multi-rubro, etapa 1)
// ============================================================================
// · saveCatalogProduct: alta / edición conservando el _id de cada variante.
// · syncCatalogToLocations: proyecta el catálogo a la carta de cada sede.
// · ensureMerchandiseSkus: un insumo de mercadería por variante de producto
//   (los servicios no llevan stock), para que la venta descuente existencia.
// Todo filtrado por tenantId primero (aislamiento multi-tenant).
// ============================================================================

import mongoose from 'mongoose'
import CatalogProduct from '@/models/CatalogProduct'
import Menu from '@/models/Menu'
import Location from '@/models/Location'
import InventorySKU from '@/models/InventorySKU'
import { normalizeName } from '@takeasygo/business/inventory'
import { projectCatalogToMenu, variantLabel, type ProjectionProduct } from './projection'
import { CatalogInputError, type CatalogProductInput } from './validation'

export async function tenantLocationIds(tenantId: mongoose.Types.ObjectId): Promise<Set<string>> {
  const locs = await Location.find({ tenantId }).select('_id').lean<Array<{ _id: unknown }>>()
  return new Set(locs.map(l => String(l._id)))
}

function toDoc(input: CatalogProductInput, previous: { variants?: Array<{ _id: unknown }> } | null) {
  const prevIds = new Set((previous?.variants ?? []).map(v => String(v._id)))
  return {
    kind: input.kind,
    name: input.name,
    description: input.description,
    category: input.category,
    brand: input.brand,
    model: input.model,
    imageUrl: input.imageUrl,
    attributes: input.attributes,
    status: input.status,
    sortOrder: input.sortOrder,
    variants: input.variants.map(v => {
      // Una variante existente conserva su id; un id desconocido se ignora
      // (no se puede «adoptar» el id de otra variante o de otro producto).
      const keepId = v.id && prevIds.has(v.id) ? new mongoose.Types.ObjectId(v.id) : new mongoose.Types.ObjectId()
      return {
        _id: keepId,
        code: v.code,
        ...(v.barcode ? { barcode: v.barcode } : {}),
        name: v.name,
        options: v.options,
        listPrice: v.listPrice,
        offers: v.offers.map(o => ({ locationId: new mongoose.Types.ObjectId(o.locationId), price: o.price ?? null, available: o.available !== false })),
        isActive: v.isActive,
      }
    }),
  }
}

function duplicateKeyMessage(err: unknown): string | null {
  const e = err as { code?: number; keyPattern?: Record<string, unknown> }
  if (e?.code !== 11000) return null
  if (e.keyPattern && 'variants.barcode' in e.keyPattern) return 'Ese código de barras ya lo usa otro producto'
  return 'Ese código ya lo usa otro producto'
}

/** Crea (productId null) o actualiza un producto. Devuelve el documento guardado. */
export async function saveCatalogProduct(tenantId: mongoose.Types.ObjectId, productId: string | null, input: CatalogProductInput) {
  try {
    if (!productId) {
      return await CatalogProduct.create({ tenantId, ...toDoc(input, null) })
    }
    const existing = await CatalogProduct.findOne({ _id: productId, tenantId })
    if (!existing) return null
    const doc = toDoc(input, existing.toObject() as { variants?: Array<{ _id: unknown }> })
    existing.set(doc)
    await existing.save()
    return existing
  } catch (err) {
    const dup = duplicateKeyMessage(err)
    if (dup) throw new CatalogInputError(dup)
    throw err
  }
}

/**
 * Proyecta el catálogo activo a la carta de las sedes del comercio (todas o
 * las indicadas). Crea la carta de la sede si no existe. Devuelve cuántas
 * cartas se guardaron.
 */
export async function syncCatalogToLocations(tenantId: mongoose.Types.ObjectId, onlyLocationIds?: string[]): Promise<{ menus: number; items: number }> {
  const products = await CatalogProduct.find({ tenantId, status: 'active' }).lean<ProjectionProduct[]>()
  const locFilter: Record<string, unknown> = { tenantId }
  if (onlyLocationIds?.length) locFilter._id = { $in: onlyLocationIds }
  const locations = await Location.find(locFilter).select('_id').lean<Array<{ _id: mongoose.Types.ObjectId }>>()

  let menus = 0
  let items = 0
  for (const loc of locations) {
    const menu = await Menu.findOne({ tenantId, locationId: loc._id })
    const current = menu ? (menu.toObject().categories ?? []) : []
    const projected = projectCatalogToMenu(current, products, String(loc._id))
    items += projected.projectedItems
    if (!menu) {
      if (projected.projectedItems === 0) continue
      await Menu.create({ tenantId, locationId: loc._id, categories: projected.categories, isActive: true })
      menus++
      continue
    }
    if (!projected.changed) continue
    menu.set('categories', projected.categories)
    await menu.save()
    menus++
  }
  return { menus, items }
}

/**
 * Crea o renombra el insumo de mercadería de cada variante de un producto
 * (kind 'merchandise', unidad 'unit'). Idempotente: se busca por variante.
 * Los servicios no tienen existencia. No borra insumos: una variante quitada
 * conserva su historial de stock.
 */
export async function ensureMerchandiseSkus(
  tenantId: mongoose.Types.ObjectId,
  product: { _id: unknown; kind?: string; name: string; variants: Array<{ _id: unknown; code: string; name?: string; options?: Array<{ name: string; value: string }> }> },
): Promise<number> {
  if (product.kind === 'service') return 0
  let touched = 0
  for (const v of product.variants) {
    const variantId = String(v._id)
    const label = variantLabel(v as never)
    const name = `${product.name}${label && label !== v.code ? ` · ${label}` : ''} (${v.code})`.slice(0, 120)
    const nameKey = normalizeName(name)
    const existing = await InventorySKU.findOne({ tenantId, catalogVariantId: variantId }).select('_id name').lean<{ _id: mongoose.Types.ObjectId; name: string }>()
    if (existing) {
      if (existing.name !== name) {
        const clash = await InventorySKU.exists({ tenantId, nameKey, _id: { $ne: existing._id } })
        if (!clash) {
          await InventorySKU.updateOne({ _id: existing._id, tenantId }, { $set: { name, nameKey, catalogProductId: String(product._id) } })
          touched++
        }
      }
      continue
    }
    try {
      await InventorySKU.create({
        tenantId,
        name,
        nameKey,
        category: 'other',
        kind: 'merchandise',
        canonicalUnit: 'unit',
        businessImpact: 'medium',
        catalogVariantId: variantId,
        catalogProductId: String(product._id),
      })
      touched++
    } catch (err) {
      // Nombre ya usado por otro insumo, o carrera con otra edición: no se
      // bloquea el guardado del producto (el stock se puede vincular después).
      if ((err as { code?: number })?.code !== 11000) throw err
      console.warn(`[catalog] no se creó el insumo de la variante ${v.code}: nombre o variante ya usados`)
    }
  }
  return touched
}
