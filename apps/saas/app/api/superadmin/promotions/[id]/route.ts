import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Promotion from '@/models/Promotion'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const { id } = await params
    await connectDB()

    const promotion = await Promotion.findOne({ _id: id, scope: 'global' }).lean()
    if (!promotion) {
      return NextResponse.json({ error: 'Promoción global no encontrada' }, { status: 404 })
    }

    return NextResponse.json({ promotion })
  } catch (error) {
    console.error('[superadmin/promotions/[id] GET]', error)
    return NextResponse.json({ error: 'Error al obtener la promoción' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const { id } = await params
    const body = await request.json()
    await connectDB()

    const promotion = await Promotion.findOne({ _id: id, scope: 'global' })
    if (!promotion) {
      return NextResponse.json({ error: 'Promoción global no encontrada' }, { status: 404 })
    }

    if (body.title !== undefined) promotion.title = body.title.trim()
    if (body.description !== undefined) promotion.description = body.description
    if (body.shortDescription !== undefined) promotion.shortDescription = body.shortDescription
    if (body.imageUrl !== undefined) promotion.imageUrl = body.imageUrl
    if (body.type !== undefined) promotion.type = body.type
    if (body.price !== undefined) promotion.price = body.price
    if (body.originalPrice !== undefined) promotion.originalPrice = body.originalPrice
    if (body.currency !== undefined) promotion.currency = body.currency
    if (body.conditions !== undefined) promotion.conditions = body.conditions
    if (body.details !== undefined) promotion.details = body.details
    if (body.ctaText !== undefined) promotion.ctaText = body.ctaText
    if (body.ctaLink !== undefined) promotion.ctaLink = body.ctaLink
    if (body.visibility !== undefined) promotion.visibility = body.visibility
    if (body.isActive !== undefined) promotion.isActive = body.isActive
    if (body.isFeatured !== undefined) promotion.isFeatured = body.isFeatured
    if (body.scheduledStart !== undefined) promotion.scheduledStart = body.scheduledStart
    if (body.scheduledEnd !== undefined) promotion.scheduledEnd = body.scheduledEnd
    if (body.customStyles !== undefined) promotion.customStyles = body.customStyles
    if (body.maxRedemptions !== undefined) promotion.maxRedemptions = body.maxRedemptions
    if (body.sortOrder !== undefined) promotion.sortOrder = body.sortOrder
    if (body.targetTenants !== undefined) promotion.targetTenants = body.targetTenants

    await promotion.save()

    logAudit({
      tenantId: null,
      action: 'promotion.global.updated',
      entity: 'promotion',
      details: { promotionId: promotion._id, title: promotion.title },
      request,
    })

    return NextResponse.json({ promotion })
  } catch (error) {
    console.error('[superadmin/promotions/[id] PUT]', error)
    return NextResponse.json({ error: 'Error al actualizar la promoción' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const { id } = await params
    await connectDB()

    const deleted = await Promotion.findOneAndDelete({ _id: id, scope: 'global' })
    if (!deleted) {
      return NextResponse.json({ error: 'Promoción global no encontrada' }, { status: 404 })
    }

    logAudit({
      tenantId: null,
      action: 'promotion.global.deleted',
      entity: 'promotion',
      details: { promotionId: id, title: deleted.title },
      request,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[superadmin/promotions/[id] DELETE]', error)
    return NextResponse.json({ error: 'Error al eliminar la promoción' }, { status: 500 })
  }
}
