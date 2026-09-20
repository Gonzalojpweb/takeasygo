import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import LoyaltyMember from '@/models/LoyaltyMember'
import Tenant from '@/models/Tenant'

/**
 * POST /api/{tenant}/admin/club-members/{memberId}/revoke-token
 *
 * Invalida todos los tokens JWT existentes de un miembro incrementando tokenVersion.
 * El miembro deberá re-registrarse para obtener un nuevo token.
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

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug }).select('_id')
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const member = await LoyaltyMember.findOneAndUpdate(
      { _id: memberId, tenantId: tenant._id },
      { $inc: { tokenVersion: 1 } },
      { new: true },
    ).select('_id name tokenVersion')

    if (!member) {
      return NextResponse.json({ error: 'Miembro no encontrado' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      message: `Token revocado. Nueva versión: ${member.tokenVersion}`,
      memberId: member._id,
      tokenVersion: member.tokenVersion,
    })
  } catch (error) {
    console.error('Revoke token error:', error)
    return NextResponse.json({ error: 'Error al revocar token' }, { status: 500 })
  }
}
