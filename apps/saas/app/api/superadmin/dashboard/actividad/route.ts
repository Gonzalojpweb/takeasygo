/**
 * Superadmin Dashboard — Actividad Reciente
 *
 * GET /api/superadmin/dashboard/actividad
 *
 * Returns recent activity feed from last 2 hours
 * Uses only Order and Tenant models to avoid TDZ.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdminByToken } from '@/lib/superadmin-token-guard'

function toDateStr(v: any): string {
  if (!v) return ''
  if (v instanceof Date) return v.toISOString()
  try { return new Date(v).toISOString() } catch { return '' }
}

export async function GET(request: NextRequest) {
  try {
    // Auth
    // Superadmin por cookie (sin auth(): TDZ de chunks) — lib/superadmin-token-guard
    const authError = await requireSuperAdminByToken(request, 'dashboard')
    if (authError) return authError

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
