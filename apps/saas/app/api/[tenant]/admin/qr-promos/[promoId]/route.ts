import { connectDB } from '@/lib/mongoose'
import mongoose from 'mongoose'
import QrPromo from '@/models/QrPromo'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
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
        scope: 'tenant',
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
      'scheduledStart', 'scheduledEnd', 'locationId',
    ]

    const updateData: Record<string, unknown> = {}
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    // locationId: null o '' = "todas las sedes" (elección explícita del admin).
    // Si se provee, debe ser una sede activa del tenant.
    if (body.locationId !== undefined) {
      const raw = body.locationId === '' ? null : body.locationId
      if (raw === null) {
        updateData.locationId = null
      } else {
        if (typeof raw !== 'string' || !mongoose.Types.ObjectId.isValid(raw)) {
          return NextResponse.json({ error: 'locationId inválido' }, { status: 400 })
        }
        const loc = await Location.findOne({ _id: raw, tenantId: tenant._id, isActive: true }).select('_id').lean()
        if (!loc) {
          return NextResponse.json({ error: 'La sede no existe o no pertenece al tenant' }, { status: 400 })
        }
        updateData.locationId = new mongoose.Types.ObjectId(raw)
      }
    }

    const promo = await QrPromo.findOneAndUpdate(
      { _id: promoId, scope: 'tenant', tenantId: tenant._id },
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

    const promo = await QrPromo.findOneAndDelete({ _id: promoId, scope: 'tenant', tenantId: tenant._id })
    if (!promo) {
      return NextResponse.json({ error: 'Promo not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('QR Promo DELETE error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
