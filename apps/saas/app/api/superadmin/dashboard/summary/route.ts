/**
 * Superadmin Dashboard — Consolidated Summary
 *
 * GET /api/superadmin/dashboard/summary
 *
 * Single endpoint that replaces 8 individual dashboard endpoints.
 * Shares Tenant + Order queries across all sections to minimize DB round-trips.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

export const dynamic = 'force-dynamic'

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

function toDateStr(v: any): string {
  if (!v) return ''
  if (v instanceof Date) return v.toISOString()
  try { return new Date(v).toISOString() } catch { return '' }
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
    // Auth
    const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
    if (!secret) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const isSecure = process.env.NODE_ENV === 'production'
    const token = await getToken({ req: request as any, secret, secureCookie: isSecure })

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

    // Connect once
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
    const WCSMod = await import('@/models/WeeklyCommissionStatement')
    const WeeklyCommissionStatement = WCSMod.default

    const ACTIVE_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'en_ruta', 'arrived']
    const now = new Date()
    const todayStart = startOfDay(now)
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)
    const sevenDaysAgo = daysAgo(7)

    // ── Shared base queries ──
    const [tenants, locations, activeOrders, todayOrders] = await Promise.all([
      Tenant.find({ isActive: true, status: 'active' }).select('name slug plan isOperational mpOAuth.isConnected').lean(),
      Location.find({ status: 'active' }).select('tenantId serviceHours timezone settings.acceptsOrders').lean(),
      Order.find({ status: { $in: ACTIVE_STATUSES as any } })
        .select('tenantId locationId status orderNumber createdAt statusTimestamps total orderMode')
        .sort({ createdAt: -1 }).lean(),
      Order.find({ createdAt: { $gte: todayStart }, status: { $ne: 'cancelled' } })
        .select('tenantId total payment.method payment.status createdAt status').lean(),
    ])

    // Build shared maps
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

    // ── Derived: ahora ──
    const ahora = {
      operandoAhora: 0, conPedidosActivos: 0, requierenAtencion: 0,
      abiertosSinPedidos: 0, sinActividad: 0, totalTenants: tenants.length,
    }
    for (const t of tenants) {
      const tid = t._id.toString()
      const locs = locationMap.get(tid) || []
      const orders = tenantActiveOrders.get(tid) || []
      const open = locs.some((loc: any) => isOpenForTenant(loc, checkIsOpenNow))
      const hasActive = orders.length > 0
      if (open && t.isOperational) ahora.operandoAhora++
      if (hasActive) ahora.conPedidosActivos++
      if (open && !hasActive) ahora.abiertosSinPedidos++
      if (!open && !hasActive) ahora.sinActividad++
    }

    // ── Derived: pedidos activos ──
    const pedidosActivos: any[] = []
    for (const t of tenants) {
      const tid = t._id.toString()
      const orders = tenantActiveOrders.get(tid) || []
      const todayTenantOrders = todayOrders.filter((o: any) => o.tenantId.toString() === tid)
      const statusCounts: Record<string, number> = {}
      const attentionReasons: string[] = []
      for (const order of orders) {
        statusCounts[order.status] = (statusCounts[order.status] || 0) + 1
        const stuck = isStuckOrder(order)
        if (stuck.stuck && stuck.reason) attentionReasons.push(stuck.reason)
      }
      if (orders.length > 0 || attentionReasons.length > 0) {
        pedidosActivos.push({
          tenantId: tid, name: t.name, slug: t.slug, plan: t.plan,
          isOpen: true, isOperational: t.isOperational ?? true,
          activeOrders: orders.map((o: any) => ({
            orderId: o._id.toString(), orderNumber: o.orderNumber, status: o.status,
            createdAt: toDateStr(o.createdAt),
            minutesInStatus: o.statusTimestamps
              ? minutesSince(new Date(o.statusTimestamps.preparingAt || o.statusTimestamps.confirmedAt || o.createdAt))
              : 0,
            estimatedReadyAt: toDateStr(o.statusTimestamps?.estimatedReadyAt),
            isStuck: isStuckOrder(o).stuck, stuckReason: isStuckOrder(o).reason,
          })),
          statusCounts, needsAttention: attentionReasons.length > 0, attentionReasons,
          pedidosHoy: todayTenantOrders.length,
          ingresosHoyCents: todayTenantOrders
            .filter((o: any) => o.payment?.status === 'approved')
            .reduce((sum: number, o: any) => sum + (o.total || 0), 0),
          ultimaActividad: toDateStr(orders[0]?.createdAt || todayTenantOrders[0]?.createdAt),
        })
      }
    }
    pedidosActivos.sort((a: any, b: any) => {
      if (a.needsAttention && !b.needsAttention) return -1
      if (!a.needsAttention && b.needsAttention) return 1
      return b.activeOrders.length - a.activeOrders.length
    })

    // ── Derived: salud de la red ──
    const saludRed = {
      operandoNormalmente: 0, requierenAtencion: 0, sinActividad: 0,
      tenants: [] as any[],
    }
    for (const t of tenants) {
      const tid = t._id.toString()
      const locs = locationMap.get(tid) || []
      const orders = tenantActiveOrders.get(tid) || []
      const todayTenantOrders = todayOrders.filter((o: any) => o.tenantId.toString() === tid)
      const open = locs.some((loc: any) => isOpenForTenant(loc, checkIsOpenNow))
      const attentionReasons: string[] = []
      for (const order of orders) {
        const stuck = isStuckOrder(order)
        if (stuck.stuck && stuck.reason) attentionReasons.push(stuck.reason)
      }
      let estado: 'operando' | 'atencion' | 'sin_actividad' = 'sin_actividad'
      if (attentionReasons.length > 0) estado = 'atencion'
      else if (open && t.isOperational) estado = 'operando'
      if (estado === 'operando') saludRed.operandoNormalmente++
      else if (estado === 'atencion') saludRed.requierenAtencion++
      else saludRed.sinActividad++
      saludRed.tenants.push({
        tenantId: tid, name: t.name, slug: t.slug, plan: t.plan, estado,
        pedidosActivos: orders.length, pedidosHoy: todayTenantOrders.length,
        ingresosHoyCents: todayTenantOrders
          .filter((o: any) => o.payment?.status === 'approved')
          .reduce((sum: number, o: any) => sum + (o.total || 0), 0),
        ultimaActividad: toDateStr(orders[0]?.createdAt || todayTenantOrders[0]?.createdAt),
      })
    }
    saludRed.tenants.sort((a: any, b: any) => {
      const o: Record<string, number> = { atencion: 0, operando: 1, sin_actividad: 2 }
      return (o[a.estado] ?? 3) - (o[b.estado] ?? 3)
    })

    // ── Independent queries (only overlap is with shared data above) ──
    const [kpisRaw, feedbackRatings, feedbackItems, recentOrders, tendenciaRaw, metodosPagoRaw, transferAgg, stmtByTenant, mpAgg] = await Promise.all([
      // KPIs
      (async () => {
        const pedidosHoy = todayOrders.length
        const usuariosTotales = await User.countDocuments({ role: { $ne: 'superadmin' } })
        const ingresosHoyCents = todayOrders
          .filter((o: any) => o.payment?.status === 'approved')
          .reduce((sum: number, o: any) => sum + (o.total || 0), 0)
        const ticketPromedioCents = pedidosHoy > 0 ? Math.round(ingresosHoyCents / pedidosHoy) : 0
        return { tenantsActivos: tenants.length, pedidosHoy, ingresosHoyCents, ticketPromedioCents, usuariosTotales }
      })(),
      // Feedback - ratings
      Rating.find({ createdAt: { $gte: todayStart } }).select('tenantId stars comment createdAt').lean(),
      // Feedback - feedback
      Feedback.find({ createdAt: { $gte: todayStart } }).select('tenantId satisfaction comment event createdAt').lean(),
      // Actividad reciente
      Order.find({ createdAt: { $gte: twoHoursAgo } })
        .select('tenantId status orderNumber createdAt statusTimestamps')
        .sort({ createdAt: -1 }).limit(30).lean(),
      // Tendencia
      Order.aggregate([
        { $match: { createdAt: { $gte: sevenDaysAgo }, status: { $ne: 'cancelled' } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            pedidos: { $sum: 1 },
            ingresos: { $sum: { $cond: [{ $eq: ['$payment.status', 'approved'] }, '$total', 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      // Metodos de pago
      Order.aggregate([
        { $match: { createdAt: { $gte: todayStart }, status: { $ne: 'cancelled' }, 'payment.status': 'approved' } },
        { $group: { _id: '$payment.method', count: { $sum: 1 }, total: { $sum: '$total' } } },
      ]),
      // Comisiones - transfer (WeeklyCommissionStatement)
      WeeklyCommissionStatement.aggregate([{
        $group: {
          _id: null,
          pending: { $sum: { $cond: [{ $in: ['$status', ['pendiente', 'vencido']] }, '$amount', 0] } },
          overdue: { $sum: { $cond: [{ $eq: ['$status', 'vencido'] }, '$amount', 0] } },
          settled: { $sum: { $cond: [{ $eq: ['$status', 'pagado'] }, '$amount', 0] } },
          statementCount: { $sum: 1 },
        },
      }]),
      // Comisiones - per-tenant transfer
      WeeklyCommissionStatement.aggregate([{
        $group: {
          _id: '$tenantId',
          pending: { $sum: { $cond: [{ $in: ['$status', ['pendiente', 'vencido']] }, '$amount', 0] } },
          settled: { $sum: { $cond: [{ $eq: ['$status', 'pagado'] }, '$amount', 0] } },
        },
      }]),
      // Comisiones - MP fees by tenant
      Order.aggregate([
        { $match: { 'payment.method': 'mercadopago', 'payment.status': 'approved', status: { $ne: 'cancelled' } } },
        { $group: { _id: '$tenantId', totalFee: { $sum: '$payment.platformFeeAmount' } } },
      ]),
    ])

    // ── Process feedback ──
    const allFeedbackToday = [
      ...feedbackRatings.map((r: any) => ({
        tenantName: tenantMap.get(r.tenantId.toString())?.name || '?',
        tenantSlug: tenantMap.get(r.tenantId.toString())?.slug || '',
        type: 'rating' as const, stars: r.stars,
        satisfaction: r.stars <= 2 ? 'mejorable' : r.stars >= 4 ? 'excelente' : 'buena',
        comment: r.comment || '', createdAt: toDateStr(r.createdAt),
      })),
      ...feedbackItems.map((f: any) => ({
        tenantName: tenantMap.get(f.tenantId.toString())?.name || '?',
        tenantSlug: tenantMap.get(f.tenantId.toString())?.slug || '',
        type: 'feedback' as const, stars: undefined as number | undefined,
        satisfaction: f.satisfaction, comment: f.comment || '', createdAt: toDateStr(f.createdAt),
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    const negativosHoy = allFeedbackToday.filter(
      f => f.satisfaction === 'mejorable' || (f.stars !== undefined && f.stars <= 2)
    ).length
    const totalConSatisfaccion = allFeedbackToday.filter(f => f.satisfaction)
    const positivos = totalConSatisfaccion.filter(f => f.satisfaction === 'excelente' || f.satisfaction === 'buena').length
    const satisfaccionPct = totalConSatisfaccion.length > 0
      ? Math.round((positivos / totalConSatisfaccion.length) * 100) : 100

    // ── Process actividad ──
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
          type, tenantName: name, tenantSlug: t?.slug || '',
          message: messages[type] || `${name} — pedido #${n}`,
          timestamp: toDateStr(o.createdAt) || now.toISOString(),
        }
      })
      .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    // ── Process tendencia ──
    let tendencia7Dias: Array<{ date: string; pedidos: number; ingresosCents: number }> = []
    for (let i = 6; i >= 0; i--) {
      const d = daysAgo(i)
      const key = d.toISOString().split('T')[0]
      const found = tendenciaRaw.find((t: any) => t._id === key)
      tendencia7Dias.push({ date: key, pedidos: found?.pedidos || 0, ingresosCents: found?.ingresos || 0 })
    }

    // ── Process metodos de pago ──
    const metodosPago = metodosPagoRaw.map((m: any) => ({
      method: m._id || 'unknown', count: m.count, totalCents: m.total,
    }))

    // ── Process comisiones ──
    const tenantsWithSplit = new Set(
      tenants.filter((t: any) => t.mpOAuth?.isConnected).map((t: any) => t._id.toString())
    )
    const transfer = {
      pending: transferAgg[0]?.pending || 0,
      overdue: transferAgg[0]?.overdue || 0,
      settled: transferAgg[0]?.settled || 0,
      statementCount: transferAgg[0]?.statementCount || 0,
    }
    let mpAutoSplit = 0
    let mpNoSplit = 0
    for (const entry of mpAgg) {
      const tid = entry._id?.toString()
      const amount = entry.totalFee || 0
      if (tenantsWithSplit.has(tid)) mpAutoSplit += amount
      else mpNoSplit += amount
    }
    const grandPending = transfer.pending + mpNoSplit
    const grandSettled = transfer.settled + mpAutoSplit

    const tenantTransferPending: Record<string, number> = {}
    const tenantTransferSettled: Record<string, number> = {}
    const tenantMp: Record<string, number> = {}
    for (const s of stmtByTenant) {
      const tid = s._id?.toString()
      if (tid) {
        tenantTransferPending[tid] = s.pending || 0
        tenantTransferSettled[tid] = s.settled || 0
      }
    }
    for (const entry of mpAgg) {
      const tid = entry._id?.toString()
      if (tid) tenantMp[tid] = entry.totalFee || 0
    }
    const comisiones = {
      transfer,
      mercadopago: { autoSplit: mpAutoSplit, noSplit: mpNoSplit, note: 'Auto-split: cobrado automáticamente vía MP split. Sin split: pendiente de cobro manual.' },
      combined: { grandPending, grandSettled },
      byTenant: tenants
        .map((t: any) => {
          const tid = t._id.toString()
          const tp = tenantTransferPending[tid] || 0
          const ts = tenantTransferSettled[tid] || 0
          const mp = tenantMp[tid] || 0
          const hasSplit = tenantsWithSplit.has(tid)
          return {
            tenantId: tid, name: t.name, slug: t.slug,
            transferPending: tp, transferSettled: ts,
            mpAccumulated: mp, mpAutoSplit: hasSplit,
            totalPending: tp + (hasSplit ? 0 : mp),
          }
        })
        .filter((t: any) => t.transferPending > 0 || t.transferSettled > 0 || t.mpAccumulated > 0)
        .sort((a: any, b: any) => b.totalPending - a.totalPending),
    }

    return NextResponse.json({
      ahora,
      pedidosActivos,
      kpis: kpisRaw,
      saludRed,
      feedback: {
        negativosHoy, totalHoy: allFeedbackToday.length, satisfaccionPct,
        items: allFeedbackToday.slice(0, 20),
      },
      actividadReciente,
      tendencia7Dias,
      metodosPago,
      comisiones,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[superadmin/dashboard/summary GET]', msg)
    return NextResponse.json({ error: 'Error al obtener resumen', detail: msg }, { status: 500 })
  }
}
