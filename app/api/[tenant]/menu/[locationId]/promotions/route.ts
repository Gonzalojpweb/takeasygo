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

    const query: any = {
      tenantId: tenant._id,
      isActive: true,
      $or: [
        { locationId: null },
        { locationId }
      ],
      $and: [
        {
          $or: [
            { scheduledStart: null },
            { scheduledStart: { $lte: now } }
          ]
        },
        {
          $or: [
            { scheduledEnd: null },
            { scheduledEnd: { $gte: now } }
          ]
        }
      ]
    }

    const promotions = await Promotion.find(query).sort({ sortOrder: 1, createdAt: -1 }).lean()

    const menu = await Menu.findOne({ tenantId: tenant._id, locationId }).lean()
    const menuCats = (menu as any)?.categories ?? []

    const promotionsWithLinked = promotions.map(p => {
      const promo: any = { ...p }

      // Build linkedItems from linkedCategoryIds + linkedItemIds + deprecated linkedMenuItemId
      const linkedItems: any[] = []
      const seenItemIds = new Set<string>()

      // Helper to add an item with merged customization groups
      function addItem(item: any, catCustomGroups: any[], catName: string) {
        const id = item._id?.toString?.() || item._id
        if (seenItemIds.has(id)) return
        seenItemIds.add(id)
        linkedItems.push({
          _id: id,
          name: item.name,
          categoryName: catName,
          variants: item.variants ?? [],
          customizationGroups: [
            ...(catCustomGroups ?? []),
            ...(item.customizationGroups ?? []),
            ...(promo.overrideCustomizationGroups ?? []),
          ],
        })
      }

      // 1) Items from linked categories
      if (Array.isArray(promo.linkedCategoryIds) && promo.linkedCategoryIds.length > 0) {
        for (const cat of menuCats) {
          const catId = cat._id?.toString?.() || cat._id
          if (promo.linkedCategoryIds.some((id: any) => (id?.toString?.() || id) === catId)) {
            for (const item of cat.items ?? []) {
              addItem(item, cat.customizationGroups ?? [], cat.name)
            }
          }
        }
      }

      // 2) Specific linked items
      if (Array.isArray(promo.linkedItemIds) && promo.linkedItemIds.length > 0) {
        for (const cat of menuCats) {
          for (const item of cat.items ?? []) {
            const itemId = item._id?.toString?.() || item._id
            if (promo.linkedItemIds.some((id: any) => (id?.toString?.() || id) === itemId)) {
              addItem(item, cat.customizationGroups ?? [], cat.name)
            }
          }
        }
      }

      // 3) Backward compat: deprecated linkedMenuItemId
      if (promo.linkedMenuItemId && !linkedItems.length) {
        const oldId = promo.linkedMenuItemId?.toString?.() || promo.linkedMenuItemId
        for (const cat of menuCats) {
          const item = (cat.items ?? []).find(
            (i: any) => (i._id?.toString?.() || i._id) === oldId
          )
          if (item) {
            // Use original snapshot + override groups, or live data
            const snapshot = promo.linkedItemSnapshot
            addItem(
              {
                _id: item._id,
                name: snapshot?.name || item.name,
                variants: snapshot?.variants ?? item.variants ?? [],
                customizationGroups: [
                  ...(cat.customizationGroups ?? []),
                  ...(snapshot?.customizationGroups ?? item.customizationGroups ?? []),
                  ...(promo.overrideCustomizationGroups ?? []),
                ],
              },
              [],
              cat.name
            )
            break
          }
        }
      }

      promo.linkedItems = linkedItems
      return promo
    })

    const filteredPromotions = promotionsWithLinked.filter((p: any) => {
      if (p.visibility === 'both') return true
      if (p.visibility === mode) return true
      return false
    })

    return NextResponse.json({ promotions: filteredPromotions })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
