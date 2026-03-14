import { connectDB } from '@/lib/mongoose'
import Menu from '@/models/Menu'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { translateToEnglish } from '@/lib/translate'

export async function POST(
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

    const { locationId, name, description, price, imageUrl, tags, isFeatured, customizationGroups } = await request.json()

    const menu = await Menu.findOne({ tenantId: tenant._id, locationId })
    if (!menu) return NextResponse.json({ error: 'Menú no encontrado' }, { status: 404 })

    const category = menu.categories.id(categoryId)
    if (!category) return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 })

    const [nameEn, descEn] = await Promise.all([
      translateToEnglish(name),
      description ? translateToEnglish(description) : Promise.resolve(''),
    ])

    category.items.push({
      name,
      description: description || '',
      price,
      isAvailable: true,
      imageUrl: imageUrl || '',
      tags: tags || [],
      isFeatured: isFeatured || false,
      customizationGroups: customizationGroups || [],
      nameTranslations: { en: nameEn },
      descriptionTranslations: { en: descEn },
    } as any)
    menu.markModified('categories')
    await menu.save()

    return NextResponse.json({ menu }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; categoryId: string }> }
) {
  try {
    const { tenant: tenantSlug, categoryId } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado', tenantSlug }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const body = await request.json()
    const { locationId, itemId, name, description, price, isAvailable, imageUrl, tags, isFeatured, customizationGroups } = body

    console.log('[PUT items]', { tenantSlug, categoryId, locationId, itemId })

    const menu = await Menu.findOne({ tenantId: tenant._id, locationId })
    if (!menu) return NextResponse.json({ error: 'Menú no encontrado', tenantId: tenant._id.toString(), locationId }, { status: 404 })

    const category = menu.categories.id(categoryId)
    if (!category) {
      const ids = menu.categories.map((c: any) => c._id.toString())
      return NextResponse.json({ error: 'Categoría no encontrada', categoryId, availableIds: ids }, { status: 404 })
    }

    const item = category.items.id(itemId)
    if (!item) {
      const ids = category.items.map((i: any) => i._id.toString())
      return NextResponse.json({ error: 'Item no encontrado', itemId, availableIds: ids }, { status: 404 })
    }

    if (name !== undefined) {
      item.name = name
      item.nameTranslations = { en: await translateToEnglish(name) }
    }
    if (description !== undefined) {
      item.description = description
      item.descriptionTranslations = { en: description ? await translateToEnglish(description) : '' }
    }
    if (price !== undefined) item.price = price
    if (isAvailable !== undefined) item.isAvailable = isAvailable
    if (imageUrl !== undefined) item.imageUrl = imageUrl
    if (tags !== undefined) item.tags = tags
    if (isFeatured !== undefined) item.isFeatured = isFeatured
    if (customizationGroups !== undefined) item.customizationGroups = customizationGroups

    menu.markModified('categories')
    await menu.save()

    return NextResponse.json({ menu })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
