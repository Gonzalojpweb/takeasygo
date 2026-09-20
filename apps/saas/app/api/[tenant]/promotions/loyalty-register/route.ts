import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import User from '@/models/User'
import LoyaltyMember from '@/models/LoyaltyMember'
import LocationLoyaltyConfig from '@/models/LocationLoyaltyConfig'
import { hashPhone } from '@/lib/crypto'
import { signMemberToken } from '@/lib/memberToken'
import { rateLimit } from '@/lib/rateLimit'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

/** Generate best-effort device fingerprint from request headers */
function generateDeviceId(request: NextRequest): string {
  const ua = request.headers.get('user-agent') || ''
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown'
  // First 3 octets for privacy (avoid storing full IP)
  const ipPrefix = ip.split('.').slice(0, 3).join('.')
  const lang = request.headers.get('accept-language') || ''
  return crypto.createHash('sha256').update(`${ua}|${ipPrefix}|${lang}`).digest('hex').slice(0, 32)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    const body = await request.json()
    const { name, email, phone, promotionId, locationId } = body

    if (!name || !email || !phone) {
      return NextResponse.json({ error: 'Nombre, correo y teléfono son obligatorios' }, { status: 400 })
    }

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug }).select('_id pointsConfig.welcomePoints loyalty.perLocation')
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    // ── Rate-limit: 1 afiliación por device en 24h, 3 por IP en 24h ──────
    const deviceId = generateDeviceId(request)
    const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown'
    const ipPrefix = ip.split('.').slice(0, 3).join('.')
    const DAY_MS = 86_400_000

    const { success: deviceOk } = await rateLimit(`club-register:${tenant._id}:${deviceId}`, 1, DAY_MS)
    if (!deviceOk) {
      return NextResponse.json({ error: 'Demasiadas afiliaciones desde este dispositivo. Intentá mañana.' }, { status: 429 })
    }
    const { success: ipOk } = await rateLimit(`club-register-ip:${tenant._id}:${ipPrefix}`, 3, DAY_MS)
    if (!ipOk) {
      return NextResponse.json({ error: 'Demasiadas afiliaciones desde esta red. Intentá más tarde.' }, { status: 429 })
    }

    const perLocation = (tenant as any).loyalty?.perLocation
    if (perLocation && !locationId) {
      return NextResponse.json({ error: 'Se requiere locationId para este tenant' }, { status: 400 })
    }

    const phoneHash = hashPhone(phone)

    // Buscar users por email y phone por separado para evitar E11000
    const userByEmail = await User.findOne({ email })
    const userByPhone = await User.findOne({ phone })

    let user: typeof userByEmail

    if (userByEmail && userByPhone && userByEmail._id.toString() !== userByPhone._id.toString()) {
      // Conflicto: phone y email pertenecen a users distintos → priorizar el del email
      user = userByEmail
    } else if (userByEmail) {
      user = userByEmail
    } else if (userByPhone) {
      user = userByPhone
    } else {
      // Crear nuevo user
      user = await User.create({
        name,
        phone,
        email,
        role: 'consumer',
        isActive: true,
      })
    }

    // Verificar si ya es miembro del club
    const existing = await LoyaltyMember.findOne({
      tenantId: tenant._id,
      phoneHash,
      ...(perLocation && locationId ? { locationId } : {})
    })

    if (existing) {
      return NextResponse.json({
        error: 'Este número ya está registrado en el club',
        code: 'ALREADY_REGISTERED',
      }, { status: 409 })
    }

    let welcomePoints = (tenant as any).pointsConfig?.welcomePoints ?? 0

    if (perLocation && locationId) {
      const locConfig = await LocationLoyaltyConfig.findOne({ locationId }).lean()
      if (locConfig?.pointsConfig?.welcomePoints != null) {
        welcomePoints = locConfig.pointsConfig.welcomePoints
      }
    }

    // Crear nuevo miembro vinculado al User de TakeasyGo
    const member = await LoyaltyMember.create({
      tenantId: tenant._id,
      userId: user._id,
      name,
      phone,
      phoneHash,
      email,
      source: 'promotion',
      status: 'active',
      joinedAt: new Date(),
      promotionId: promotionId || null,
      'loyalty.points': welcomePoints,
      deviceFingerprints: [deviceId],
      ...(perLocation && locationId ? { locationId } : {})
    })

    // Emitir token de miembro para promo club (JWT, exp 90 días)
    let memberToken: string | null = null
    try {
      memberToken = await signMemberToken(
        member._id.toString(),
        tenant._id.toString(),
        phone,
        member.tokenVersion ?? 1,
      )
    } catch (e) {
      console.error('[memberToken] Failed to sign token:', e)
    }

    return NextResponse.json({
      success: true,
      member: {
        _id: member._id,
        name: member.name,
        publicId: member.wallet?.publicId,
      },
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
      },
      memberToken,
      welcomePoints,
    })

  } catch (error) {
    console.error('Promotion loyalty register error:', error)
    return NextResponse.json({ error: 'Error al registrarse' }, { status: 500 })
  }
}
