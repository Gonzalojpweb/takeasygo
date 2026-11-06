/**
 * Superadmin Dashboard — KPIs
 *
 * GET /api/superadmin/dashboard/kpis
 *
 * Returns today's KPIs (tenantsActivos, pedidosHoy, ingresosHoy, etc.)
 * Uses only Tenant, Order, and User models to avoid TDZ.
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

    // Data imports - only Tenant, Order, and User
    const mongooseMod = await import('mongoose')
    const mongoose = mongooseMod.default ?? mongooseMod
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGODB_URI!)
    }

    const TenantMod = await import('@/models/Tenant')
    const Tenant = TenantMod.default

    const OrderMod = await import('@/models/Order')
    const Order = OrderMod.default

    const UserMod = await import('@/models/User')
    const User = UserMod.default

    const now = new Date()
    const todayStart = startOfDay(now)

    const tenants = await Tenant.countDocuments({ isActive: true, status: 'active' })
    const pedidosHoy = await Order.countDocuments({ createdAt: { $gte: todayStart }, status: { $ne: 'cancelled' } })
    const usuariosTotales = await User.countDocuments({ role: { $ne: 'superadmin' } })

    const todayOrders = await Order.find({ createdAt: { $gte: todayStart }, status: { $ne: 'cancelled' } })
      .select('total payment.status').lean()

    const ingresosHoyCents = todayOrders
      .filter((o: any) => o.payment?.status === 'approved')
      .reduce((sum: number, o: any) => sum + (o.total || 0), 0)

    const ticketPromedioCents = pedidosHoy > 0 ? Math.round(ingresosHoyCents / pedidosHoy) : 0

    const kpis = {
      tenantsActivos: tenants,
      pedidosHoy,
      ingresosHoyCents,
      ticketPromedioCents,
      usuariosTotales,
    }

    return NextResponse.json({ kpis })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[dashboard/kpis GET]', msg)
    return NextResponse.json({ error: 'Error al obtener datos', detail: msg }, { status: 500 })
  }
}
