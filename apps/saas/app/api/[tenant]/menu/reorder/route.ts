import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Menu from '@/models/Menu'
import { NextResponse } from 'next/server'
import type { Types } from 'mongoose'
import mongoose from 'mongoose'
import { requireAuth } from '@/lib/apiAuth'
import { NextRequest } from 'next/server'

type MenuCategory = {
  _id?: Types.ObjectId
  name: string
  items: any[]
  sortOrder: number
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    
    await connectDB()
    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
      .lean<{ _id: Types.ObjectId }>()
    
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const { 
      locationId, 
      type, 
      orderedIds, 
      categoryId,
      subcategoryId 
    } = await request.json()

    if (!locationId || !type || !orderedIds || !Array.isArray(orderedIds)) {
      return NextResponse.json({ error: 'Faltan parámetros requeridos' }, { status: 400 })
    }

    const menu = await Menu.findOne({
      tenantId: tenant._id,
      locationId: locationId
    })

    if (!menu) {
      return NextResponse.json({ error: 'Menú no encontrado' }, { status: 404 })
    }

    if (type === 'categories') {
      const categories = menu.categories as unknown as MenuCategory[]
      const categoryMap = new Map<string, MenuCategory>()
      for (const cat of categories) {
        categoryMap.set(cat._id?.toString() ?? '', cat)
      }

      // Non-destructive reorder: never drop categories missing from orderedIds.
      // Only assign sequential sortOrder to the listed (existing) categories.
      let order = 0
      for (const id of orderedIds) {
        const cat = categoryMap.get(id)
        if (cat) {
          cat.sortOrder = order
          order++
        }
      }
      // Keep any category not present in orderedIds at the end (no data loss).
      for (const cat of categories) {
        if (cat.sortOrder === undefined || cat.sortOrder >= order) {
          cat.sortOrder = order++
        }
      }
      menu.markModified('categories')
    }
    else if (type === 'items') {
      if (!categoryId) {
        return NextResponse.json({ error: 'Falta categoryId para reordenar ítems' }, { status: 400 })
      }

      const categories = menu.categories as unknown as MenuCategory[]
      let targetCategory: MenuCategory | null = null
      for (const c of categories) {
        if (c._id?.toString() === categoryId) {
          targetCategory = c
          break
        }
      }

      if (!targetCategory) {
        return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 })
      }

      const itemMap = new Map<string, any>()
      for (const item of targetCategory.items) {
        itemMap.set(item._id?.toString() ?? '', item)
      }

      const newItems: any[] = []
      for (const id of orderedIds) {
        const item = itemMap.get(id)
        if (item) newItems.push(item)
      }
      // Preserve items not listed in orderedIds (no data loss on desync).
      for (const item of targetCategory.items) {
        if (!orderedIds.includes(item._id?.toString() ?? '')) {
          if (!newItems.some((ni: any) => ni._id?.toString() === item._id?.toString())) {
            newItems.push(item)
          }
        }
      }

      targetCategory.items = newItems
      menu.markModified('categories')
    }
    else if (type === 'subcategories') {
      if (!categoryId) {
        return NextResponse.json({ error: 'Falta categoryId para reordenar subcategorías' }, { status: 400 })
      }
      const category = menu.categories.id(categoryId)
      if (!category) return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 })

      const subMap = new Map<string, any>()
      for (const sub of category.subcategories || []) {
        subMap.set(sub._id?.toString() ?? '', sub)
      }
      // Non-destructive: assign sequential sortOrder to listed subs, keep the rest.
      let subOrder = 0
      for (const id of orderedIds) {
        const sub = subMap.get(id)
        if (sub) {
          sub.sortOrder = subOrder
          subOrder++
        }
      }
      for (const sub of category.subcategories || []) {
        if (sub.sortOrder === undefined || sub.sortOrder >= subOrder) {
          sub.sortOrder = subOrder++
        }
      }
      menu.markModified('categories')
    }
    else if (type === 'subcategory_items') {
      if (!categoryId || !subcategoryId) {
        return NextResponse.json({ error: 'Faltan categoryId y subcategoryId' }, { status: 400 })
      }
      const category = menu.categories.id(categoryId)
      if (!category) return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 })

      const subcategory = (category.subcategories || []).id(subcategoryId)
      if (!subcategory) return NextResponse.json({ error: 'Subcategoría no encontrada' }, { status: 404 })

      const itemMap = new Map<string, any>()
      for (const item of subcategory.items) {
        itemMap.set(item._id?.toString() ?? '', item)
      }
      const newItems: any[] = []
      for (const id of orderedIds) {
        const item = itemMap.get(id)
        if (item) newItems.push(item)
      }
      // Preserve items not listed in orderedIds (no data loss on desync).
      for (const item of subcategory.items) {
        if (!orderedIds.includes(item._id?.toString() ?? '')) {
          if (!newItems.some((ni: any) => ni._id?.toString() === item._id?.toString())) {
            newItems.push(item)
          }
        }
      }
      subcategory.items = newItems
      menu.markModified('categories')
    }
    else {
      return NextResponse.json({ error: 'Tipo inválido. Use "categories", "items", "subcategories" o "subcategory_items"' }, { status: 400 })
    }

    await menu.save()

    return NextResponse.json({ success: true, message: 'Orden actualizado correctamente' })
  } catch (error) {
    console.error('Error reordenando menú:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
