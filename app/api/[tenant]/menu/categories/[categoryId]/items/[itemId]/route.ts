import { connectDB } from '@/lib/mongoose'
import Menu from '@/models/Menu'
import Tenant from '@/models/Tenant'
import { requireAuth } from '@/lib/apiAuth'
import { NextRequest, NextResponse } from 'next/server'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; categoryId: string; itemId: string }> }
) {
  try {
    const { tenant: tenantSlug, categoryId, itemId } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const locationId = request.nextUrl.searchParams.get('locationId')

    const menu = await Menu.findOne({ tenantId: tenant._id, locationId })
    if (!menu) return NextResponse.json({ error: 'Menú no encontrado' }, { status: 404 })

    const category = menu.categories.id(categoryId)
    if (!category) return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 })

    category.items.pull({ _id: itemId })
    await menu.save()

    return NextResponse.json({ message: 'Item eliminado' })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}