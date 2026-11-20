import { connectDB } from '@/lib/mongoose'
import { rateLimit } from '@/lib/rateLimit'
import { logVisitSchema } from '@/lib/schemas'
import Tenant from '@/models/Tenant'
import MenuVisit from '@/models/MenuVisit'
import { NextRequest, NextResponse } from 'next/server'
import { Types } from 'mongoose'
import { detectTrafficSource, externalReferrer, getDeviceType, resolveVisitLocation } from '@/lib/visits/attribution'

// Sede y origen: ver lib/visits/attribution.ts (corrección del 20/11/2026).

const DEDUP_WINDOW_MINUTES = 5

export async function POST(request: NextRequest) {
  try {
    const text = await request.text()
    let body: any
    try {
      body = JSON.parse(text)
    } catch {
      return NextResponse.json({ ok: false }, { status: 400 })
    }

    const parsed = logVisitSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ ok: false }, { status: 400 })
    }

    const { tenantSlug, locationPath, promo: bodyPromo, source: bodySource, referrer: bodyReferrer } = parsed.data

    const ip = request.headers.get('x-forwarded-for')
      || request.headers.get('cf-connecting-ip')
      || null
    const cleanIp = ip?.split(',')[0]?.trim() || null
    const userAgent = request.headers.get('user-agent')
    // De dónde llegó la persona: lo manda el cliente (document.referrer). El
    // header Referer del beacon es la propia página del menú y no sirve.
    const referer = externalReferrer(bodyReferrer, request.nextUrl.host)
    const urlSource = bodySource || request.nextUrl.searchParams.get('source')
    const promo = bodyPromo || request.nextUrl.searchParams.get('promo') || null

    // Rate limit: IP + tenantSlug para evitar bloquear tráfico legítimo de un WiFi compartido
    const identifier = `visit_log:${tenantSlug}:${cleanIp || 'unknown'}`
    const rl = await rateLimit(identifier, 30, 60_000)
    if (!rl.success) {
      return NextResponse.json({ ok: false })
    }

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug }).select('_id').lean()
    if (!tenant) {
      return NextResponse.json({ ok: false })
    }

    const source = detectTrafficSource(referer, urlSource, userAgent)
    const tenantId = new Types.ObjectId(tenant._id.toString())

    // Sede visitada (validada contra el tenant): por slug, por _id (direcciones
    // viejas) o, en el link general /{tenant}/menu, la única sede activa.
    const locationId = await resolveVisitLocation(tenantId, locationPath ?? null)

    // Dedup: buscar si el mismo IP visitó en los últimos 5 minutos
    let isDuplicate = false
    if (cleanIp) {
      const recentWindow = new Date(Date.now() - DEDUP_WINDOW_MINUTES * 60 * 1000)
      const existing = await MenuVisit.findOne({
        tenantId,
        locationId,
        ip: cleanIp,
        visitedAt: { $gte: recentWindow },
      }).sort({ visitedAt: -1 }).lean()

      if (existing) {
        isDuplicate = true
      }
    }

    if (!isDuplicate) {
      await MenuVisit.create({
        tenantId,
        visitedAt: new Date(),
        ip: cleanIp,
        userAgent,
        deviceType: getDeviceType(userAgent),
        source,
        referrer: referer,
        locationPath: locationPath || null,
        locationId,
        isDuplicate: false,
        promo,
      })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[visits/log]', error)
    return NextResponse.json({ ok: false })
  }
}
