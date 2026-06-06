import { connectDB } from '@/lib/mongoose'
import QrPromo from '@/models/QrPromo'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; promoId: string }> }
) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { tenant: tenantSlug, promoId } = await params

    const isSuperAdmin = session.user.role === 'superadmin'
    const belongsToTenant = session.user.tenantSlug === tenantSlug

    if (!isSuperAdmin && !belongsToTenant) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug }).select('_id')
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const body = await request.json()

    if (body.slug !== undefined) {
      body.slug = body.slug.toLowerCase().trim()
      const existing = await QrPromo.findOne({
        tenantId: tenant._id,
        slug: body.slug,
        _id: { $ne: promoId },
      })
      if (existing) {
        return NextResponse.json({ error: `Ya existe otra promo con slug "${body.slug}"` }, { status: 409 })
      }
    }

    const allowedFields = [
      'slug', 'isEnabled', 'type', 'discountPercentage', 'frequency',
      'title', 'subtitle', 'buttonText', 'termsText', 'imageUrl',
      'badgeLabel', 'offLabel', 'takeawayWarningTitle', 'takeawayWarningText',
      'loadingText', 'checkoutDiscountLabel', 'sourceTriggers',
    ]

    const updateData: Record<string, unknown> = {}
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    const promo = await QrPromo.findOneAndUpdate(
      { _id: promoId, tenantId: tenant._id },
      { $set: updateData },
      { new: true, runValidators: true }
    )

    if (!promo) {
      return NextResponse.json({ error: 'Promo not found' }, { status: 404 })
    }

    return NextResponse.json({ promo })
  } catch (error) {
    console.error('QR Promo PUT error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ tenant: string; promoId: string }> }
) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { tenant: tenantSlug, promoId } = await params

    const isSuperAdmin = session.user.role === 'superadmin'
    const belongsToTenant = session.user.tenantSlug === tenantSlug

    if (!isSuperAdmin && !belongsToTenant) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug }).select('_id')
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const promo = await QrPromo.findOneAndDelete({ _id: promoId, tenantId: tenant._id })
    if (!promo) {
      return NextResponse.json({ error: 'Promo not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('QR Promo DELETE error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
