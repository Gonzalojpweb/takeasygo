import { connectDB } from '@/lib/mongoose'
import { rateLimit } from '@/lib/rateLimit'
import { logVisitSchema } from '@/lib/schemas'
import Tenant from '@/models/Tenant'
import MenuVisit from '@/models/MenuVisit'
import { NextRequest, NextResponse } from 'next/server'
import { Types } from 'mongoose'

const DEDUP_WINDOW_MINUTES = 5
const VALID_SOURCES = ['instagram', 'facebook', 'qr', 'whatsapp', 'google', 'direct', 'other']

function getDeviceType(userAgent: string | null): 'mobile' | 'desktop' | 'unknown' {
  if (!userAgent) return 'unknown'
  const ua = userAgent.toLowerCase()
  if (/mobile|android|iphone|ipod|blackberry|windows phone/i.test(ua)) return 'mobile'
  if (/tablet|ipad|playbook|silk/i.test(ua)) return 'desktop'
  if (/bot|crawler|spider|crawl/i.test(ua)) return 'unknown'
  return 'desktop'
}

function extractBaseSource(raw: string): string {
  const lower = raw.toLowerCase()
  if (VALID_SOURCES.includes(lower)) return lower
  const prefix = lower.split('-')[0]
  if (VALID_SOURCES.includes(prefix)) return prefix
  return lower
}

function detectTrafficSource(
  referer: string | null,
  urlSource: string | null,
  userAgent: string | null
): string {
  if (urlSource) {
    return extractBaseSource(urlSource)
  }

  if (userAgent) {
    const ua = userAgent.toLowerCase()
    if (ua.includes('instagram')) return 'instagram'
  }

  if (referer) {
    const ref = referer.toLowerCase()
    if (ref.includes('instagram.com')) return 'instagram'
    if (ref.includes('facebook.com') || ref.includes('fb.com')) return 'facebook'
    if (ref.includes('whatsapp.com') || ref.includes('wa.me')) return 'whatsapp'
    if (ref.includes('google.com')) return 'google'
  }

  if (!referer || referer === '') {
    return 'direct'
  }

  return 'other'
}

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


    const { tenantSlug, locationPath, promo: bodyPromo } = parsed.data

    const ip = request.headers.get('x-forwarded-for')
      || request.headers.get('cf-connecting-ip')
      || null
    const cleanIp = ip?.split(',')[0]?.trim() || null
    const userAgent = request.headers.get('user-agent')
    const referer = request.headers.get('referer')
    const urlSource = request.nextUrl.searchParams.get('source')
    const promo = request.nextUrl.searchParams.get('promo') || bodyPromo || null

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

    // Dedup: buscar si el mismo IP visitó en los últimos 5 minutos
    let isDuplicate = false
    if (cleanIp) {
      const recentWindow = new Date(Date.now() - DEDUP_WINDOW_MINUTES * 60 * 1000)
      const existing = await MenuVisit.findOne({
        tenantId,
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
