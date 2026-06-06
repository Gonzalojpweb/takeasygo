import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import QrPromo from '@/models/QrPromo'
import QrPromoView from '@/models/QrPromoView'
import { NextRequest, NextResponse } from 'next/server'

interface PromoShape {
  isEnabled: boolean
  type: string
  discountPercentage: number
  frequency: string
  title: string
  subtitle: string
  buttonText: string
  termsText: string
  imageUrl?: string
  badgeLabel?: string
  offLabel?: string
  takeawayWarningTitle?: string
  takeawayWarningText?: string
  loadingText?: string
  checkoutDiscountLabel?: string
  sourceTriggers?: string[]
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    const { searchParams } = new URL(request.url)
    const source = searchParams.get('source') || ''
    const promoSlug = searchParams.get('promo') || ''

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug }).select('qrPromo loyaltyMessaging _id name')
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    // ── Resolución multicapa de la promo activa ─────────────────────
    // Orden: 1) slug exacto, 2) match por source, 3) fallback última habilitada, 4) legacy
    let qrPromoConfig: PromoShape | null = null
    let matchedBy: string | null = null

    if (promoSlug) {
      const found = await QrPromo.findOne({
        tenantId: tenant._id,
        slug: promoSlug.toLowerCase().trim(),
        isEnabled: true,
      }).lean()
      if (found) {
        qrPromoConfig = found
        matchedBy = 'slug'
      }
    }

    if (!qrPromoConfig && source) {
      const found = await QrPromo.findOne({
        tenantId: tenant._id,
        sourceTriggers: source,
        isEnabled: true,
      }).lean()
      if (found) {
        qrPromoConfig = found
        matchedBy = 'source'
      }
    }

    if (!qrPromoConfig) {
      const firstEnabled = await QrPromo.findOne({ tenantId: tenant._id, isEnabled: true })
        .sort({ createdAt: -1 })
        .lean()
      if (firstEnabled) {
        qrPromoConfig = firstEnabled
        matchedBy = 'default'
      }
    }

    if (!qrPromoConfig) {
      qrPromoConfig = tenant.qrPromo
      if (qrPromoConfig?.isEnabled) matchedBy = 'legacy'
    }

    if (!qrPromoConfig || !qrPromoConfig.isEnabled) {
      return NextResponse.json({ show: false, reason: 'not_enabled' })
    }

    const forwarded = request.headers.get('x-forwarded-for')
    const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown'

    if (qrPromoConfig.frequency !== 'every_visit') {
      if (qrPromoConfig.frequency === 'once') {
        const existingView = await QrPromoView.findOne({ tenantId: tenant._id, ip })
        if (existingView) {
          return NextResponse.json({ show: false, reason: 'already_viewed' })
        }
      } else if (qrPromoConfig.frequency === 'daily') {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const existingView = await QrPromoView.findOne({
          tenantId: tenant._id,
          ip,
          viewedAt: { $gte: today }
        })
        if (existingView) {
          return NextResponse.json({ show: false, reason: 'already_viewed_today' })
        }
      }
    }

    const discountPct = qrPromoConfig.discountPercentage || 0
    const subtitle = (qrPromoConfig.subtitle || '').replace('{discount}', String(discountPct))

    return NextResponse.json({
      show: true,
      promo: {
        ...qrPromoConfig,
        subtitle,
        discountPercentage: discountPct,
      },
      loyaltyMessaging: tenant.loyaltyMessaging,
      tenantName: tenant.name,
    })
  } catch (error) {
    console.error('QR Promo GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    const body = await request.json()
    const { source } = body

    const forwarded = request.headers.get('x-forwarded-for')
    const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown'
    const userAgent = request.headers.get('user-agent') || ''

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug }).select('_id')
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    // Buscar si hay una promo activa en la colección QrPromo
    const activePromo = await QrPromo.findOne({
      tenantId: tenant._id,
      isEnabled: true,
    }).sort({ createdAt: -1 }).lean()

    await QrPromoView.create({
      tenantId: tenant._id,
      ip,
      userAgent,
      source,
      viewedAt: new Date(),
      discountPercentage: activePromo?.discountPercentage || 0,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('QR Promo POST error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
