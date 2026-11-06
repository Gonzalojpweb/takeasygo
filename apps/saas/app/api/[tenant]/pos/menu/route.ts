import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import Menu from '@/models/Menu'
import Combo from '@/models/Combo'
import { flattenMenuSnapshot, isComboAvailable, isComboOnSchedule, type RawMenu } from '@takeasygo/business'
import Location from '@/models/Location'
import { DEFAULT_TIMEZONE } from '@/lib/restaurant-time'
import type { Product } from '@takeasygo/types'
import { posRoute } from '@/lib/pos-online/route'

// ============================================================================
// GET /api/[tenant]/pos/menu — snapshot aplanado para el POS
// ============================================================================
// Mismo contrato que `GET /api/v1/menu/snapshot` de apps/sync, pero servido
// directo por el SaaS: el POS sale del camino de datos de Sync Layer.
//
// El aplanado NO está duplicado: vive en @takeasygo/business/menu-flatten y
// apps/sync importa esa misma función. Una regla de negocio, dos lectores.
//
// `signature` (sha256 del contenido) es lo que el POS compara en M5 antes de
// reescribir Dexie; `version` es un número cómodo para el humano y para
// `Order.menuVersion`.
// ============================================================================

export const GET = posRoute('catalog.read', async (ctx) => {
  const menus = (await Menu.find({
    tenantId: ctx.tenantId,
    locationId: ctx.locationId,
    isActive: true,
  })
    .lean()
    .exec()) as unknown as Array<RawMenu & { updatedAt?: Date | string }>

  const flat = flattenMenuSnapshot(menus)

  const combos = await Combo.find({
    tenantId: ctx.tenantId,
    $or: [{ locationId: null }, { locationId: ctx.locationId }, { locationId: { $exists: false } }],
    isActive: true,
  }).sort({ sortOrder: 1 }).lean()
  const location = combos.length
    ? await Location.findOne({ _id: ctx.locationId, tenantId: ctx.tenantId }).select('timezone').lean<{ timezone?: string }>()
    : null
  const timezone = location?.timezone || DEFAULT_TIMEZONE

  const productMap = new Map<string, Product>(flat.products.map(p => [p.id, p]))

  const comboProducts: Product[] = []
  let lastEdit = 0

  for (const menu of menus) {
    const t = new Date(menu.updatedAt ?? 0).getTime()
    if (Number.isFinite(t) && t > lastEdit) lastEdit = t
  }

  for (const combo of combos) {
    const isAvailable =
      isComboAvailable(combo as any, productMap) && isComboOnSchedule((combo as any).availabilitySchedule, new Date(), timezone)
    comboProducts.push({
      id: combo._id.toString(),
      tenantId: ctx.tenantId,
      name: combo.name,
      description: combo.description || '',
      price: combo.priceMode === 'fixed' ? (combo.fixedPrice || 0) : 0,
      category: 'Combos',
      isAvailable,
      unavailableReason: isAvailable ? undefined : 'manual',
      isCombo: true,
      comboId: combo._id.toString(),
      comboData: {
        id: combo._id.toString(),
        tenantId: ctx.tenantId,
        locationId: combo.locationId ? combo.locationId.toString() : null,
        name: combo.name,
        description: combo.description,
        priceMode: combo.priceMode,
        fixedPrice: combo.fixedPrice ?? undefined,
        itemPool: combo.itemPool,
        minItems: combo.minItems,
        maxItems: combo.maxItems,
        allowRepeat: combo.allowRepeat,
        chargeCustomizationExtras: combo.chargeCustomizationExtras,
        style: combo.style,
        isActive: combo.isActive,
        availabilitySchedule: combo.availabilitySchedule,
        sortOrder: combo.sortOrder,
        visibility: combo.visibility,
      },
    })
    const t = new Date((combo as any).updatedAt ?? 0).getTime()
    if (Number.isFinite(t) && t > lastEdit) lastEdit = t
  }

  const allProducts = [...flat.products, ...comboProducts]

  const signature = createHash('sha256')
    .update(JSON.stringify({ p: allProducts, c: flat.categories }))
    .digest('hex')

  return NextResponse.json({
    // Segundos desde la última edición del menú. 1 si todavía no hay menú:
    // así un catálogo recién creado no arranca en "época".
    version: lastEdit > 0 ? Math.floor(lastEdit / 1000) : 1,
    tenantId: ctx.tenantId,
    products: allProducts,
    categories: flat.categories,
    createdAt: new Date().toISOString(),
    signature,
    serverTime: new Date().toISOString(),
  })
})
