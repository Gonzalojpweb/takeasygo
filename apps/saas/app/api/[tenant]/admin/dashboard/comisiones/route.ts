/**
 * Admin Dashboard — Comisiones Pendientes
 *
 * GET /api/[tenant]/admin/dashboard/comisiones
 *
 * Returns pending transfer commissions (what the admin owes to TakeasyGO).
 * MercadoPago commissions are auto-debited; these are manual transfer commissions.
 * Uses Order + Tenant models to avoid TDZ.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params

    const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
    if (!secret) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const token = await getToken({
      req: request as any,
      secret,
      secureCookie: process.env.NODE_ENV === 'production',
    })

    if (!token) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const mongooseMod = await import('mongoose')
    const mongoose = mongooseMod.default ?? mongooseMod
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGODB_URI!)
    }

    const TenantMod = await import('@/models/Tenant')
    const Tenant = TenantMod.default

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
      .select('_id commissionBalance commissionThreshold')
      .lean<{ _id: any; commissionBalance?: { transfer: number }; commissionThreshold?: number }>()

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    if (token.role !== 'superadmin' && token.tenantId?.toString() !== tenant._id.toString()) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const OrderMod = await import('@/models/Order')
    const Order = OrderMod.default

    const tenantId = tenant._id

    // Calculate pending transfer commissions for current month
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

    const pendingData = await Order.aggregate([
      {
        $match: {
          tenantId,
          createdAt: { $gte: startOfMonth, $lte: endOfMonth },
          status: { $ne: 'cancelled' },
          'payment.status': 'approved',
          'payment.method': 'transfer',
          orderMode: 'delivery',
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$payment.platformFeeAmount' },
          count: { $sum: 1 },
        },
      },
    ])

    const pending = pendingData[0]?.total ?? 0
    const orderCount = pendingData[0]?.count ?? 0

    // Cumulative balance (lifetime)
    const balance = tenant.commissionBalance?.transfer ?? 0
    const threshold = tenant.commissionThreshold ?? null

    return NextResponse.json({
      pending,
      balance,
      threshold,
      orderCount,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[dashboard/comisiones GET]', msg)
    return NextResponse.json({ error: 'Error al obtener comisiones', detail: msg }, { status: 500 })
  }
}
