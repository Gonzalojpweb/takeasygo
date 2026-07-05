import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import Consumer from '@/models/Consumer'
import { safeDecrypt } from '@/lib/crypto'
import { requireAuth } from '@/lib/apiAuth'
import { canAccess } from '@takeasygo/business'
import mongoose from 'mongoose'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; id: string }> }
) {
  try {
    const { tenant: tenantSlug, id } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, status: { $in: ['active', 'paused'] } })
    if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    if (!canAccess(tenant.plan, 'crm')) {
      return NextResponse.json({ error: 'CRM no disponible en tu plan actual.' }, { status: 403 })
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const consumer = await Consumer.findOne({ _id: id, tenantIds: tenant._id }).lean()
    if (!consumer) {
      return NextResponse.json({ error: 'Consumidor no encontrado' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)))

    const orderFilter: Record<string, any> = {
      tenantId: tenant._id,
      deletedAt: null,
    }

    if (consumer.customerId) {
      orderFilter['customer.customerId'] = consumer.customerId
    } else if (consumer.phoneHash) {
      orderFilter['customer.phoneHash'] = consumer.phoneHash
    }

    const [orders, totalOrders] = await Promise.all([
      Order.find(orderFilter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Order.countDocuments(orderFilter),
    ])

    const ordersDecrypted = orders.map((o) => ({
      _id: o._id,
      orderNumber: o.orderNumber,
      status: o.status,
      total: o.total,
      subtotal: o.subtotal,
      items: o.items.map((i: any) => ({
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        subtotal: i.subtotal,
      })),
      customer: {
        customerId: o.customer?.customerId ?? null,
        name: o.customer?.name ? safeDecrypt(o.customer.name) : '',
        email: o.customer?.email ? safeDecrypt(o.customer.email) : '',
        phone: o.customer?.phone ? safeDecrypt(o.customer.phone) : '',
      },
      createdAt: o.createdAt,
    }))

    return NextResponse.json({
      orders: ordersDecrypted,
      total: totalOrders,
      page,
      totalPages: Math.ceil(totalOrders / limit),
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
