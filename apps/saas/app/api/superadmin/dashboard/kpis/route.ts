/**
 * Superadmin Dashboard — KPIs
 *
 * GET /api/superadmin/dashboard/kpis
 *
 * Returns today's KPIs (tenantsActivos, pedidosHoy, ingresosHoy, etc.)
 * Uses only Tenant, Order, and User models to avoid TDZ.
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
