import { connectDB } from '@/lib/mongoose'
import Menu from '@/models/Menu'
import Tenant from '@/models/Tenant'
import { requireAuth } from '@/lib/apiAuth'
import { NextRequest, NextResponse } from 'next/server'
import { translateToEnglish } from '@/lib/translate'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; categoryId: string }> }
) {
  try {
    const { tenant: tenantSlug, categoryId } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const { locationId, name, description, isAvailable, imageUrl } = await request.json()

    const menu = await Menu.findOne({ tenantId: tenant._id, locationId })
    if (!menu) return NextResponse.json({ error: 'Menú no encontrado' }, { status: 404 })

    const category = menu.categories.id(categoryId)
    if (!category) return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 })

    if (name !== undefined) {
      category.name = name
      category.nameTranslations = { en: await translateToEnglish(name) }
    }
    if (description !== undefined) {
      category.description = description
      category.descriptionTranslations = { en: description ? await translateToEnglish(description) : '' }
    }
    if (isAvailable !== undefined) category.isAvailable = isAvailable
    if (imageUrl !== undefined) category.imageUrl = imageUrl

    menu.markModified('categories')
    await menu.save()
    return NextResponse.json({ menu })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; categoryId: string }> }
) {
  try {
    const { tenant: tenantSlug, categoryId } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const locationId = request.nextUrl.searchParams.get('locationId')

    const menu = await Menu.findOne({ tenantId: tenant._id, locationId })
    if (!menu) return NextResponse.json({ error: 'Menú no encontrado' }, { status: 404 })

    menu.categories.pull({ _id: categoryId })
    await menu.save()

    return NextResponse.json({ message: 'Categoría eliminada' })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
