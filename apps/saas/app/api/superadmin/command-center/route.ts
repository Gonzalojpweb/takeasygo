/**
 * Superadmin Dashboard — Command Center
 *
 * GET /api/superadmin/command-center
 *
 * READ-ONLY — does not modify any data.
 *
 * Uses jose.jwtVerify directly to avoid Turbopack TDZ bug when
 * next-auth/jwt + apiAuth + mongoose models are bundled together.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const ACTIVE_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'en_ruta', 'arrived']

function toDateStr(v: any): string {
  if (!v) return ''
  if (v instanceof Date) return v.toISOString()
  try { return new Date(v).toISOString() } catch { return '' }
}

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

function isOpenForTenant(loc: any, checkIsOpenNow: any): boolean {
  if (!loc?.serviceHours || !loc.timezone) return false
  const modes = ['takeaway', 'dineIn', 'delivery'] as const
  try {
    for (const mode of modes) {
      const result = checkIsOpenNow(loc.serviceHours, mode, loc.timezone)
      if (result === true) return true
      if (result === false) continue
    }
  } catch { /* malformed hours */ }
  return false
}

function isStuckOrder(order: any): { stuck: boolean; reason?: string } {
  try {
    const status = order.status
    const ts = order.statusTimestamps || {}

    if (status === 'pending') {
      const age = minutesSince(order.createdAt)
      if (age > 30) return { stuck: true, reason: `${Math.round(age)}min sin confirmar` }
    }

    if (status === 'confirmed' || status === 'preparing') {
      const refTime = status === 'confirmed' ? ts.confirmedAt : ts.preparingAt
      if (refTime && ts.estimatedReadyAt) {
        const ref = new Date(refTime).getTime()
        const est = new Date(ts.estimatedReadyAt).getTime()
        const elapsed = Date.now() - ref
        const limit = (est - ref) * 1.5
        if (elapsed > limit) {
          const pastDue = Math.round((elapsed - (est - ref)) / 60_000)
          return { stuck: true, reason: `${pastDue}min sobre estimado` }
        }
      }
    }

    if (status === 'ready' && ts.readyAt) {
      const age = minutesSince(new Date(ts.readyAt))
      if (age > 20) return { stuck: true, reason: `${Math.round(age)}min sin retirar` }
    }
  } catch { /* defensive */ }
  return { stuck: false }
}

export async function GET(request: NextRequest) {
  try {
    // ── Auth: jose.jwtVerify avoids next-auth dependency chain entirely ──
    const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
    if (!secret) {
      console.error('[command-center GET] AUTH_SECRET not configured')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    // Read cookie directly — works for both dev and production
    const isSecure = process.env.NODE_ENV === 'production'
    const cookieName = isSecure ? '__Secure-authjs.session-token' : 'authjs.session-token'
    const cookieValue = request.cookies.get(cookieName)?.value
    if (!cookieValue) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    let payload: any
    try {
      const { payload: verified } = await jwtVerify(
        cookieValue,
        new TextEncoder().encode(secret),
        { algorithms: ['HS256'] }
      )
      payload = verified
    } catch {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    // Token may lack role if issued before jwt callback was updated.
    // Fall back to DB lookup.
    let isSuperAdmin = payload.role === 'superadmin'
    if (!isSuperAdmin && payload.id) {
      const mongoose = await import('mongoose')
      const defaultMongoose = mongoose.default ?? mongoose
      if (defaultMongoose.connection.readyState !== 1) {
        await defaultMongoose.connect(process.env.MONGODB_URI!)
      }
      const UserMod = await import('@/models/User')
      const User = UserMod.default
      const dbUser = await User.findById(payload.id).select('role').lean<{ role: string }>()
      isSuperAdmin = dbUser?.role === 'superadmin'
    }

    if (!isSuperAdmin) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    // ── Data imports: sequential to avoid Turbopack chunk TDZ ──
    const mongooseMod = await import('mongoose')
    const mongoose = mongooseMod.default ?? mongooseMod
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGODB_URI!)
    }

    const serviceHoursMod = await import('@/lib/service-hours')
    const checkIsOpenNow = serviceHoursMod.checkIsOpenNow

    const TenantMod = await import('@/models/Tenant')
    const Tenant = TenantMod.default

    const LocationMod = await import('@/models/Location')
    const Location = LocationMod.default

    const OrderMod = await import('@/models/Order')
    const Order = OrderMod.default

    const UserMod = await import('@/models/User')
    const User = UserMod.default

    const RatingMod = await import('@/models/Rating')
    const Rating = RatingMod.default

    const FeedbackMod = await import('@/models/Feedback')
    const Feedback = FeedbackMod.default

    const now = new Date()
    const todayStart = startOfDay(now)
    const sevenDaysAgo = daysAgo(7)
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)

    let tenants: any[] = []
    let locations: any[] = []
    let activeOrders: any[] = []
    let todayOrders: any[] = []
    let recentOrders: any[] = []
    let todayRatings: any[] = []
    let todayFeedback: any[] = []
    let totalUsers = 0

    try {
      const results = await Promise.all([
        Tenant.find({ isActive: true, status: 'active' })
          .select('name slug plan isOperational').lean(),
        Location.find({ status: 'active' })
          .select('tenantId serviceHours timezone settings.acceptsOrders').lean(),
        Order.find({ status: { $in: ACTIVE_STATUSES as any } })
          .select('tenantId locationId status orderNumber createdAt statusTimestamps total orderMode')
          .sort({ createdAt: -1 }).lean(),
        Order.find({ createdAt: { $gte: todayStart }, status: { $ne: 'cancelled' } })
          .select('tenantId total payment.method payment.status createdAt status').lean(),
        Order.find({ createdAt: { $gte: twoHoursAgo } })
          .select('tenantId status orderNumber createdAt statusTimestamps')
          .sort({ createdAt: -1 }).limit(30).lean(),
        Rating.find({ createdAt: { $gte: todayStart } })
          .select('tenantId stars comment createdAt').lean(),
        Feedback.find({ createdAt: { $gte: todayStart } })
          .select('tenantId satisfaction comment event createdAt').lean(),
        User.countDocuments({ role: { $ne: 'superadmin' } }),
      ])
      ;[tenants, locations, activeOrders, todayOrders, recentOrders, todayRatings, todayFeedback, totalUsers] = results
    } catch (queryErr: any) {
      console.error('[command-center GET] query error:', queryErr?.message || queryErr)
      return NextResponse.json({
        error: 'Error en consultas',
        detail: queryErr?.message || String(queryErr),
        ahora: { operandoAhora: 0, conPedidosActivos: 0, requierenAtencion: 0, abiertosSinPedidos: 0, sinActividad: 0, totalTenants: 0 },
        pedidosActivos: [], actividadReciente: [],
        kpis: { tenantsActivos: 0, pedidosHoy: 0, ingresosHoyCents: 0, ticketPromedioCents: 0, usuariosTotales: 0 },
        tendencia7Dias: [], saludRed: { operandoNormalmente: 0, requierenAtencion: 0, sinActividad: 0, tenants: [] },
        feedback: { negativosHoy: 0, totalHoy: 0, satisfaccionPct: 100, items: [] },
        metodosPago: [], lastUpdated: now.toISOString(),
      }, { status: 200 })
    }

    const tenantMap = new Map<string, any>()
    for (const t of tenants) tenantMap.set(t._id.toString(), t)

    const locationMap = new Map<string, any[]>()
    for (const loc of locations) {
      const tid = loc.tenantId.toString()
      if (!locationMap.has(tid)) locationMap.set(tid, [])
      locationMap.get(tid)!.push(loc)
    }

    const tenantActiveOrders = new Map<string, any[]>()
    for (const order of activeOrders) {
      const tid = order.tenantId.toString()
      if (!tenantActiveOrders.has(tid)) tenantActiveOrders.set(tid, [])
      tenantActiveOrders.get(tid)!.push(order)
    }

    const tenantMetrics: Record<string, any> = {}

    for (const t of tenants) {
      const tid = t._id.toString()
      const locs = locationMap.get(tid) || []
      const orders = tenantActiveOrders.get(tid) || []
      const todayTenantOrders = todayOrders.filter((o: any) => o.tenantId.toString() === tid)

      const open = locs.some((loc: any) => isOpenForTenant(loc, checkIsOpenNow))
      const statusCounts: Record<string, number> = {}
      const attentionReasons: string[] = []

      for (const order of orders) {
        statusCounts[order.status] = (statusCounts[order.status] || 0) + 1
        const stuck = isStuckOrder(order)
        if (stuck.stuck && stuck.reason) attentionReasons.push(stuck.reason)
      }

      const lastOrder = orders[0] || todayTenantOrders[0]

      tenantMetrics[tid] = {
        tenantId: tid,
        name: t.name,
        slug: t.slug,
        plan: t.plan,
        isOpen: open,
        isOperational: t.isOperational ?? true,
        activeOrders: orders.map((o: any) => ({
          orderId: o._id.toString(),
          orderNumber: o.orderNumber,
          status: o.status,
          createdAt: toDateStr(o.createdAt),
          minutesInStatus: o.statusTimestamps
            ? minutesSince(new Date(o.statusTimestamps.preparingAt || o.statusTimestamps.confirmedAt || o.createdAt))
            : 0,
          estimatedReadyAt: toDateStr(o.statusTimestamps?.estimatedReadyAt),
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
        ultimaActividad: toDateStr(lastOrder?.createdAt),
      }
    }

    const ahora = {
      operandoAhora: 0, conPedidosActivos: 0, requierenAtencion: 0,
      abiertosSinPedidos: 0, sinActividad: 0, totalTenants: tenants.length,
    }
    for (const m of Object.values(tenantMetrics)) {
      const hasActive = m.activeOrders.length > 0
      if (m.isOpen && m.isOperational) ahora.operandoAhora++
      if (hasActive) ahora.conPedidosActivos++
      if (m.needsAttention) ahora.requierenAtencion++
      if (m.isOpen && !hasActive) ahora.abiertosSinPedidos++
      if (!m.isOpen && !hasActive) ahora.sinActividad++
    }

    const pedidosActivos = Object.values(tenantMetrics)
      .filter((m: any) => m.activeOrders.length > 0 || m.needsAttention)
      .sort((a: any, b: any) => {
        if (a.needsAttention && !b.needsAttention) return -1
        if (!a.needsAttention && b.needsAttention) return 1
        return b.activeOrders.length - a.activeOrders.length
      })

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
      console.error('[command-center GET] tendencia error:', aggErr?.message)
      tendencia7Dias = []
    }

    const saludRed = {
      operandoNormalmente: 0, requierenAtencion: 0, sinActividad: 0,
      tenants: Object.values(tenantMetrics).map((m: any) => {
        let estado: 'operando' | 'atencion' | 'sin_actividad' = 'sin_actividad'
        if (m.needsAttention) estado = 'atencion'
        else if (m.isOpen && m.isOperational) estado = 'operando'
        if (estado === 'operando') saludRed.operandoNormalmente++
        else if (estado === 'atencion') saludRed.requierenAtencion++
        else saludRed.sinActividad++
        return {
          tenantId: m.tenantId, name: m.name, slug: m.slug, plan: m.plan,
          estado, pedidosActivos: m.activeOrders.length, pedidosHoy: m.pedidosHoy,
          ingresosHoyCents: m.ingresosHoyCents, ultimaActividad: m.ultimaActividad,
        }
      }).sort((a: any, b: any) => {
        const o: Record<string, number> = { atencion: 0, operando: 1, sin_actividad: 2 }
        return (o[a.estado] ?? 3) - (o[b.estado] ?? 3)
      }),
    }

    const allFeedbackToday = [
      ...todayRatings.map((r: any) => ({
        tenantName: tenantMap.get(r.tenantId.toString())?.name || '?',
        tenantSlug: tenantMap.get(r.tenantId.toString())?.slug || '',
        type: 'rating' as const,
        stars: r.stars,
        satisfaction: r.stars <= 2 ? 'mejorable' : r.stars >= 4 ? 'excelente' : 'buena',
        comment: r.comment || '',
        createdAt: toDateStr(r.createdAt),
      })),
      ...todayFeedback.map((f: any) => ({
        tenantName: tenantMap.get(f.tenantId.toString())?.name || '?',
        tenantSlug: tenantMap.get(f.tenantId.toString())?.slug || '',
        type: 'feedback' as const,
        stars: undefined as number | undefined,
        satisfaction: f.satisfaction,
        comment: f.comment || '',
        createdAt: toDateStr(f.createdAt),
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    const negativosHoy = allFeedbackToday.filter(
      f => f.satisfaction === 'mejorable' || (f.stars !== undefined && f.stars <= 2)
    ).length

    const totalConSatisfaccion = allFeedbackToday.filter(f => f.satisfaction)
    const positivos = totalConSatisfaccion.filter(f => f.satisfaction === 'excelente' || f.satisfaction === 'buena').length
    const satisfaccionPct = totalConSatisfaccion.length > 0
      ? Math.round((positivos / totalConSatisfaccion.length) * 100) : 100

    const feedback = {
      negativosHoy,
      totalHoy: allFeedbackToday.length,
      satisfaccionPct,
      items: allFeedbackToday.slice(0, 20),
    }

    let metodosPago: Array<{ method: string; count: number; totalCents: number }> = []
    try {
      const raw = await Order.aggregate([
        { $match: { createdAt: { $gte: todayStart }, status: { $ne: 'cancelled' }, 'payment.status': 'approved' } },
        { $group: { _id: '$payment.method', count: { $sum: 1 }, total: { $sum: '$total' } } },
      ])
      metodosPago = raw.map((m: any) => ({ method: m._id || 'unknown', count: m.count, totalCents: m.total }))
    } catch (payErr: any) {
      console.error('[command-center GET] payment aggregation error:', payErr?.message)
    }

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
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : ''
    console.error('[command-center GET]', msg, stack)
    return NextResponse.json({ error: 'Error al obtener datos del dashboard', detail: msg }, { status: 500 })
  }
}
