import { connectDB } from '@/lib/mongoose'
import Promotion from '@/models/Promotion'
import Menu from '@/models/Menu'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; locationId: string }> }
) {
  try {
    const { tenant: tenantSlug, locationId } = await params
    await connectDB()

    const TenantModel = (await import('@/models/Tenant')).default
    const tenant = await TenantModel.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const mode = searchParams.get('mode') || 'takeaway'

    const now = new Date()

    const scheduleFilters = [
      {
        $or: [
          { scheduledStart: null },
          { scheduledStart: { $exists: false } },
          { scheduledStart: { $lte: now } }
        ]
      },
      {
        $or: [
          { scheduledEnd: null },
          { scheduledEnd: { $exists: false } },
          { scheduledEnd: { $gte: now } }
        ]
      }
    ]

    const locationFilter = {
      $or: [
        { locationId: null },
        { locationId: { $exists: false } },
        { locationId }
      ]
    }

    const tenantPromos: any = {
      tenantId: tenant._id,
      isActive: true,
      ...locationFilter,
      $and: scheduleFilters,
    }

    const legacyPromos: any = {
      scope: { $exists: false },
      tenantId: tenant._id,
      isActive: true,
      ...locationFilter,
      $and: scheduleFilters,
    }

    const globalPromos: any = {
      scope: 'global',
      isActive: true,
      $or: [
        { targetTenants: tenant._id },
        { targetTenants: { $size: 0 } },
      ],
      $and: scheduleFilters,
    }

    const promotions = await Promotion.find({
      $or: [tenantPromos, legacyPromos, globalPromos],
    }).sort({ sortOrder: 1, createdAt: -1 }).lean()

    const menu = await Menu.findOne({ tenantId: tenant._id, locationId }).lean()
    const menuCats = (menu as any)?.categories ?? []

    function buildSlotItem(item: any, slot: any, cat: any, promoOverrideGroups: any[]) {
      const id = item._id?.toString?.() || item._id
      const variantFilter = (slot.itemVariantFilters ?? []).find(
        (vf: any) => (vf.itemId?.toString?.() || vf.itemId) === id
      )
      const allowedNames = variantFilter?.variantNames ?? []
      const variants = allowedNames.length > 0
        ? (item.variants ?? []).filter((v: any) => allowedNames.includes(v.name))
        : (item.variants ?? [])

      const allGroups = [
        ...(cat.customizationGroups ?? []),
        ...(item.customizationGroups ?? []),
        ...(slot.overrideCustomizationGroups ?? []),
        ...(promoOverrideGroups ?? []),
      ]

      // Separar requeridos (siempre) de opcionales (filtrados por whitelist)
      const requiredGroups = allGroups.filter((g: any) => g.required)
      const optionalGroups = allGroups.filter((g: any) => !g.required)
      const whitelistIds = (slot.allowedExtraGroupIds ?? []).map((id: any) => id?.toString?.() || id)
      const filteredOptional = whitelistIds.length > 0
        ? optionalGroups.filter((g: any) => whitelistIds.includes(g._id?.toString?.()))
        : optionalGroups

      return {
        _id: id,
        name: item.name,
        categoryName: cat.name,
        variants,
        customizationGroups: [...requiredGroups, ...filteredOptional],
      }
    }

    function resolveItemsForSlot(slot: any, promoOverrideGroups: any[]) {
      const resolved: any[] = []
      const seenItemIds = new Set<string>()

      if (Array.isArray(slot.itemIds) && slot.itemIds.length > 0) {
        for (const cat of menuCats) {
          for (const item of cat.items ?? []) {
            const itemId = item._id?.toString?.() || item._id
            if (slot.itemIds.some((id: any) => (id?.toString?.() || id) === itemId) && !seenItemIds.has(itemId)) {
              seenItemIds.add(itemId)
              resolved.push(buildSlotItem(item, slot, cat, promoOverrideGroups))
            }
          }
          for (const sub of cat.subcategories ?? []) {
            for (const item of sub.items ?? []) {
              const itemId = item._id?.toString?.() || item._id
              if (slot.itemIds.some((id: any) => (id?.toString?.() || id) === itemId) && !seenItemIds.has(itemId)) {
                seenItemIds.add(itemId)
                resolved.push(buildSlotItem(item, slot, cat, promoOverrideGroups))
              }
            }
          }
        }
      } else if (Array.isArray(slot.categoryIds) && slot.categoryIds.length > 0) {
        for (const cat of menuCats) {
          const catId = cat._id?.toString?.() || cat._id
          if (slot.categoryIds.some((id: any) => (id?.toString?.() || id) === catId)) {
            for (const item of cat.items ?? []) {
              const itemId = item._id?.toString?.() || item._id
              if (!seenItemIds.has(itemId)) {
                seenItemIds.add(itemId)
                resolved.push(buildSlotItem(item, slot, cat, promoOverrideGroups))
              }
            }
            for (const sub of cat.subcategories ?? []) {
              for (const item of sub.items ?? []) {
                const itemId = item._id?.toString?.() || item._id
                if (!seenItemIds.has(itemId)) {
                  seenItemIds.add(itemId)
                  resolved.push(buildSlotItem(item, slot, cat, promoOverrideGroups))
                }
              }
            }
          }
        }
      }

      return resolved
    }

    const promotionsWithSlots = promotions.map(p => {
      const promo: any = { ...p }

      if (p.type === 'sale' && Array.isArray(p.slots) && p.slots.length > 0) {
        const promoOverrideGroups = p.overrideCustomizationGroups ?? []
        promo.slots = p.slots.map((slot: any) => ({
          ...slot,
          resolvedItems: resolveItemsForSlot(slot, promoOverrideGroups),
        }))
      }

      return promo
    })

    const filteredPromotions = promotionsWithSlots.filter((p: any) => {
      const vis = p.visibility || 'both'
      if (vis === 'both') return true
      if (vis === mode) return true
      return false
    }).filter((p: any) => {
      if (!p.activeTimeStart || !p.activeTimeEnd) return true
      const currentMinutes = now.getHours() * 60 + now.getMinutes()
      const [startH, startM] = p.activeTimeStart.split(':').map(Number)
      const [endH, endM] = p.activeTimeEnd.split(':').map(Number)
      const startMinutes = startH * 60 + startM
      const endMinutes = endH * 60 + endM
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes
    })

    return NextResponse.json({ promotions: filteredPromotions })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
