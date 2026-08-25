/**
 * Superadmin Dashboard — Actividad Reciente
 *
 * GET /api/superadmin/dashboard/actividad
 *
 * Returns recent activity feed from last 2 hours
 * Uses only Order and Tenant models to avoid TDZ.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

function toDateStr(v: any): string {
  if (!v) return ''
  if (v instanceof Date) return v.toISOString()
  try { return new Date(v).toISOString() } catch { return '' }
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

    // Data imports - only Order and Tenant
    const mongooseMod = await import('mongoose')
    const mongoose = mongooseMod.default ?? mongooseMod
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGODB_URI!)
    }

    const TenantMod = await import('@/models/Tenant')
    const Tenant = TenantMod.default

    const OrderMod = await import('@/models/Order')
    const Order = OrderMod.default

    const now = new Date()
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)

    const tenants = await Tenant.find({ isActive: true, status: 'active' })
      .select('name slug').lean()

    const recentOrders = await Order.find({ createdAt: { $gte: twoHoursAgo } })
      .select('tenantId status orderNumber createdAt statusTimestamps')
      .sort({ createdAt: -1 }).limit(30).lean()

    const tenantMap = new Map<string, any>()
    for (const t of tenants) tenantMap.set(t._id.toString(), t)

    const activityMap: Record<string, string> = {
      open: 'order_created', awaiting_payment: 'order_created', awaiting_confirmation: 'order_created',
      pending: 'order_created', confirmed: 'order_confirmed', preparing: 'order_confirmed',
      ready: 'order_delivered', en_ruta: 'order_delivered', arrived: 'order_delivered',
      delivered: 'order_delivered', cancelled: 'order_cancelled',
    }

    const actividadReciente = recentOrders
      .filter((o: any) => o.createdAt && o.status !== 'open')
      .slice(0, 15)
      .map((o: any) => {
        const tid = o.tenantId.toString()
        const t = tenantMap.get(tid)
        const type = activityMap[o.status] || 'order_created'
        const name = t?.name || 'Desconocido'
        const n = o.orderNumber || '?'
        const messages: Record<string, string> = {
          order_created: `${name} recibió pedido #${n}`,
          order_confirmed: `${name} confirmó pedido #${n}`,
          order_delivered: `${name} completó pedido #${n}`,
          order_cancelled: `${name} canceló pedido #${n}`,
        }
        return {
          type,
          tenantName: name,
          tenantSlug: t?.slug || '',
          message: messages[type] || `${name} — pedido #${n}`,
          timestamp: toDateStr(o.createdAt) || now.toISOString(),
        }
      })
      .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    return NextResponse.json({ actividadReciente })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[dashboard/actividad GET]', msg)
    return NextResponse.json({ error: 'Error al obtener datos', detail: msg }, { status: 500 })
  }
}
