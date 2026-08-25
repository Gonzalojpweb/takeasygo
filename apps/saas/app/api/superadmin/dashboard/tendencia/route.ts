/**
 * Superadmin Dashboard — Tendencia 7 Días
 *
 * GET /api/superadmin/dashboard/tendencia
 *
 * Returns 7-day trend data (orders and revenue)
 * Uses only Order model to avoid TDZ.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

function daysAgo(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d
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

    const sevenDaysAgo = daysAgo(7)

    let tendencia7Dias: Array<{ date: string; pedidos: number; ingresosCents: number }> = []
    try {
      const tendenciaRaw = await Order.aggregate([
        { $match: { createdAt: { $gte: sevenDaysAgo }, status: { $ne: 'cancelled' } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            pedidos: { $sum: 1 },
            ingresos: { $sum: { $cond: [{ $eq: ['$payment.status', 'approved'] }, '$total', 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ])

      for (let i = 6; i >= 0; i--) {
        const d = daysAgo(i)
        const key = d.toISOString().split('T')[0]
        const found = tendenciaRaw.find((t: any) => t._id === key)
        tendencia7Dias.push({ date: key, pedidos: found?.pedidos || 0, ingresosCents: found?.ingresos || 0 })
      }
    } catch (aggErr: any) {
      console.error('[dashboard/tendencia GET] aggregation error:', aggErr?.message)
      tendencia7Dias = []
    }

    return NextResponse.json({ tendencia7Dias })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[dashboard/tendencia GET]', msg)
    return NextResponse.json({ error: 'Error al obtener datos', detail: msg }, { status: 500 })
  }
}
