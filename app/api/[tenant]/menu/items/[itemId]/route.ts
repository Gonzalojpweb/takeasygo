import { connectDB } from '@/lib/mongoose'
import Menu from '@/models/Menu'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; itemId: string }> }
) {
  try {
    const { tenant: tenantSlug, itemId } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const locationId = request.nextUrl.searchParams.get('locationId')

    const menu = await Menu.findOne({ tenantId: tenant._id, ...(locationId ? { locationId } : {}) })
    if (!menu) return NextResponse.json({ error: 'Menú no encontrado' }, { status: 404 })

    // Search across all categories
    for (const cat of menu.categories ?? []) {
      const item = (cat.items ?? []).find(
        (i: any) => i._id.toString() === itemId
      )
      if (item) {
        return NextResponse.json({
          item: {
            _id: item._id,
            name: item.name,
            price: item.price,
            variants: item.variants ?? [],
            customizationGroups: item.customizationGroups ?? [],
          },
        })
      }
    }

    return NextResponse.json({ error: 'Item no encontrado' }, { status: 404 })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
