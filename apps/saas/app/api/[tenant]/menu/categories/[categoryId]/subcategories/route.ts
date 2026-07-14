import { connectDB } from '@/lib/mongoose'
import Menu from '@/models/Menu'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { translateToEnglish } from '@/lib/translate'
import { logAudit } from '@/lib/audit'

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

    const { locationId, name, description, imageUrl, printRole, customizationGroups, availabilityMode, availabilitySchedule } = await request.json()

    const menu = await Menu.findOne({ tenantId: tenant._id, locationId })
    if (!menu) return NextResponse.json({ error: 'Menú no encontrado' }, { status: 404 })

    const category = menu.categories.id(categoryId)
    if (!category) return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 })

    if (!category.subcategories) category.subcategories = []

    const nameEn = await translateToEnglish(name)

    category.subcategories.push({
      name,
      description: description || '',
      imageUrl: imageUrl || '',
      sortOrder: category.subcategories.length,
      items: [],
      printRole: printRole || undefined,
      customizationGroups: customizationGroups || [],
      availabilityMode: availabilityMode || undefined,
      availabilitySchedule: availabilityMode === 'scheduled' ? (availabilitySchedule || []) : [],
      nameTranslations: { en: nameEn },
    } as any)
    menu.markModified('categories')
    await menu.save()

    logAudit({ tenantId: tenant._id.toString(), action: 'menu.subcategory.created', entity: 'subcategory', details: { name, categoryId, locationId }, request })
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
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const body = await request.json()
    const { locationId, subcategoryId, name, description, imageUrl, sortOrder, printRole, customizationGroups, availabilityMode, availabilitySchedule } = body

    const menu = await Menu.findOne({ tenantId: tenant._id, locationId })
    if (!menu) return NextResponse.json({ error: 'Menú no encontrado' }, { status: 404 })

    const category = menu.categories.id(categoryId)
    if (!category) return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 })

    const subcategory = (category.subcategories || []).id(subcategoryId)
    if (!subcategory) return NextResponse.json({ error: 'Subcategoría no encontrada' }, { status: 404 })

    if (name !== undefined) {
      subcategory.name = name
      subcategory.nameTranslations = { en: await translateToEnglish(name) }
    }
    if (description !== undefined) subcategory.description = description
    if (imageUrl !== undefined) subcategory.imageUrl = imageUrl
    if (sortOrder !== undefined) subcategory.sortOrder = sortOrder
    if (printRole !== undefined) subcategory.printRole = printRole
    if (customizationGroups !== undefined) subcategory.customizationGroups = customizationGroups
    if (availabilityMode !== undefined) subcategory.availabilityMode = availabilityMode
    if (availabilitySchedule !== undefined) subcategory.availabilitySchedule = availabilitySchedule

    menu.markModified('categories')
    await menu.save()
    logAudit({ tenantId: tenant._id.toString(), action: 'menu.subcategory.updated', entity: 'subcategory', entityId: subcategoryId, details: { name, categoryId, locationId }, request })
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
    const subcategoryId = request.nextUrl.searchParams.get('subcategoryId')

    if (!subcategoryId) return NextResponse.json({ error: 'subcategoryId es requerido' }, { status: 400 })

    const menu = await Menu.findOne({ tenantId: tenant._id, locationId })
    if (!menu) return NextResponse.json({ error: 'Menú no encontrado' }, { status: 404 })

    const category = menu.categories.id(categoryId)
    if (!category) return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 })

    if (!category.subcategories) return NextResponse.json({ error: 'Subcategoría no encontrada' }, { status: 404 })

    category.subcategories.pull({ _id: subcategoryId })
    await menu.save()

    logAudit({ tenantId: tenant._id.toString(), action: 'menu.subcategory.deleted', entity: 'subcategory', entityId: subcategoryId, details: { categoryId, locationId }, request })
    return NextResponse.json({ message: 'Subcategoría eliminada' })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
