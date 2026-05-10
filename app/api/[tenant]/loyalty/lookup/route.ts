import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import Tenant from '@/models/Tenant'
import LoyaltyMember from '@/models/LoyaltyMember'
import { hashPhone } from '@/lib/crypto'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    const { searchParams } = new URL(request.url)
    const phone = searchParams.get('phone')
    const publicId = searchParams.get('publicId')

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
      .select('_id loyalty wallet branding')
      .lean()

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    if (!tenant.loyalty?.enabled) {
      return NextResponse.json({ error: 'Club de fidelización no activo' }, { status: 400 })
    }

    let member: any = null

    if (publicId) {
      member = await LoyaltyMember.findOne({
        'wallet.publicId': publicId,
        tenantId: tenant._id,
        status: 'active'
      }).lean()
      member = await LoyaltyMember.findOne({
        phoneHash,
        tenantId: tenant._id,
        status: 'active'
      }).lean()
    }

    // Si no se encontró por teléfono o ID, intentamos por email (si se proveyó)
    if (!member) {
      const email = searchParams.get('email')
      if (email) {
        member = await LoyaltyMember.findOne({
          email: email.toLowerCase().trim(),
          tenantId: tenant._id,
          status: 'active'
        }).lean()
      }
    }

    if (!member) {
      return NextResponse.json({ error: 'Miembro no encontrado' }, { status: 404 })
    }

    return NextResponse.json({
      member: {
        name: member.name,
        publicId: member.wallet.publicId,
        points: member.loyalty.points,
        tier: member.loyalty.tier,
        totalOrders: member.cache?.totalOrders || 0,
        totalSpent: member.cache?.totalSpent || 0,
        joinedAt: member.joinedAt,
      },
      club: {
        name: tenant.loyalty.clubName || `Club ${tenant.name}`,
        welcomeMessage: tenant.loyalty.welcomeMessage,
      },
      wallet: tenant.wallet ? {
        enabled: tenant.wallet.enabled,
        cardColor: tenant.wallet.cardColor,
        labelColor: tenant.wallet.labelColor,
        logoUrl: tenant.wallet.logoUrl || tenant.branding?.logoUrl || '',
      } : null,
    })
  } catch (error) {
    console.error('[loyalty/lookup]', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
