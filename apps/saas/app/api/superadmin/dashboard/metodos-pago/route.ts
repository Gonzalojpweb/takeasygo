/**
 * Superadmin Dashboard — Métodos de Pago
 *
 * GET /api/superadmin/dashboard/metodos-pago
 *
 * Returns payment method distribution for today
 * Uses only Order model to avoid TDZ.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdminByToken } from '@/lib/superadmin-token-guard'

function startOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

export async function GET(request: NextRequest) {
  try {
    // Auth
    // Superadmin por cookie (sin auth(): TDZ de chunks) — lib/superadmin-token-guard
    const authError = await requireSuperAdminByToken(request, 'dashboard')
    if (authError) return authError

    // Data imports - only Order
    const mongooseMod = await import('mongoose')
    const mongoose = mongooseMod.default ?? mongooseMod
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGODB_URI!)
    }

    const OrderMod = await import('@/models/Order')
    const Order = OrderMod.default

    const now = new Date()
    const todayStart = startOfDay(now)

    let metodosPago: Array<{ method: string; count: number; totalCents: number }> = []
    try {
      const raw = await Order.aggregate([
        { $match: { createdAt: { $gte: todayStart }, status: { $ne: 'cancelled' }, 'payment.status': 'approved' } },
        { $group: { _id: '$payment.method', count: { $sum: 1 }, total: { $sum: '$total' } } },
      ])
      metodosPago = raw.map((m: any) => ({ method: m._id || 'unknown', count: m.count, totalCents: m.total }))
    } catch (payErr: any) {
      console.error('[dashboard/metodos-pago GET] aggregation error:', payErr?.message)
    }

    return NextResponse.json({ metodosPago })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[dashboard/metodos-pago GET]', msg)
    return NextResponse.json({ error: 'Error al obtener datos', detail: msg }, { status: 500 })
  }
}
