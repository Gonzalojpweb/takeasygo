/**
 * Superadmin Dashboard — Command Center
 *
 * GET /api/superadmin/dashboard
 *
 * Single aggregated endpoint powering the operational dashboard.
 * Returns live network status, active orders, activity feed,
 * KPIs, 7-day trend, tenant health, feedback, and payment methods.
 *
 * READ-ONLY — does not modify any data.
 */

import { connectDB } from '@/lib/mongoose'
import { NextResponse } from 'next/server'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Order from '@/models/Order'
import User from '@/models/User'
import Rating from '@/models/Rating'
import Feedback from '@/models/Feedback'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { checkIsOpenNow } from '@/lib/service-hours'
import type { ServiceHoursMode } from '@/lib/service-hours'

const ACTIVE_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'en_ruta', 'arrived'] as const

const STUCK_THRESHOLDS = {
  pendingMinutes: 30,
  readyMinutes: 20,
  estimatedMultiplier: 1.5,
} as const

/* eslint-disable @typescript-eslint/no-explicit-any */

function minutesSince(date: Date): number {
  return (Date.now() - date.getTime()) / 60_000
}

function startOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

function daysAgo(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d
}

function isOpenForTenant(
  location: { serviceHours?: Record<string, Array<{ days: number[]; open: string; close: string }>>; timezone?: string },
): boolean {
  const modes: ServiceHoursMode[] = ['takeaway', 'dineIn', 'delivery']
  for (const mode of modes) {
    const result = checkIsOpenNow(location.serviceHours as any, mode, location.timezone)
    if (result === true) return true
    if (result === false) continue
  }
  return false
}

function isStuckOrder(order: any): { stuck: boolean; reason?: string } {
  const status = order.status
  const ts = order.statusTimestamps || {}

  if (status === 'pending') {
    const age = minutesSince(order.createdAt)
    if (age > STUCK_THRESHOLDS.pendingMinutes) {
      return { stuck: true, reason: `${Math.round(age)}min sin confirmar` }
    }
  }

  if (status === 'confirmed' || status === 'preparing') {
    const referenceTime = status === 'confirmed' ? ts.confirmedAt : ts.preparingAt
    if (referenceTime && order.statusTimestamps?.estimatedReadyAt) {
      const estimated = new Date(order.statusTimestamps.estimatedReadyAt).getTime()
      const elapsed = Date.now() - referenceTime.getTime()
      const limit = (estimated - referenceTime.getTime()) * STUCK_THRESHOLDS.estimatedMultiplier
      if (elapsed > limit) {
        const pastDue = Math.round((elapsed - (estimated - referenceTime.getTime())) / 60_000)
        return { stuck: true, reason: `${pastDue}min sobre estimado` }
      }
    }
  }

  if (status === 'ready' && ts.readyAt) {
    const age = minutesSince(new Date(ts.readyAt))
    if (age > STUCK_THRESHOLDS.readyMinutes) {
      return { stuck: true, reason: `${Math.round(age)}min sin retirar` }
    }
  }

  return { stuck: false }
}

function buildActivityMessage(order: any, type: string, tenantName: string): string {
  const n = order.orderNumber || '?'
  switch (type) {
    case 'order_created':
      return `${tenantName} recibió pedido #${n}`
    case 'order_confirmed':
      return `${tenantName} confirmó pedido #${n}`
    case 'order_delivered':
      return `${tenantName} completó pedido #${n}`
    case 'order_cancelled':
      return `${tenantName} canceló pedido #${n}`
    default:
      return `${tenantName} — pedido #${n}`
  }
}

export async function GET() {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    await connectDB()

    const now = new Date()
    const todayStart = startOfDay(now)
    const sevenDaysAgo = daysAgo(7)
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)

    // ── Parallel data fetch ──────────────────────────────────────────
    const [tenants, locations, activeOrders, todayOrders, recentOrders, todayRatings, todayFeedback, totalUsers] =
      await Promise.all([
        Tenant.find({ isActive: true, status: 'active' })
          .select('name slug plan isOperational')
          .lean(),
        Location.find({ status: 'active' })
          .select('tenantId serviceHours timezone settings.acceptsOrders')
          .lean(),
        Order.find({ status: { $in: ACTIVE_STATUSES } })
          .select('tenantId locationId status orderNumber createdAt statusTimestamps total orderMode')
          .sort({ createdAt: -1 })
          .lean(),
        Order.find({ createdAt: { $gte: todayStart }, status: { $ne: 'cancelled' } })
          .select('tenantId total payment.method payment.status createdAt status')
          .lean(),
        Order.find({ createdAt: { $gte: twoHoursAgo } })
          .select('tenantId status orderNumber createdAt statusTimestamps')
          .sort({ createdAt: -1 })
          .limit(30)
          .lean(),
        Rating.find({ createdAt: { $gte: todayStart } })
          .select('tenantId stars comment createdAt')
          .lean(),
        Feedback.find({ createdAt: { $gte: todayStart } })
          .select('tenantId satisfaction comment event createdAt')
          .lean(),
        User.countDocuments({ role: { $ne: 'superadmin' } }),
      ])

    // ── Build lookup maps ────────────────────────────────────────────
    const tenantMap = new Map<string, any>()
    for (const t of tenants) {
      tenantMap.set(t._id.toString(), t)
    }

    const locationMap = new Map<string, any[]>()
    for (const loc of locations) {
      const tid = loc.tenantId.toString()
      if (!locationMap.has(tid)) locationMap.set(tid, [])
      locationMap.get(tid)!.push(loc)
    }

    // ── Per-tenant active orders ─────────────────────────────────────
    const tenantActiveOrders = new Map<string, any[]>()
    for (const order of activeOrders) {
      const tid = order.tenantId.toString()
      if (!tenantActiveOrders.has(tid)) tenantActiveOrders.set(tid, [])
      tenantActiveOrders.get(tid)!.push(order)
    }

    // ── Compute per-tenant metrics ───────────────────────────────────
    const tenantMetrics: Record<string, {
      tenantId: string
      name: string
      slug: string
      plan: string
      isOpen: boolean
      isOperational: boolean
      activeOrders: any[]
      statusCounts: Record<string, number>
      needsAttention: boolean
      attentionReasons: string[]
      pedidosHoy: number
      ingresosHoyCents: number
      ultimaActividad?: string
    }> = {}

    for (const t of tenants) {
      const tid = t._id.toString()
      const locs = locationMap.get(tid) || []
      const orders = tenantActiveOrders.get(tid) || []
      const todayTenantOrders = todayOrders.filter((o: any) => o.tenantId.toString() === tid)

      const isOpen = locs.some(loc => isOpenForTenant(loc))
      const statusCounts: Record<string, number> = {}
      const attentionReasons: string[] = []

      for (const order of orders) {
        statusCounts[order.status] = (statusCounts[order.status] || 0) + 1
        const stuck = isStuckOrder(order)
        if (stuck.stuck && stuck.reason) {
          attentionReasons.push(stuck.reason)
        }
      }

      const lastOrder = orders[0] || todayTenantOrders[0]

      tenantMetrics[tid] = {
        tenantId: tid,
        name: t.name,
        slug: t.slug,
        plan: t.plan,
        isOpen,
        isOperational: t.isOperational ?? true,
        activeOrders: orders.map((o: any) => ({
          orderId: o._id.toString(),
          orderNumber: o.orderNumber,
          status: o.status,
          createdAt: o.createdAt?.toISOString(),
          minutesInStatus: o.statusTimestamps
            ? minutesSince(new Date(
                o.statusTimestamps.preparingAt || o.statusTimestamps.confirmedAt || o.createdAt
              ))
            : 0,
          estimatedReadyAt: o.statusTimestamps?.estimatedReadyAt?.toISOString(),
          isStuck: isStuckOrder(o).stuck,
          stuckReason: isStuckOrder(o).reason,
        })),
        statusCounts,
        needsAttention: attentionReasons.length > 0,
        attentionReasons,
        pedidosHoy: todayTenantOrders.length,
        ingresosHoyCents: todayTenantOrders
          .filter((o: any) => o.payment?.status === 'approved')
          .reduce((sum: number, o: any) => sum + (o.total || 0), 0),
        ultimaActividad: lastOrder?.createdAt?.toISOString(),
      }
    }

    // ── Layer 1: AHORA EN TGO ────────────────────────────────────────
    const ahora = {
      operandoAhora: 0,
      conPedidosActivos: 0,
      requierenAtencion: 0,
      abiertosSinPedidos: 0,
      sinActividad: 0,
      totalTenants: tenants.length,
    }

    for (const tid of Object.keys(tenantMetrics)) {
      const m = tenantMetrics[tid]
      const hasActiveOrders = m.activeOrders.length > 0

      if (m.isOpen && m.isOperational) {
        ahora.operandoAhora++
      }
      if (hasActiveOrders) {
        ahora.conPedidosActivos++
      }
      if (m.needsAttention) {
        ahora.requierenAtencion++
      }
      if (m.isOpen && !hasActiveOrders) {
        ahora.abiertosSinPedidos++
      }
      if (!m.isOpen && !hasActiveOrders) {
        ahora.sinActividad++
      }
    }

    // ── Layer 2: PEDIDOS ACTIVOS (sorted by attention first) ─────────
    const pedidosActivos = Object.values(tenantMetrics)
      .filter(m => m.activeOrders.length > 0 || m.needsAttention)
      .sort((a, b) => {
        if (a.needsAttention && !b.needsAttention) return -1
        if (!a.needsAttention && b.needsAttention) return 1
        return b.activeOrders.length - a.activeOrders.length
      })

    // ── Layer 3: ACTIVIDAD RECIENTE ──────────────────────────────────
    const activityTypeMap: Record<string, string> = {
      open: 'order_created',
      awaiting_payment: 'order_created',
      awaiting_confirmation: 'order_created',
      pending: 'order_created',
      confirmed: 'order_confirmed',
      preparing: 'order_confirmed',
      ready: 'order_delivered',
      en_ruta: 'order_delivered',
      arrived: 'order_delivered',
      delivered: 'order_delivered',
      cancelled: 'order_cancelled',
    }

    const actividadReciente = recentOrders
      .filter((o: any) => o.createdAt && o.status !== 'open')
      .slice(0, 15)
      .map((o: any) => {
        const tid = o.tenantId.toString()
        const t = tenantMap.get(tid)
        const type = activityTypeMap[o.status] || 'order_created'
        return {
          type,
          tenantName: t?.name || 'Desconocido',
          tenantSlug: t?.slug || '',
          message: buildActivityMessage(o, type, t?.name || '?'),
          timestamp: o.createdAt?.toISOString() || now.toISOString(),
        }
      })
      .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    // ── Layer 4: KPIs DE HOY ─────────────────────────────────────────
    const pedidosHoy = todayOrders.length
    const ingresosHoyCents = todayOrders
      .filter((o: any) => o.payment?.status === 'approved')
      .reduce((sum: number, o: any) => sum + (o.total || 0), 0)
    const ticketPromedioCents = pedidosHoy > 0 ? Math.round(ingresosHoyCents / pedidosHoy) : 0

    const kpis = {
      tenantsActivos: tenants.length,
      pedidosHoy,
      ingresosHoyCents,
      ticketPromedioCents,
      usuariosTotales: totalUsers,
    }

    // ── Layer 5: TENDENCIA 7 DÍAS ────────────────────────────────────
    const tendenciaRaw = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: sevenDaysAgo },
          status: { $ne: 'cancelled' },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
          },
          pedidos: { $sum: 1 },
          ingresos: {
            $sum: {
              $cond: [{ $eq: ['$payment.status', 'approved'] }, '$total', 0],
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ])

    const tendencia7Dias: Array<{ date: string; pedidos: number; ingresosCents: number }> = []
    for (let i = 6; i >= 0; i--) {
      const d = daysAgo(i)
      const key = d.toISOString().split('T')[0]
      const found = tendenciaRaw.find((t: any) => t._id === key)
      tendencia7Dias.push({
        date: key,
        pedidos: found?.pedidos || 0,
        ingresosCents: found?.ingresos || 0,
      })
    }

    // ── Layer 6: SALUD DE LA RED ─────────────────────────────────────
    const saludRed = {
      operandoNormalmente: 0,
      requierenAtencion: 0,
      sinActividad: 0,
      tenants: Object.values(tenantMetrics)
        .map(m => {
          let estado: 'operando' | 'atencion' | 'sin_actividad' = 'sin_actividad'
          if (m.needsAttention) estado = 'atencion'
          else if (m.isOpen && m.isOperational) estado = 'operando'

          if (estado === 'operando') saludRed.operandoNormalmente++
          else if (estado === 'atencion') saludRed.requierenAtencion++
          else saludRed.sinActividad++

          return {
            tenantId: m.tenantId,
            name: m.name,
            slug: m.slug,
            plan: m.plan,
            estado,
            pedidosActivos: m.activeOrders.length,
            pedidosHoy: m.pedidosHoy,
            ingresosHoyCents: m.ingresosHoyCents,
            ultimaActividad: m.ultimaActividad,
          }
        })
        .sort((a, b) => {
          const order = { atencion: 0, operando: 1, sin_actividad: 2 }
          return (order[a.estado] ?? 3) - (order[b.estado] ?? 3)
        }),
    }

    // ── Layer 7: FEEDBACK ────────────────────────────────────────────
    const allFeedbackToday = [
      ...todayRatings.map((r: any) => ({
        tenantName: tenantMap.get(r.tenantId.toString())?.name || '?',
        tenantSlug: tenantMap.get(r.tenantId.toString())?.slug || '',
        type: 'rating' as const,
        stars: r.stars,
        satisfaction: r.stars <= 2 ? 'mejorable' : r.stars >= 4 ? 'excelente' : 'buena',
        comment: r.comment || '',
        createdAt: r.createdAt?.toISOString() || '',
      })),
      ...todayFeedback.map((f: any) => ({
        tenantName: tenantMap.get(f.tenantId.toString())?.name || '?',
        tenantSlug: tenantMap.get(f.tenantId.toString())?.slug || '',
        type: 'feedback' as const,
        stars: undefined as number | undefined,
        satisfaction: f.satisfaction,
        comment: f.comment || '',
        createdAt: f.createdAt?.toISOString() || '',
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    const negativosHoy = allFeedbackToday.filter(
      f => f.satisfaction === 'mejorable' || (f.stars !== undefined && f.stars <= 2)
    ).length

    const totalConSatisfaccion = allFeedbackToday.filter(f => f.satisfaction)
    const positivos = totalConSatisfaccion.filter(f => f.satisfaction === 'excelente' || f.satisfaction === 'buena').length
    const satisfaccionPct = totalConSatisfaccion.length > 0
      ? Math.round((positivos / totalConSatisfaccion.length) * 100)
      : 100

    const feedback = {
      negativosHoy,
      totalHoy: allFeedbackToday.length,
      satisfaccionPct,
      items: allFeedbackToday.slice(0, 20),
    }

    // ── Layer 8: MÉTODOS DE PAGO ─────────────────────────────────────
    const metodosPagoRaw = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: todayStart },
          status: { $ne: 'cancelled' },
          'payment.status': 'approved',
        },
      },
      {
        $group: {
          _id: '$payment.method',
          count: { $sum: 1 },
          total: { $sum: '$total' },
        },
      },
    ])

    const metodosPago = metodosPagoRaw.map((m: any) => ({
      method: m._id || 'unknown',
      count: m.count,
      totalCents: m.total,
    }))

    // ── Response ─────────────────────────────────────────────────────
    return NextResponse.json({
      ahora,
      pedidosActivos,
      actividadReciente,
      kpis,
      tendencia7Dias,
      saludRed,
      feedback,
      metodosPago,
      lastUpdated: now.toISOString(),
    })
  } catch (error) {
    console.error('[superadmin/dashboard GET]', error)
    return NextResponse.json({ error: 'Error al obtener datos del dashboard' }, { status: 500 })
  }
}
