import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Menu from '@/models/Menu'
import { requireAuth } from '@/lib/apiAuth'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    const locationId = request.nextUrl.searchParams.get('locationId')

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const menuQuery: any = { tenantId: tenant._id, isActive: true }
    if (locationId) menuQuery.locationId = locationId

    const menus = await Menu.find(menuQuery).lean()
    if (!menus || menus.length === 0) {
      return NextResponse.json({ items: [] })
    }

    const items: { name: string; categoryName: string; likesCount: number; imageUrl: string; itemId: string }[] = []
    const seenItemIds = new Set<string>()

    for (const menu of menus) {
      for (const cat of (menu as any).categories ?? []) {
        for (const item of cat.items ?? []) {
          const id = item._id?.toString()
          if (id && !seenItemIds.has(id) && (item.likesCount ?? 0) > 0) {
            seenItemIds.add(id)
            items.push({
              name: item.name,
              categoryName: cat.name,
              likesCount: item.likesCount ?? 0,
              imageUrl: item.imageUrl ?? '',
              itemId: id,
            })
          }
        }
        for (const sub of cat.subcategories ?? []) {
          for (const item of sub.items ?? []) {
            const id = item._id?.toString()
            if (id && !seenItemIds.has(id) && (item.likesCount ?? 0) > 0) {
              seenItemIds.add(id)
              items.push({
                name: item.name,
                categoryName: cat.name,
                likesCount: item.likesCount ?? 0,
                imageUrl: item.imageUrl ?? '',
                itemId: id,
              })
            }
          }
        }
      }
    }

    items.sort((a, b) => b.likesCount - a.likesCount)

    return NextResponse.json({ items: items.slice(0, 10) })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
