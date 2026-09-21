import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import Tenant from '@/models/Tenant'
import LoyaltyMember from '@/models/LoyaltyMember'
import { signMemberToken } from '@/lib/memberToken'
import { hashPhone } from '@/lib/crypto'
import { rateLimit } from '@/lib/rateLimit'

/**
 * POST /api/{tenant}/club-member/reissue-token
 * Re-emite un token JWT para un miembro del club que cambió de celular.
 *
 * Requiere:
 *  - phone: número del miembro (body)
 *  - x-device-id: fingerprint del device (header)
 *
 * Flujo:
 *  1. Rate-limit: 3/hora por phone
 *  2. Buscar miembro por phone
 *  3. Verificar que x-device-id esté en member.deviceFingerprints
 *  4. Si está → emitir nuevo token
 *  5. Si no está → 403 "Device no reconocido"
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    const body = await request.json()
    const { phone } = body
    const deviceId = request.headers.get('x-device-id')

    if (!phone || typeof phone !== 'string') {
      return NextResponse.json({ error: 'phone es requerido' }, { status: 400 })
    }

    if (!deviceId || typeof deviceId !== 'string') {
      return NextResponse.json({ error: 'x-device-id es requerido' }, { status: 400 })
    }

    // 1. Rate-limit: 3/hora por phone
    const rl = await rateLimit(`reissue-token:${phone}`, 3, 60 * 60 * 1000)
    if (!rl.success) {
      return NextResponse.json({ error: 'Demasiados intentos. Intentá en 1 hora.' }, { status: 429 })
    }

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
      .select('_id')
      .lean()
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    // 2. Buscar miembro por phone
    const phoneHashed = hashPhone(phone)
    const member = await LoyaltyMember.findOne({
      tenantId: tenant._id,
      phoneHash: phoneHashed,
      status: 'active',
    }).lean()

    if (!member) {
      return NextResponse.json({ error: 'Miembro no encontrado' }, { status: 404 })
    }

    // 3. Verificar que el device esté en deviceFingerprints
    const knownDevices = (member as any).deviceFingerprints ?? []
    if (!knownDevices.includes(deviceId)) {
      return NextResponse.json({
        error: 'Device no reconocido. Contactá al admin para autorizar este celular.',
        code: 'DEVICE_NOT_RECOGNIZED',
      }, { status: 403 })
    }

    // 4. Emitir nuevo token
    const newToken = await signMemberToken(
      (member as any)._id.toString(),
      tenant._id.toString(),
      phone,
      (member as any).tokenVersion ?? 0,
    )

    return NextResponse.json({
      token: newToken,
      member: {
        id: (member as any)._id.toString(),
        name: (member as any).name,
        phone: (member as any).phone,
        joinedAt: (member as any).joinedAt,
        points: (member as any).loyalty?.points ?? 0,
        tier: (member as any).loyalty?.tier ?? 'none',
      },
    })
  } catch (error) {
    console.error('[club-member/reissue-token]', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
