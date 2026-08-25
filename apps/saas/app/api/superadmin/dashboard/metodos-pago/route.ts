/**
 * Superadmin Dashboard — Métodos de Pago
 *
 * GET /api/superadmin/dashboard/metodos-pago
 *
 * Returns payment method distribution for today
 * Uses only Order model to avoid TDZ.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

function startOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

export async function GET(request: NextRequest) {
  try {
    // Auth
    const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
    if (!secret) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const isSecure = process.env.NODE_ENV === 'production'
    const token = await getToken({ 
      req: request as any, 
      secret, 
      secureCookie: isSecure 
    })

    if (!token) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    let isSuperAdmin = token.role === 'superadmin'
    if (!isSuperAdmin && token.id) {
      const mongooseMod = await import('mongoose')
      const mongoose = mongooseMod.default ?? mongooseMod
      if (mongoose.connection.readyState !== 1) {
        await mongoose.connect(process.env.MONGODB_URI!)
      }
      const UserMod = await import('@/models/User')
      const User = UserMod.default
      const dbUser = await User.findById(token.id).select('role').lean<{ role: string }>()
      isSuperAdmin = dbUser?.role === 'superadmin'
    }

    if (!isSuperAdmin) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

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
