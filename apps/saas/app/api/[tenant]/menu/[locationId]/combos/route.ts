import { connectDB } from '@/lib/mongoose'
import Combo from '@/models/Combo'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { DEFAULT_TIMEZONE } from '@/lib/restaurant-time'
import { isComboAvailable, isComboOnSchedule } from '@takeasygo/business'

// ============================================================================
// GET /api/[tenant]/menu/[locationId]/combos?mode= — público: lo lee el menú
// ============================================================================
// Solo combos vendibles ahora. Disponibilidad calculada en la lectura: un producto
// pausado o sin stock pausa el combo entero. Solo datos que el menú ya muestra.
// ============================================================================

export async function GET(request: NextRequest, { params }: { params: Promise<{ tenant: string; locationId: string }> }) {
  try {
    const { tenant: tenantSlug, locationId } = await params
    await connectDB()
    if (!mongoose.isValidObjectId(locationId)) return NextResponse.json({ combos: [] })

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).select('_id')
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const mode = new URL(request.url).searchParams.get('mode') || 'takeaway'
    const visibility = mode === 'dine-in' ? 'dine-in' : 'takeaway'
    const takeawayLike = mode === 'takeaway' || mode === 'delivery'

    const rawCombos = await Combo.find({
      tenantId: tenant._id,
      isActive: true,
      $or: [{ locationId: null }, { locationId: { $exists: false } }, { locationId }],
      visibility: { $in: [visibility, 'both'] },
    })
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean()
    if (rawCombos.length === 0) return NextResponse.json({ combos: [] })

    const [menu, location] = await Promise.all([
      Menu.findOne({ tenantId: tenant._id, locationId, isActive: true }).lean(),
      Location.findOne({ _id: locationId, tenantId: tenant._id }).select('timezone').lean<{ timezone?: string }>(),
    ])
    const timezone = location?.timezone || DEFAULT_TIMEZONE

    const catalog = new Map<string, Record<string, any>>()
    const add = (item: any, category: any, sub: any) => {
      const id = item._id?.toString()
      if (!id) return
      const sellable = category.isAvailable !== false && item.isAvailable !== false && (!takeawayLike || item.isTakeawayAvailable !== false)
      catalog.set(id, {
        _id: id,
        name: item.name,
        description: item.description ?? '',
        imageUrl: item.imageUrl ?? null,
        price: item.price,
        takeawayPrice: item.takeawayPrice ?? null,
        businessPrice: item.businessPrice ?? null,
        variants: item.variants ?? [],
        categoryName: sub?.name ?? category.name,
        customizationGroups: [
          ...(category.customizationGroups ?? []),
          ...(sub?.customizationGroups ?? []),
          ...(item.customizationGroups ?? []),
        ],
        isAvailable: sellable,
        stockPortions: item.stockPortions,
      })
    }
    for (const category of (menu as any)?.categories ?? []) {
      for (const item of category.items ?? []) add(item, category, null)
      for (const sub of category.subcategories ?? []) for (const item of sub.items ?? []) add(item, category, sub)
    }

    const combos = rawCombos
      .filter((combo) => isComboOnSchedule((combo as any).availabilitySchedule, new Date(), timezone) && isComboAvailable(combo as any, catalog))
      .map((combo: any) => ({
        _id: String(combo._id),
        name: combo.name,
        description: combo.description ?? '',
        priceMode: combo.priceMode,
        fixedPrice: combo.fixedPrice ?? null,
        minItems: combo.minItems,
        maxItems: combo.maxItems,
        allowRepeat: combo.allowRepeat,
        chargeCustomizationExtras: combo.chargeCustomizationExtras,
        style: combo.style ?? {},
        items: combo.itemPool.map((id: string) => {
          const { isAvailable: _a, stockPortions: _s, ...item } = catalog.get(id)!
          return item
        }),
      }))
    return NextResponse.json({ combos })
  } catch (error) {
    console.error('[menu/combos]', error)
    return NextResponse.json({ error: 'No se pudieron cargar los combos' }, { status: 500 })
  }
}
