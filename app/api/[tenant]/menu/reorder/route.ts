import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Menu from '@/models/Menu'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import type { Types } from 'mongoose'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    
    // Auth validation
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

    // Body parsing
    const { 
      locationId, 
      type, 
      orderedIds, 
      categoryId 
    } = await request.json()

    if (!locationId || !type || !orderedIds || !Array.isArray(orderedIds)) {
      return NextResponse.json({ error: 'Faltan parámetros requeridos' }, { status: 400 })
    }

    // Get the menu document
    const menu = await Menu.findOne({
      tenantId: tenant._id,
      locationId: locationId
    })

    if (!menu) {
      return NextResponse.json({ error: 'Menú no encontrado' }, { status: 404 })
    }

    if (type === 'categories') {
      // Create a map of categories for quick lookup
      const categoryMap = new Map()
      menu.categories.forEach((cat) => {
        categoryMap.set(cat._id.toString(), cat)
      })

      // Reconstruct the categories array based on orderedIds
      const newCategories: any[] = []
      orderedIds.forEach((id: string, index: number) => {
        const cat = categoryMap.get(id)
        if (cat) {
          cat.sortOrder = index
          newCategories.push(cat)
          categoryMap.delete(id)
        }
      })

      // Append any categories that weren't in orderedIds to avoid losing data
      categoryMap.forEach((cat) => {
        cat.sortOrder = newCategories.length
        newCategories.push(cat)
      })

      menu.categories = newCategories as any
    } 
    else if (type === 'items') {
      if (!categoryId) {
        return NextResponse.json({ error: 'Falta categoryId para reordenar ítems' }, { status: 400 })
      }

      const targetCategory = menu.categories.find(c => c._id?.toString() === categoryId)
      if (!targetCategory) {
        return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 })
      }

      const itemMap = new Map()
      targetCategory.items.forEach(item => {
        itemMap.set(item._id?.toString(), item)
      })

      const newItems: any[] = []
      orderedIds.forEach((id: string) => {
        const item = itemMap.get(id)
        if (item) {
          newItems.push(item)
          itemMap.delete(id)
        }
      })

      // Append any remaining items
      itemMap.forEach(item => {
        newItems.push(item)
      })

      targetCategory.items = newItems
    } 
    else {
      return NextResponse.json({ error: 'Tipo inválido. Use "categories" o "items"' }, { status: 400 })
    }

    await menu.save()

    return NextResponse.json({ success: true, message: 'Orden actualizado correctamente' })
  } catch (error) {
    console.error('Error reordenando menú:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
