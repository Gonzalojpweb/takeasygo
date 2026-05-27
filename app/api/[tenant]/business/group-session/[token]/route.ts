import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import CorporateAccount from '@/models/CorporateAccount'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
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
    }).lean()

    if (!order) {
      return NextResponse.json({ error: 'Sesión grupal no encontrada' }, { status: 404 })
    }

    const isExpired = order.sessionExpiresAt && new Date(order.sessionExpiresAt) < new Date()
    const isActive = order.status === 'open' && !isExpired

    const corpAccount = await CorporateAccount.findById(order.corporateAccountId).lean()

    // Group items by email
    const itemsByEmail: Record<string, any[]> = {}
    for (const item of (order.items as any[]) || []) {
      const email = item.addedByEmail || 'unknown'
      if (!itemsByEmail[email]) itemsByEmail[email] = []
      itemsByEmail[email].push(item)
    }

    return NextResponse.json({
      session: {
        token,
        status: isActive ? 'active' : order.status === 'open' ? 'expired' : order.status,
        sessionExpiresAt: order.sessionExpiresAt?.toISOString?.() ?? order.sessionExpiresAt,
        orderId: order._id.toString(),
        companyName: corpAccount?.companyName ?? '',
        companyAdminEmail: corpAccount?.companyAdminEmail ?? '',
        paymentMode: order.paymentModeSnapshot,
        items: order.items,
        itemsByEmail,
        total: order.total,
        subtotal: order.subtotal,
      }
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
