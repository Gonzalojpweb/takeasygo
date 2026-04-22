import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Menu from '@/models/Menu'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'

interface ImportItem {
  name: string
  description?: string
  price: number
  takeawayPrice?: number
  tags?: string[]
  isFeatured?: boolean
  imageUrl?: string
}

interface ImportCategory {
  name: string
  items: ImportItem[]
}

function validatePayload(categories: unknown): categories is ImportCategory[] {
  if (!Array.isArray(categories) || categories.length === 0) return false
  for (const cat of categories) {
    if (typeof cat.name !== 'string' || !cat.name.trim()) return false
    if (!Array.isArray(cat.items)) return false
    for (const item of cat.items) {
      if (typeof item.name !== 'string' || !item.name.trim()) return false
      if (typeof item.price !== 'number' || item.price < 0) return false
      if (item.dineInPrice !== undefined && (typeof item.dineInPrice !== 'number' || item.dineInPrice < 0)) return false
    }
  }
  return true
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const body = await request.json()
    const { locationId, categories, mode = 'replace' } = body

    if (!locationId) {
      return NextResponse.json({ error: 'locationId es requerido' }, { status: 400 })
    }

    if (!validatePayload(categories)) {
      return NextResponse.json(
        { error: 'JSON inválido. Cada categoría debe tener "name" y "items", y cada item debe tener "name" y "price" (número).' },
        { status: 400 }
      )
    }

    const menu = await Menu.findOne({ tenantId: tenant._id, locationId, isActive: true })
    if (!menu) {
      return NextResponse.json({ error: 'No se encontró el menú para esta sede' }, { status: 404 })
    }

    const builtCategories = categories.map((cat: ImportCategory, catIndex: number) => ({
      name: cat.name.trim(),
      description: '',
      isAvailable: true,
      sortOrder: catIndex,
      items: cat.items.map((item: ImportItem) => ({
        name: item.name.trim(),
        description: item.description?.trim() ?? '',
        price: item.price,
        takeawayPrice: item.takeawayPrice,
        tags: Array.isArray(item.tags) ? item.tags.map((t: string) => t.trim()).filter(Boolean) : [],
        isFeatured: item.isFeatured ?? false,
        imageUrl: item.imageUrl ?? '',
        isAvailable: true,
      })),
    }))

    if (mode === 'replace') {
      menu.categories = builtCategories
    } else {
      // append: push new categories
      const startOrder = menu.categories.length
      builtCategories.forEach((cat, i) => {
        cat.sortOrder = startOrder + i
        menu.categories.push(cat)
      })
    }

    await menu.save()

    const totalItems = builtCategories.reduce((sum, cat) => sum + cat.items.length, 0)

    return NextResponse.json({
      ok: true,
      imported: {
        categories: builtCategories.length,
        items: totalItems,
        mode,
      },
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
