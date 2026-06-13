import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import StoreItem from '@/models/StoreItem'
import Tenant from '@/models/Tenant'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'

export async function GET(request: NextRequest) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    await connectDB()
    const { searchParams } = request.nextUrl
    const targetTenantId = searchParams.get('targetTenantId')

    const query: any = { scope: 'global' }
    if (targetTenantId) {
      query.$or = [
        { targetTenants: targetTenantId },
        { targetTenants: { $size: 0 } },
      ]
    }

    const items = await StoreItem.find(query)
      .sort({ createdAt: -1 })
      .lean()

    return NextResponse.json({ items })
  } catch (error) {
    console.error('[superadmin/store-items GET]', error)
    return NextResponse.json({ error: 'Error al obtener ofertas globales' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const body = await request.json()
    const {
      name, description, imageUrl, pointsCost, cashValue,
      isActive, stock, maxPerMember, tierRequirement,
      category, tags, sortOrder, isFeatured, targetTenants,
    } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    }
    if (!description?.trim()) {
      return NextResponse.json({ error: 'La descripción es obligatoria' }, { status: 400 })
    }
    if (!imageUrl?.trim()) {
      return NextResponse.json({ error: 'La imagen es obligatoria' }, { status: 400 })
    }
    if (!pointsCost || pointsCost < 1) {
      return NextResponse.json({ error: 'El costo en puntos debe ser al menos 1' }, { status: 400 })
    }

    await connectDB()

    if (Array.isArray(targetTenants) && targetTenants.length > 0) {
      const validCount = await Tenant.countDocuments({ _id: { $in: targetTenants }, isActive: true })
      if (validCount !== targetTenants.length) {
        return NextResponse.json({ error: 'Uno o más tenants target no existen o no están activos' }, { status: 400 })
      }
    }

    const item = await StoreItem.create({
      scope: 'global',
      targetTenants: Array.isArray(targetTenants) ? targetTenants : [],
      name: name.trim(),
      description: description.trim(),
      imageUrl: imageUrl.trim(),
      pointsCost,
      cashValue: cashValue ?? null,
      isActive: isActive !== undefined ? isActive : true,
      stock: stock ?? null,
      maxPerMember: maxPerMember ?? null,
      tierRequirement: tierRequirement || 'none',
      category: category || 'food',
      tags: Array.isArray(tags) ? tags : [],
      sortOrder: sortOrder || 0,
      isFeatured: isFeatured || false,
      totalRedemptions: 0,
    })

    logAudit({
      tenantId: null,
      action: 'store-item.global.created',
      entity: 'storeitem',
      details: { itemId: item._id, name: item.name, targetTenants: item.targetTenants },
      request,
    })

    return NextResponse.json({ item }, { status: 201 })
  } catch (error) {
    console.error('[superadmin/store-items POST]', error)
    return NextResponse.json({ error: 'Error al crear la oferta global' }, { status: 500 })
  }
}
