import { NextRequest, NextResponse } from 'next/server'
import type { Types } from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import LoyaltyMember from '@/models/LoyaltyMember'
import LocationLoyaltyConfig from '@/models/LocationLoyaltyConfig'
import { rateLimit } from '@/lib/rateLimit'
import { displayName, isProgramOpen, loadProgram, normalizeCode } from '@/lib/referrals'

/**
 * GET /api/{tenant}/referrals/code/{code} — PÚBLICO (página del link de invitación)
 *
 * Qué ve el invitado al abrir el link: quién lo invitó (solo nombre e
 * inicial), el club y los puntos de bienvenida. No expone teléfono, email
 * ni ningún dato del miembro. Rate limit por IP.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ tenant: string; code: string }> }) {
  try {
    const { tenant: slug, code: rawCode } = await params
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const { success } = await rateLimit(`referral-code:${ip}`, 30, 60_000)
    if (!success) return NextResponse.json({ error: 'Demasiadas consultas. Esperá un minuto.' }, { status: 429 })

    const code = normalizeCode(rawCode)
    if (!code) return NextResponse.json({ valid: false, reason: 'invalid_code' })

    await connectDB()
    const tenant = await Tenant.findOne({ slug, isActive: true })
      .select('_id name loyalty.enabled loyalty.clubName loyalty.perLocation pointsConfig.welcomePoints branding.logoUrl branding.primaryColor')
      .lean<{
        _id: Types.ObjectId
        name: string
        loyalty?: { enabled?: boolean; clubName?: string; perLocation?: boolean }
        pointsConfig?: { welcomePoints?: number }
        branding?: { logoUrl?: string; primaryColor?: string }
      }>()
    if (!tenant) return NextResponse.json({ error: 'Comercio no encontrado' }, { status: 404 })

    const program = await loadProgram(tenant._id)
    if (!tenant.loyalty?.enabled || !isProgramOpen(program)) return NextResponse.json({ valid: false, reason: 'program_closed' })

    const referrer = await LoyaltyMember.findOne({ tenantId: tenant._id, referralCode: code, status: 'active' })
      .select('name locationId')
      .lean<{ name: string; locationId?: Types.ObjectId | null }>()
    if (!referrer) return NextResponse.json({ valid: false, reason: 'invalid_code' })

    let welcomePoints = tenant.pointsConfig?.welcomePoints ?? 0
    if (tenant.loyalty?.perLocation && referrer.locationId) {
      const loc = await LocationLoyaltyConfig.findOne({ locationId: referrer.locationId })
        .select('pointsConfig.welcomePoints')
        .lean<{ pointsConfig?: { welcomePoints?: number | null } }>()
      if (loc?.pointsConfig?.welcomePoints != null) welcomePoints = loc.pointsConfig.welcomePoints
    }

    return NextResponse.json({
      valid: true,
      code,
      referrerName: displayName(referrer.name).split(' ')[0],
      clubName: tenant.loyalty?.clubName || `Club ${tenant.name}`,
      tenantName: tenant.name,
      logoUrl: tenant.branding?.logoUrl || null,
      primaryColor: tenant.branding?.primaryColor || null,
      welcomePoints,
      // La sede del club del que invita (clubes por sede).
      locationId: tenant.loyalty?.perLocation && referrer.locationId ? String(referrer.locationId) : null,
    })
  } catch (error) {
    console.error('[referrals/code]', error)
    return NextResponse.json({ error: 'Error al cargar la invitación' }, { status: 500 })
  }
}
