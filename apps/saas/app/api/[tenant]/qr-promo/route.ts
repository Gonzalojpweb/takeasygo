import { connectDB } from '@/lib/mongoose'
import mongoose from 'mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import QrPromo from '@/models/QrPromo'
import QrPromoView from '@/models/QrPromoView'
import { NextRequest, NextResponse } from 'next/server'

interface PromoShape {
  _id: string
  slug: string
  scope: string
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
  locationId?: string | null
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

// Acota la resolución de promos del tenant a una sede concreta.
// null (explícito) o falta del campo = aplica en todas las sedes.
function locationScopeFilter(locationId: string | null): Record<string, any> | null {
  if (!locationId || !mongoose.Types.ObjectId.isValid(locationId)) return null
  const oid = new mongoose.Types.ObjectId(locationId)
  return { $or: [{ locationId: oid }, { locationId: null }, { locationId: { $exists: false } }] }
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
    const locationParam = searchParams.get('locationId') || ''

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug }).select('qrPromo loyaltyMessaging _id name')
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const tenantId = tenant._id

    // ── Sede: supresión de captación y scope de resolución ───────────────
    // Si la URL trae locationId, la promo NUNCA se muestra en sedes sin
    // captación habilitada (inactiva, pausada o acceptsOrders=false).
    let locationScope: Record<string, any> | null = null
    if (locationParam) {
      if (!mongoose.Types.ObjectId.isValid(locationParam)) {
        return NextResponse.json({ show: false, reason: 'location_not_available' })
      }
      const loc = await Location.findOne({
        _id: locationParam,
        tenantId,
        isActive: true,
      }).lean() as any
      const available = loc && loc.status !== 'paused' && loc.settings?.acceptsOrders !== false
      if (!available) {
        return NextResponse.json({ show: false, reason: 'location_not_available' })
      }
      locationScope = locationScopeFilter(locationParam)
    }

    // ── Helper to find a matching promo with scheduling filter ──────────
    async function findPromo(query: any, sort?: Record<string, 1 | -1>): Promise<PromoShape | null> {
      query.isEnabled = true
      addSchedulingFilter(query)
      const found = await QrPromo.findOne(query).sort(sort || { createdAt: -1 }).lean()
      return found
    }

    // ── Resolución multicapa ───────────────────────────────────────────
    let qrPromoConfig: PromoShape | null = null
    let matchedBy: string | null = null

    // 1) Slug exacto: busca en tenant (scoped por sede) + global
    if (promoSlug) {
      qrPromoConfig = await findPromo({
        $or: [
          { scope: 'tenant', tenantId, ...(locationScope ?? {}) },
          { scope: 'global', $or: [{ targetTenants: tenantId }, { targetTenants: { $size: 0 } }], ...(locationScope ?? {}) },
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
        ...(locationScope ?? {}),
        sourceTriggers: source,
      })
      if (qrPromoConfig) {
        matchedBy = 'source'
      } else {
        qrPromoConfig = await findPromo({
          scope: 'global',
          $or: [{ targetTenants: tenantId }, { targetTenants: { $size: 0 } }],
          ...(locationScope ?? {}),
          sourceTriggers: source,
        })
        if (qrPromoConfig) matchedBy = 'source_global'
      }
    }

    // 3) Default: última habilitada del tenant (scoped por sede), luego global
    if (!qrPromoConfig) {
      qrPromoConfig = await findPromo({ scope: 'tenant', tenantId, ...(locationScope ?? {}) })
        .then(f => f || findPromo({
          scope: 'global',
          $or: [{ targetTenants: tenantId }, { targetTenants: { $size: 0 } }],
          ...(locationScope ?? {}),
        }))
      if (qrPromoConfig) matchedBy = 'default'
    }

    // 4) Legacy fallback
    if (!qrPromoConfig && (tenant as any).qrPromo?.isEnabled) {
      const legacy = (tenant as any).qrPromo
      qrPromoConfig = {
        _id: 'legacy',
        slug: 'legacy',
        scope: 'tenant',
        ...legacy,
      }
      matchedBy = 'legacy'
    }

    if (!qrPromoConfig || !qrPromoConfig.isEnabled) {
      return NextResponse.json({ show: false, reason: 'not_enabled' })
    }

    const forwarded = request.headers.get('x-forwarded-for')
    const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown'
    const promoId = qrPromoConfig._id
    const resolvedSlug = qrPromoConfig.slug

    if (qrPromoConfig.frequency !== 'every_visit') {
      const viewFilter: Record<string, any> = {
        tenantId: tenant._id,
        ip,
        promoId,
      }

      if (qrPromoConfig.frequency === 'once') {
        const existingView = await QrPromoView.findOne(viewFilter)
        if (existingView) {
          return NextResponse.json({ show: false, reason: 'already_viewed' })
        }
      } else if (qrPromoConfig.frequency === 'daily') {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        viewFilter.viewedAt = { $gte: today }
        const existingView = await QrPromoView.findOne(viewFilter)
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
        slug: resolvedSlug,
      },
      resolvedSlug,
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
    const { source, promoSlug, locationId } = body

    const forwarded = request.headers.get('x-forwarded-for')
    const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown'
    const userAgent = request.headers.get('user-agent') || ''

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug }).select('_id')
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const tenantId = tenant._id

    // Atribución de sede: solo se persiste si la sede existe y pertenece al tenant
    let viewLocationId: mongoose.Types.ObjectId | null = null
    if (locationId && typeof locationId === 'string' && mongoose.Types.ObjectId.isValid(locationId)) {
      const loc = await Location.findOne({ _id: locationId, tenantId, isActive: true }).select('_id').lean()
      if (loc) viewLocationId = new mongoose.Types.ObjectId(locationId)
    }

    async function findPromo(query: any): Promise<any> {
      query.isEnabled = true
      addSchedulingFilter(query)
      return QrPromo.findOne(query).sort({ createdAt: -1 }).lean()
    }

    let resolvedPromo: any = null

    if (promoSlug) {
      resolvedPromo = await findPromo({
        $or: [
          { scope: 'tenant', tenantId },
          { scope: 'global', $or: [{ targetTenants: tenantId }, { targetTenants: { $size: 0 } }] },
        ],
        slug: promoSlug.toLowerCase().trim(),
      })
    }

    if (!resolvedPromo && source) {
      resolvedPromo = await findPromo({ scope: 'tenant', tenantId, sourceTriggers: source })
      if (!resolvedPromo) {
        resolvedPromo = await findPromo({
          scope: 'global',
          $or: [{ targetTenants: tenantId }, { targetTenants: { $size: 0 } }],
          sourceTriggers: source,
        })
      }
    }

    if (!resolvedPromo) {
      resolvedPromo = await findPromo({ scope: 'tenant', tenantId })
      if (!resolvedPromo) {
        resolvedPromo = await findPromo({
          scope: 'global',
          $or: [{ targetTenants: tenantId }, { targetTenants: { $size: 0 } }],
        })
      }
    }

    await QrPromoView.create({
      tenantId,
      locationId: viewLocationId,
      promoId: resolvedPromo?._id || null,
      promoSlug: resolvedPromo?.slug || promoSlug || '',
      scope: resolvedPromo?.scope || 'tenant',
      ip,
      userAgent,
      source: source || '',
      viewedAt: new Date(),
      discountPercentage: resolvedPromo?.discountPercentage || 0,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('QR Promo POST error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
