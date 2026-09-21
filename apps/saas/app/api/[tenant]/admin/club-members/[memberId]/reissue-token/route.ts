import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { rateLimit } from '@/lib/rateLimit'
import { logAudit } from '@/lib/audit'
import LoyaltyMember from '@/models/LoyaltyMember'
import Tenant from '@/models/Tenant'
import { signMemberToken } from '@/lib/memberToken'

/**
 * POST /api/{tenant}/admin/club-members/{memberId}/reissue-token
 *
 * Re-emite un token JWT para un miembro del club.
 * El admin debe validar la identidad del miembro por WhatsApp/teléfono
 * ANTES de hacer click en "Re-emitir token".
 *
 * Flujo:
 *  1. Admin autenticado
 *  2. Rate-limit: 10 reissues por admin en 1 hora
 *  3. Buscar miembro
 *  4. Emitir nuevo token con tokenVersion actual
 *  5. Audit log
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; memberId: string }> }
) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { tenant: tenantSlug, memberId } = await params
    const isSuperAdmin = session.user.role === 'superadmin'
    const belongsToTenant = session.user.tenantSlug === tenantSlug

    if (!isSuperAdmin && !belongsToTenant) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    // Rate-limit: 10 reissues por admin en 1 hora
    const adminId = (session.user as any).id ?? 'unknown'
    const { success } = await rateLimit(`club-reissue:${adminId}`, 10, 3_600_000)
    if (!success) {
      return NextResponse.json(
        { error: 'Demasiadas solicitudes. Intentá más tarde.' },
        { status: 429 },
      )
    }

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug }).select('_id')
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const member = await LoyaltyMember.findOne({
      _id: memberId,
      tenantId: tenant._id,
    }).lean()

    if (!member) {
      return NextResponse.json({ error: 'Miembro no encontrado' }, { status: 404 })
    }

    // Emitir nuevo token con tokenVersion actual
    const newToken = await signMemberToken(
      (member as any)._id.toString(),
      tenant._id.toString(),
      (member as any).phone,
      (member as any).tokenVersion ?? 0,
    )

    // Audit log
    logAudit({
      tenantId: tenant._id.toString(),
      action: 'club.token.reissued',
      entity: 'loyaltyMember',
      entityId: (member as any)._id.toString(),
      details: {
        memberId: (member as any)._id,
        memberName: (member as any).name,
        memberPhone: (member as any).phone,
        tokenVersion: (member as any).tokenVersion,
        adminName: session.user.name ?? session.user.email,
      },
      request,
    })

    return NextResponse.json({
      success: true,
      token: newToken,
      message: `Token re-emitido para ${(member as any).name}`,
    })
  } catch (error) {
    console.error('Admin reissue token error:', error)
    return NextResponse.json({ error: 'Error al re-emitir token' }, { status: 500 })
  }
}
