/**
 * API Endpoint: Store Items (Admin)
 * 
 * GET    /api/{tenant}/store/items              - Listar items
 * POST   /api/{tenant}/store/items              - Crear item
 */

import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import StoreItem from '@/models/StoreItem'
import Tenant from '@/models/Tenant'
import { requireAuth } from '@/lib/apiAuth'
import { canAccess } from '@/lib/plans'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    // Solo tenants Premium tienen acceso a la Store
    if (!canAccess(tenant.plan, 'store')) {
      return NextResponse.json({ items: [] })
    }

    // Requiere autenticación de admin
    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const isActive = searchParams.get('isActive')
    const isFeatured = searchParams.get('isFeatured')

    const query: any = { tenantId: tenant._id }

    if (category) query.category = category
    if (isActive !== null) query.isActive = isActive === 'true'
    if (isFeatured !== null) query.isFeatured = isFeatured === 'true'

    const items = await StoreItem.find(query).sort({ sortOrder: 1, createdAt: -1 }).lean()

    return NextResponse.json({ items })
  } catch (error) {
    console.error('[Store Items GET] Error:', error)
    return NextResponse.json({ error: 'Error al obtener items' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    // Requiere autenticación de admin
    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const body = await request.json()
    const {
      name,
      description,
      imageUrl,
      pointsCost,
      cashValue,
      isActive,
      stock,
      maxPerMember,
      tierRequirement,
      category,
      tags,
      sortOrder,
      isFeatured,
    } = body

    if (!name || !description || !imageUrl || !pointsCost || !category) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
    }

    const item = await StoreItem.create({
      tenantId: tenant._id,
      name,
      description,
      imageUrl,
      pointsCost,
      cashValue: cashValue || null,
      isActive: isActive !== undefined ? isActive : true,
      stock: stock !== undefined ? stock : null,
      maxPerMember: maxPerMember || null,
      tierRequirement: tierRequirement || 'none',
      category,
      tags: tags || [],
      sortOrder: sortOrder || 0,
      isFeatured: isFeatured || false,
    })

    return NextResponse.json({ item }, { status: 201 })
  } catch (error) {
    console.error('[Store Items POST] Error:', error)
    return NextResponse.json({ error: 'Error al crear item' }, { status: 500 })
  }
}
