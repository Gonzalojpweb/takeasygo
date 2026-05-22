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

    // Populate linked item data for each promotion
    const menu = await Menu.findOne({ tenantId: tenant._id, locationId }).lean()
    const promotionsWithLinked = promotions.map(p => {
      const promo: any = { ...p }
      if (promo.linkedMenuItemId && menu) {
        for (const cat of (menu as any).categories ?? []) {
          const item = (cat.items ?? []).find(
            (i: any) => i._id.toString() === promo.linkedMenuItemId.toString()
          )
          if (item) {
            promo.linkedItem = {
              _id: item._id,
              name: item.name,
              variants: item.variants ?? [],
              customizationGroups: item.customizationGroups ?? [],
            }
            break
          }
        }
      }
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