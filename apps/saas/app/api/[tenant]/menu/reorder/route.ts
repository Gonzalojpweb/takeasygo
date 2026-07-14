import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Menu from '@/models/Menu'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import type { Types } from 'mongoose'
import mongoose from 'mongoose'

type MenuCategory = {
  _id?: Types.ObjectId
  name: string
  items: any[]
  sortOrder: number
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    
    const headerList = await headers()
    if (headerList.get('x-tenant-slug') !== tenantSlug) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()
    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
      .lean<{ _id: Types.ObjectId }>()
    
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

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

      const newCategories: MenuCategory[] = []
      for (const id of orderedIds) {
        const cat = categoryMap.get(id)
        if (cat) {
          cat.sortOrder = newCategories.length
          newCategories.push(cat)
        }
      }

      menu.categories = newCategories
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
        if (item) {
          newItems.push(item)
        }
      }

      targetCategory.items = newItems
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
      const newSubs: any[] = []
      for (const id of orderedIds) {
        const sub = subMap.get(id)
        if (sub) {
          sub.sortOrder = newSubs.length
          newSubs.push(sub)
        }
      }
      category.subcategories = newSubs
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
      subcategory.items = newItems
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
