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

function addSchedulingFilter(query: any) {
  const now = new Date()
  const scheduleFilter: any[] = [
    { scheduledStart: null },
    { scheduledStart: { $lte: now } },
  ]
  const endFilter: any[] = [
    { scheduledEnd: null },
    { scheduledEnd: { $gte: now } },
  ]
  query.$and = [
    { $or: scheduleFilter },
    { $or: endFilter },
  ]
  return query
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

    const tenantId = tenant._id

    // ── Helper to find a matching promo with scheduling filter ──────────
    async function findPromo(query: any): Promise<PromoShape | null> {
      query.isEnabled = true
      addSchedulingFilter(query)
      const found = await QrPromo.findOne(query).lean()
      return found
    }

    // ── Resolución multicapa ───────────────────────────────────────────
    let qrPromoConfig: PromoShape | null = null
    let matchedBy: string | null = null

    // 1) Slug exacto: busca en tenant + global
    if (promoSlug) {
      qrPromoConfig = await findPromo({
        $or: [
          { scope: 'tenant', tenantId },
          { scope: 'global', $or: [{ targetTenants: tenantId }, { targetTenants: { $size: 0 } }] },
        ],
        slug: promoSlug.toLowerCase().trim(),
      })
      if (qrPromoConfig) matchedBy = 'slug'
    }

    // 2) Por source trigger: tenant first, then global
    if (!qrPromoConfig && source) {
      qrPromoConfig = await findPromo({
        scope: 'tenant',
        tenantId,
        sourceTriggers: source,
      })
      if (qrPromoConfig) {
        matchedBy = 'source'
      } else {
        qrPromoConfig = await findPromo({
          scope: 'global',
          $or: [{ targetTenants: tenantId }, { targetTenants: { $size: 0 } }],
          sourceTriggers: source,
        })
        if (qrPromoConfig) matchedBy = 'source_global'
      }
    }

    // 3) Default: última habilitada del tenant, luego global
    if (!qrPromoConfig) {
      qrPromoConfig = await findPromo({ scope: 'tenant', tenantId })
        .then(f => f || findPromo({
          scope: 'global',
          $or: [{ targetTenants: tenantId }, { targetTenants: { $size: 0 } }],
        }))
      if (qrPromoConfig) matchedBy = 'default'
    }

    // 4) Legacy fallback
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

    const activePromo = await QrPromo.findOne({
      scope: 'tenant',
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
