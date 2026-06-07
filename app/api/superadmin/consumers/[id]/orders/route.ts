import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import Consumer from '@/models/Consumer'
import { safeDecrypt } from '@/lib/crypto'
import { requireSuperAdmin } from '@/lib/apiAuth'
import mongoose from 'mongoose'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireSuperAdmin()
  if (authError) return authError

  try {
    const { id } = await params
    await connectDB()

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const consumer = await Consumer.findById(id).lean()
    if (!consumer) {
      return NextResponse.json({ error: 'Consumidor no encontrado' }, { status: 404 })
    }

    // Find orders by phoneHash or emailHash
    const orderFilter: Record<string, any> = {}
    if (consumer.phoneHash) {
      orderFilter['customer.phoneHash'] = consumer.phoneHash
    }

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)))

    const [orders, totalOrders] = await Promise.all([
      Order.find(orderFilter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Order.countDocuments(orderFilter),
    ])

    // Resolve tenant names
    const tenantIds = [...new Set(orders.map((o) => o.tenantId?.toString()).filter(Boolean))]
    const tenants = await Tenant.find({ _id: { $in: tenantIds } })
      .select('name slug')
      .lean()
    const tenantMap = Object.fromEntries(tenants.map((t) => [t._id.toString(), t]))

    const ordersWithTenant = orders.map((o) => {
      const t = tenantMap[o.tenantId?.toString() || '']
      return {
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
          name: o.customer?.name ? safeDecrypt(o.customer.name) : '',
          email: o.customer?.email ? safeDecrypt(o.customer.email) : '',
          phone: o.customer?.phone ? safeDecrypt(o.customer.phone) : '',
        },
        tenantName: t?.name || 'Desconocido',
        tenantSlug: t?.slug || '',
        createdAt: o.createdAt,
      }
    })

    return NextResponse.json({
      orders: ordersWithTenant,
      total: totalOrders,
      page,
      totalPages: Math.ceil(totalOrders / limit),
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
