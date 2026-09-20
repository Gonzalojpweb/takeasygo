import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import User from '@/models/User'
import LoyaltyMember from '@/models/LoyaltyMember'
import { hashPhone } from '@/lib/crypto'
import { signMemberToken } from '@/lib/memberToken'
import { rateLimit } from '@/lib/rateLimit'
import { requireLocationId } from '@/lib/loyalty-location'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

/** Generate best-effort device fingerprint from request headers */
function generateDeviceId(request: NextRequest): string {
  const ua = request.headers.get('user-agent') || ''
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown'
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
    const { name, email, phone, source = 'qr_scan' } = body

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

    let locationId: import('mongoose').Types.ObjectId | null = null
    try {
      locationId = await requireLocationId(tenant._id, body.locationId, 'loyalty register')
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }

    const phoneHash = hashPhone(phone)

    // Verificar si ya existe
    const existing = await LoyaltyMember.findOne({
      tenantId: tenant._id,
      phoneHash,
      ...(locationId ? { locationId } : {})
    })

    if (existing) {
      // Member existe: aggiornar deviceFingerprints con FIFO (máx 3)
      const current = (existing as any).deviceFingerprints || []
      if (!current.includes(deviceId)) {
        const updated = [...current, deviceId].slice(-3) // FIFO: últimos 3
        await LoyaltyMember.updateOne(
          { _id: existing._id },
          { $set: { deviceFingerprints: updated } },
        )
      }

      // Re-emitir token para member existente
      let memberToken: string | null = null
      try {
        memberToken = await signMemberToken(
          existing._id.toString(),
          tenant._id.toString(),
          phone,
          (existing as any).tokenVersion ?? 1,
        )
      } catch (e) {
        console.error('[memberToken] Failed to re-sign token:', e)
      }

      return NextResponse.json({
        success: true,
        member: {
          _id: existing._id,
          name: (existing as any).name,
          publicId: (existing as any).wallet?.publicId,
        },
        memberToken,
        welcomePoints: 0,
        reissued: true,
      })
    }

    // Crear o encontrar User vinculado (por phone o email)
    let user = await User.findOne({ $or: [{ phone }, { email }] })
    if (!user) {
      user = await User.create({
        name,
        phone,
        email,
        role: 'consumer',
        isActive: true,
      })
    } else {
      if (user.phone !== phone) {
        await User.updateOne({ _id: user._id }, { $set: { phone } })
        user.phone = phone
      }
      if (user.email !== email) {
        await User.updateOne({ _id: user._id }, { $set: { email } })
        user.email = email
      }
    }

    const welcomePoints = (tenant as any).pointsConfig?.welcomePoints ?? 0

    // Crear nuevo miembro
    const member = await LoyaltyMember.create({
      tenantId: tenant._id,
      userId: user._id,
      name,
      phone,
      phoneHash,
      email,
      source,
      status: 'active',
      joinedAt: new Date(),
      'loyalty.points': welcomePoints,
      deviceFingerprints: [deviceId],
      ...(locationId ? { locationId } : {})
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
        publicId: member.wallet?.publicId
      },
      memberToken,
      welcomePoints
    })

  } catch (error) {
    console.error('Loyalty register error:', error)
    return NextResponse.json({ error: 'Error al registrarse' }, { status: 500 })
  }
}
