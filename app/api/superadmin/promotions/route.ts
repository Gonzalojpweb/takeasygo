import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Promotion from '@/models/Promotion'
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

    const promotions = await Promotion.find(query)
      .sort({ createdAt: -1 })
      .lean()

    return NextResponse.json({ promotions })
  } catch (error) {
    console.error('[superadmin/promotions GET]', error)
    return NextResponse.json({ error: 'Error al obtener promociones globales' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const body = await request.json()
    const {
      type, title, description, shortDescription, imageUrl,
      price, originalPrice, currency, conditions, details,
      ctaText, ctaLink, visibility, isActive, isFeatured,
      scheduledStart, scheduledEnd, customStyles,
      maxRedemptions, sortOrder, targetTenants,
    } = body

    if (!title?.trim()) {
      return NextResponse.json({ error: 'El título es obligatorio' }, { status: 400 })
    }
    if (type === 'sale' && (price === undefined || price === null || price < 0)) {
      return NextResponse.json({ error: 'El precio es obligatorio para promociones de venta' }, { status: 400 })
    }

    await connectDB()

    // Validate targetTenants if provided
    if (Array.isArray(targetTenants) && targetTenants.length > 0) {
      const validCount = await Tenant.countDocuments({ _id: { $in: targetTenants }, isActive: true })
      if (validCount !== targetTenants.length) {
        return NextResponse.json({ error: 'Uno o más tenants target no existen o no están activos' }, { status: 400 })
      }
    }

    const promotion = await Promotion.create({
      scope: 'global',
      targetTenants: Array.isArray(targetTenants) ? targetTenants : [],
      type: type || 'info',
      title: title.trim(),
      description: description || '',
      shortDescription: shortDescription || '',
      imageUrl: imageUrl || '',
      price: price ?? 0,
      originalPrice: originalPrice ?? null,
      currency: currency || 'USD',
      conditions: conditions || '',
      details: details || '',
      ctaText: ctaText || '',
      ctaLink: ctaLink || '',
      visibility: visibility || 'both',
      isActive: isActive !== undefined ? isActive : true,
      isFeatured: isFeatured || false,
      scheduledStart: scheduledStart || null,
      scheduledEnd: scheduledEnd || null,
      customStyles: customStyles || {},
      maxRedemptions: maxRedemptions ?? null,
      redemptionsCount: 0,
      sortOrder: sortOrder || 0,
    })

    logAudit({
      tenantId: null,
      action: 'promotion.global.created',
      entity: 'promotion',
      details: { promotionId: promotion._id, title: promotion.title, targetTenants: promotion.targetTenants },
      request,
    })

    return NextResponse.json({ promotion }, { status: 201 })
  } catch (error) {
    console.error('[superadmin/promotions POST]', error)
    return NextResponse.json({ error: 'Error al crear la promoción global' }, { status: 500 })
  }
}
