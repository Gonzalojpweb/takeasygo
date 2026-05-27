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
      status: 'open',
    })
    if (!order) {
      return NextResponse.json({ error: 'Sesión grupal no encontrada o ya cerrada' }, { status: 404 })
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
      return NextResponse.json({ error: 'Solo el mail de empresa puede cancelar la sesión' }, { status: 403 })
    }

    order.status = 'cancelled'
    order.statusTimestamps = {
      ...order.statusTimestamps,
      cancelledAt: new Date(),
    }
    order.sessionExpiresAt = new Date()
    await order.save()

    return NextResponse.json({ message: 'Sesión cancelada' })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
