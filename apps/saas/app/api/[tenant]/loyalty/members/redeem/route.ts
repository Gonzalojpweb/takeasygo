import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { syncWalletPoints } from '@/lib/walletService'
import LoyaltyMember from '@/models/LoyaltyMember'
import Tenant from '@/models/Tenant'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const body = await request.json()
    const { memberPublicId, points } = body

    if (!memberPublicId) {
      return NextResponse.json({ error: 'Se requiere el ID del miembro' }, { status: 400 })
    }
    if (!points || points <= 0) {
      return NextResponse.json({ error: 'Ingresá una cantidad de puntos válida' }, { status: 400 })
    }

    const member = await LoyaltyMember.findOne({
      'wallet.publicId': memberPublicId,
      tenantId: tenant._id,
    })

    if (!member) {
      return NextResponse.json({ error: 'Miembro no encontrado' }, { status: 404 })
    }

    if (member.status !== 'active') {
      return NextResponse.json({ error: 'El miembro no está activo' }, { status: 400 })
    }

    if (member.loyalty.points < points) {
      return NextResponse.json({
        error: 'Puntos insuficientes',
        currentPoints: member.loyalty.points,
        requestedPoints: points,
      }, { status: 400 })
    }

    await LoyaltyMember.updateOne(
      { _id: member._id },
      {
        $inc: {
          'loyalty.points': -points,
          'store.totalRedemptions': 1,
          'store.totalPointsSpent': points,
        },
        $set: { 'store.lastRedemptionAt': new Date() },
      }
    )

    const syncResult = await syncWalletPoints(member._id).catch(() => null)

    return NextResponse.json({
      success: true,
      redeemedPoints: points,
      newTotal: member.loyalty.points - points,
      syncStatus: syncResult,
      member: {
        name: member.name,
        publicId: member.wallet?.publicId,
      },
    })
  } catch (error) {
    console.error('[loyalty/members/redeem]', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
