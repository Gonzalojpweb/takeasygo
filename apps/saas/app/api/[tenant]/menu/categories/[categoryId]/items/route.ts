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

    const { locationId, name, description, price, takeawayPrice, businessPrice, isBusinessAvailable, imageUrl, tags, isFeatured, suggestWith, customizationGroups, variants, subcategoryId } = await request.json()

    const menu = await Menu.findOne({ tenantId: tenant._id, locationId })
    if (!menu) return NextResponse.json({ error: 'Menú no encontrado' }, { status: 404 })

    const category = menu.categories.id(categoryId)
    if (!category) return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 })

    const [nameEn, descEn] = await Promise.all([
      translateToEnglish(name),
      description ? translateToEnglish(description) : Promise.resolve(''),
    ])

    const newItem = {
      name,
      description: description || '',
      price,
      takeawayPrice: takeawayPrice || undefined,
      businessPrice: businessPrice !== undefined ? businessPrice : undefined,
      isAvailable: true,
      isBusinessAvailable: isBusinessAvailable ?? false,
      imageUrl: imageUrl || '',
      tags: tags || [],
      isFeatured: isFeatured || false,
      suggestWith: suggestWith || [],
      customizationGroups: customizationGroups || [],
      variants: variants || [],
      nameTranslations: { en: nameEn },
      descriptionTranslations: { en: descEn },
      // Guardar precio original de lista al crear el item
      originalPrice: price,
      takeawayOriginalPrice: takeawayPrice || price,
    } as any

    if (subcategoryId) {
      const subcategory = category.subcategories?.id(subcategoryId)
      if (!subcategory) return NextResponse.json({ error: 'Subcategoría no encontrada' }, { status: 404 })
      subcategory.items.push(newItem)
    } else {
      category.items.push(newItem)
    }
    menu.markModified('categories')
    await menu.save()

    logAudit({ tenantId: tenant._id.toString(), action: 'menu.item.created', entity: 'item', details: { name, price, categoryId, locationId }, request })
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
    const { locationId, itemId, name, description, price, isAvailable, isTakeawayAvailable, isBusinessAvailable, imageUrl, tags, isFeatured, suggestWith, customizationGroups, variants, availabilityMode, availabilitySchedule, takeawayPrice, businessPrice, originalPrice, takeawayOriginalPrice, businessOriginalPrice, bulkUpdate } = body

    const menu = await Menu.findOne({ tenantId: tenant._id, locationId })
    if (!menu) {
      console.error('[PUT items] Menú no encontrado:', { tenantId: tenant._id.toString(), locationId: locationId?.toString() })
      return NextResponse.json({ error: 'Menú no encontrado', tenantId: tenant._id.toString(), locationId }, { status: 404 })
    }

    const category = menu.categories.id(categoryId)
    if (!category) {
      const ids = menu.categories.map((c: any) => c._id.toString())
      return NextResponse.json({ error: 'Categoría no encontrada', categoryId, availableIds: ids }, { status: 404 })
    }

    // ── Batch update: actualizar todos los items de la categoría ──
    if (bulkUpdate && isBusinessAvailable !== undefined) {
      let updatedCount = 0
      for (const item of category.items) {
        item.isBusinessAvailable = isBusinessAvailable
        updatedCount++
      }
      for (const sub of category.subcategories || []) {
        for (const item of sub.items || []) {
          item.isBusinessAvailable = isBusinessAvailable
          updatedCount++
        }
      }
      menu.markModified('categories')
      await menu.save()
      logAudit({ tenantId: tenant._id.toString(), action: 'menu.items.bulk_business', entity: 'category', entityId: categoryId, details: { isBusinessAvailable, updatedCount, locationId }, request })
      return NextResponse.json({ ok: true, updatedCount })
    }

    function findItemInCategory(cat: any, id: string): { item: any; subcategory: any } | null {
      const directItem = cat.items.id(id)
      if (directItem) return { item: directItem, subcategory: null }
      for (const sub of cat.subcategories || []) {
        const subItem = sub.items.id(id)
        if (subItem) return { item: subItem, subcategory: sub }
      }
      return null
    }

    const found = findItemInCategory(category, itemId)
    if (!found) {
      const ids = category.items.map((i: any) => i._id.toString())
      return NextResponse.json({ error: 'Item no encontrado', itemId, availableIds: ids }, { status: 404 })
    }
    const item = found.item

    if (name !== undefined) {
      item.name = name
      item.nameTranslations = { en: await translateToEnglish(name) }
    }
    if (description !== undefined) {
      item.description = description
      item.descriptionTranslations = { en: description ? await translateToEnglish(description) : '' }
    }
    if (price !== undefined) {
      // Si no tiene originalPrice guardado, guardarlo antes de cambiar el precio
      if (!item.originalPrice) {
        item.originalPrice = item.price
      }
      item.price = price
    }
    if (takeawayPrice !== undefined) {
      // Si no tiene takeawayOriginalPrice guardado, guardarlo antes de cambiar
      if (!item.takeawayOriginalPrice) {
        item.takeawayOriginalPrice = item.takeawayPrice || item.price
      }
      item.takeawayPrice = takeawayPrice
    }
    if (isAvailable !== undefined) item.isAvailable = isAvailable
    if (isTakeawayAvailable !== undefined) item.isTakeawayAvailable = isTakeawayAvailable
    if (isBusinessAvailable !== undefined) item.isBusinessAvailable = isBusinessAvailable
    if (businessPrice !== undefined) item.businessPrice = businessPrice === '' ? null : businessPrice
    if (imageUrl !== undefined) item.imageUrl = imageUrl
    if (tags !== undefined) item.tags = tags
    if (isFeatured !== undefined) item.isFeatured = isFeatured
    if (suggestWith !== undefined) item.suggestWith = suggestWith
    if (customizationGroups !== undefined) item.customizationGroups = customizationGroups
    if (variants !== undefined) item.variants = variants
    if (availabilityMode !== undefined) item.availabilityMode = availabilityMode
    if (availabilitySchedule !== undefined) item.availabilitySchedule = availabilitySchedule
    // Permitir guardar explícitamente (para bulk update)
    if (originalPrice !== undefined) item.originalPrice = originalPrice
    if (takeawayOriginalPrice !== undefined) item.takeawayOriginalPrice = takeawayOriginalPrice
    if (businessOriginalPrice !== undefined) item.businessOriginalPrice = businessOriginalPrice

    menu.markModified('categories')
    try {
      await menu.save()
      
      // Verificación inmediata: re-leer el item para confirmar el cambio
      const verifyMenu = await Menu.findOne({ tenantId: tenant._id, locationId })
      const verifyCategory = verifyMenu?.categories.id(categoryId)
      const verifyItem = verifyCategory?.items.id(itemId)
    } catch (saveError: any) {
      console.error('[PUT items] Error guardando menú:', saveError)
      return NextResponse.json({ 
        error: 'Error guardando los cambios', 
        details: saveError.message,
        validationErrors: saveError.errors 
      }, { status: 500 })
    }

    logAudit({ tenantId: tenant._id.toString(), action: 'menu.item.updated', entity: 'item', entityId: itemId, details: { name, price, categoryId, locationId }, request })
    return NextResponse.json({ menu })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
