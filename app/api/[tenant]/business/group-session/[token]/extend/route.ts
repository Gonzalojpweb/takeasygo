import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import CorporateAccount from '@/models/CorporateAccount'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; token: string }> }
) {
  try {
    const { tenant: tenantSlug, token } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean()
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const order = await Order.findOne({
      tenantId: tenant._id,
      groupSessionToken: token,
    })
    if (!order) {
      return NextResponse.json({ error: 'Sesión grupal no encontrada' }, { status: 404 })
    }

    const body = await request.json()
    const email = body?.email?.toLowerCase().trim()
    if (!email) {
      return NextResponse.json({ error: 'Email requerido' }, { status: 400 })
    }

    const corpAccount = await CorporateAccount.findOne({
      _id: order.corporateAccountId,
      status: 'active',
    }).lean()

    if (!corpAccount || corpAccount.companyAdminEmail.toLowerCase() !== email) {
      return NextResponse.json({ error: 'Solo el mail de empresa puede extender la sesión' }, { status: 403 })
    }

    const extraMinutes = Math.min(Math.max(15, body.extraMinutes || 30), 120)
    const newExpiresAt = new Date(Date.now() + extraMinutes * 60 * 1000)
    order.sessionExpiresAt = newExpiresAt

    if (order.status === 'open') {
      await order.save()
    } else {
      order.status = 'open'
      await order.save()
    }

    return NextResponse.json({
      sessionExpiresAt: newExpiresAt.toISOString(),
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
