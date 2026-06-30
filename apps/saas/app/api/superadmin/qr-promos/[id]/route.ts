import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import QrPromo from '@/models/QrPromo'
import { requireSuperAdmin } from '@/lib/apiAuth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const { id } = await params
    await connectDB()

    const promo = await QrPromo.findOne({ _id: id, scope: 'global' }).lean()
    if (!promo) {
      return NextResponse.json({ error: 'QrPromo global no encontrada' }, { status: 404 })
    }

    return NextResponse.json({ promo })
  } catch (error) {
    console.error('[superadmin/qr-promos/[id] GET]', error)
    return NextResponse.json({ error: 'Error al obtener QrPromo' }, { status: 500 })
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

    const promo = await QrPromo.findOne({ _id: id, scope: 'global' })
    if (!promo) {
      return NextResponse.json({ error: 'QrPromo global no encontrada' }, { status: 404 })
    }

    if (body.slug !== undefined) promo.slug = body.slug.toLowerCase().trim()
    if (body.isEnabled !== undefined) promo.isEnabled = body.isEnabled
    if (body.scheduledStart !== undefined) promo.scheduledStart = body.scheduledStart
    if (body.scheduledEnd !== undefined) promo.scheduledEnd = body.scheduledEnd
    if (body.type !== undefined) promo.type = body.type
    if (body.discountPercentage !== undefined) promo.discountPercentage = body.discountPercentage
    if (body.frequency !== undefined) promo.frequency = body.frequency
    if (body.title !== undefined) promo.title = body.title
    if (body.subtitle !== undefined) promo.subtitle = body.subtitle
    if (body.buttonText !== undefined) promo.buttonText = body.buttonText
    if (body.termsText !== undefined) promo.termsText = body.termsText
    if (body.imageUrl !== undefined) promo.imageUrl = body.imageUrl
    if (body.badgeLabel !== undefined) promo.badgeLabel = body.badgeLabel
    if (body.offLabel !== undefined) promo.offLabel = body.offLabel
    if (body.takeawayWarningTitle !== undefined) promo.takeawayWarningTitle = body.takeawayWarningTitle
    if (body.takeawayWarningText !== undefined) promo.takeawayWarningText = body.takeawayWarningText
    if (body.loadingText !== undefined) promo.loadingText = body.loadingText
    if (body.checkoutDiscountLabel !== undefined) promo.checkoutDiscountLabel = body.checkoutDiscountLabel
    if (body.sourceTriggers !== undefined) promo.sourceTriggers = body.sourceTriggers
    if (body.targetTenants !== undefined) promo.targetTenants = body.targetTenants

    await promo.save()
    return NextResponse.json({ promo })
  } catch (error) {
    console.error('[superadmin/qr-promos/[id] PUT]', error)
    return NextResponse.json({ error: 'Error al actualizar QrPromo' }, { status: 500 })
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

    const deleted = await QrPromo.findOneAndDelete({ _id: id, scope: 'global' })
    if (!deleted) {
      return NextResponse.json({ error: 'QrPromo global no encontrada' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[superadmin/qr-promos/[id] DELETE]', error)
    return NextResponse.json({ error: 'Error al eliminar QrPromo' }, { status: 500 })
  }
}
