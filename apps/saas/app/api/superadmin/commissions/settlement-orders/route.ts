import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import Order from '@/models/Order'
import { requireSuperAdmin } from '@/lib/apiAuth'
import type { Types } from 'mongoose'

interface SettlementOrderLean {
  _id: Types.ObjectId
  orderNumber?: string
  status?: string
  total?: number
  payment?: { method?: string; platformFeeAmount?: number }
  statusTimestamps?: { confirmedAt?: Date }
  createdAt?: Date
}

/**
 * GET /api/superadmin/commissions/settlement-orders?ids=id1,id2,...
 *
 * Detalle de las órdenes cubiertas por uno o más CommissionSettlement
 * (conciliación de cobros de comisiones). Máximo 200 ids por llamada.
 */
export async function GET(request: NextRequest) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    await connectDB()

    const idsParam = request.nextUrl.searchParams.get('ids') || ''
    const ids = idsParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 200)

    if (ids.length === 0) return NextResponse.json({ orders: [] })

    const orders = await Order.find({ _id: { $in: ids } })
      .select(
        'orderNumber status total payment.method payment.platformFeeAmount statusTimestamps.confirmedAt createdAt'
      )
      .sort({ 'statusTimestamps.confirmedAt': -1 })
      .lean<SettlementOrderLean[]>()

    return NextResponse.json({
      orders: orders.map((o) => ({
        _id: o._id.toString(),
        orderNumber: o.orderNumber || o._id.toString().slice(-6).toUpperCase(),
        method: o.payment?.method || '—',
        fee: o.payment?.platformFeeAmount || 0,
        total: o.total || 0,
        status: o.status || '—',
        confirmedAt:
          (o.statusTimestamps?.confirmedAt || o.createdAt)?.toISOString() || null,
      })),
    })
  } catch (error) {
    console.error('[superadmin/commissions/settlement-orders GET]', error)
    return NextResponse.json({ error: 'Error al obtener órdenes' }, { status: 500 })
  }
}
