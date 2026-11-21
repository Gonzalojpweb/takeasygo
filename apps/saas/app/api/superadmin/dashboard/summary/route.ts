/**
 * Superadmin Dashboard — Consolidated Summary
 *
 * GET /api/superadmin/dashboard/summary
 *
 * Single endpoint that replaces 8 individual dashboard endpoints.
 * Shares Tenant + Order queries across all sections to minimize DB round-trips.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdminByToken } from '@/lib/superadmin-token-guard'
import { SAAS_ORDERS_ONLY, POS_ORDER_SOURCE } from '@/lib/order-visibility'

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

/**
 * 20/11/2026 — Estado del cobro de un pedido, en criollo:
 *  paid = cobrado (MP/transferencia/Kripton aprobado) · cash = se cobra en
 *  efectivo al entregar · awaiting = esperando el pago (MP sin pagar) ·
 *  transfer_pending = transferencia sin confirmar por el comercio.
 */
function paymentStateOf(order: any): 'paid' | 'cash' | 'awaiting' | 'transfer_pending' {
  const method = order.payment?.method
  if (order.payment?.status === 'approved' && method !== 'cash') return 'paid'
  if (method === 'transfer') return order.payment?.transferConfirmed ? 'paid' : 'transfer_pending'
  if (method === 'cash') return 'cash'
  return 'awaiting'
}

function isStuckOrder(order: any): { stuck: boolean; reason?: string } {
  try {
    const status = order.status
    const ts = order.statusTimestamps || {}
    if (status === 'awaiting_payment' || status === 'awaiting_confirmation') {
      const age = minutesSince(new Date(order.createdAt))
      if (age > 20) {
        const isTransfer = order.payment?.method === 'transfer'
        return { stuck: true, reason: `${Math.round(age)}min ${isTransfer ? 'con transferencia sin confirmar' : 'esperando el pago'}` }
      }
    }

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
    // Superadmin por cookie (sin auth(): TDZ de chunks) — lib/superadmin-token-guard
    const authError = await requireSuperAdminByToken(request, 'dashboard')
    if (authError) return authError

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
    // 20/11/2026: también los que esperan el pago (MP sin pagar, transferencia
    // sin confirmar): son justo los que el superadmin necesita ver.
    const AWAITING_PAYMENT = ['awaiting_payment', 'awaiting_confirmation']
    const now = new Date()
    const todayStart = startOfDay(now)
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)
    const sevenDaysAgo = daysAgo(7)

    // ── Shared base queries ──
    const [tenants, locations, activeOrders, todayOrders] = await Promise.all([
      Tenant.find({ isActive: true, status: 'active' }).select('name slug plan isOperational mpOAuth.isConnected').lean(),
      Location.find({ status: 'active' }).select('tenantId serviceHours timezone settings.acceptsOrders').lean(),
      // 20/11/2026: solo pedidos de la app/SaaS. Las ventas del POS se operan
      // en el salón y van en su propia sección (posSalones).
      Order.find({
        ...SAAS_ORDERS_ONLY,
        deletedAt: null,
        $or: [
          { status: { $in: ACTIVE_STATUSES as any } },
          // Esperando pago: solo las últimas 3 h (lo más viejo es un checkout abandonado).
          { status: { $in: AWAITING_PAYMENT as any }, createdAt: { $gte: new Date(now.getTime() - 3 * 60 * 60 * 1000) } },
        ],
      })
        .select('tenantId locationId status orderNumber createdAt statusTimestamps total orderMode deliveryCost payment.method payment.status payment.platformFeeAmount payment.transferConfirmed')
        .sort({ createdAt: -1 }).lean(),
      Order.find({ ...SAAS_ORDERS_ONLY, createdAt: { $gte: todayStart }, status: { $ne: 'cancelled' } })
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
            // 20/11/2026: cuánto y por dónde pagó, sin entrar al comercio.
            totalCents: o.total || 0,
            deliveryCents: o.deliveryCost || 0,
            orderMode: o.orderMode || null,
            paymentMethod: o.payment?.method || null,
            paymentState: paymentStateOf(o),
            commissionCents: o.payment?.platformFeeAmount || 0,
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
      Order.find({ ...SAAS_ORDERS_ONLY, createdAt: { $gte: twoHoursAgo } })
        .select('tenantId status orderNumber createdAt statusTimestamps')
        .sort({ createdAt: -1 }).limit(30).lean(),
      // Tendencia
      Order.aggregate([
        { $match: { ...SAAS_ORDERS_ONLY, createdAt: { $gte: sevenDaysAgo }, status: { $ne: 'cancelled' } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            pedidos: { $sum: 1 },
            ingresos: { $sum: { $cond: [{ $eq: ['$payment.status', 'approved'] }, '$total', 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      // Métodos de pago (app): cobrado hoy y lo que todavía espera el pago
      Order.aggregate([
        { $match: { ...SAAS_ORDERS_ONLY, createdAt: { $gte: todayStart }, status: { $ne: 'cancelled' } } },
        {
          $group: {
            _id: '$payment.method',
            count: { $sum: { $cond: [{ $eq: ['$payment.status', 'approved'] }, 1, 0] } },
            total: { $sum: { $cond: [{ $eq: ['$payment.status', 'approved'] }, '$total', 0] } },
            commission: { $sum: { $cond: [{ $eq: ['$payment.status', 'approved'] }, '$payment.platformFeeAmount', 0] } },
            pendingCount: { $sum: { $cond: [{ $in: ['$status', AWAITING_PAYMENT] }, 1, 0] } },
            pendingTotal: { $sum: { $cond: [{ $in: ['$status', AWAITING_PAYMENT] }, '$total', 0] } },
          },
        },
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
    const tendencia7Dias: Array<{ date: string; pedidos: number; ingresosCents: number }> = []
    for (let i = 6; i >= 0; i--) {
      const d = daysAgo(i)
      const key = d.toISOString().split('T')[0]
      const found = tendenciaRaw.find((t: any) => t._id === key)
      tendencia7Dias.push({ date: key, pedidos: found?.pedidos || 0, ingresosCents: found?.ingresos || 0 })
    }

    // ── Process metodos de pago ──
    const metodosPago = metodosPagoRaw
      .map((m: any) => ({
        method: m._id || 'unknown', count: m.count, totalCents: m.total,
        commissionCents: m.commission || 0,
        pendingCount: m.pendingCount || 0, pendingCents: m.pendingTotal || 0,
      }))
      .filter((m: any) => m.count > 0 || m.pendingCount > 0)

    // ── Salones (POS): aparte, solo para dimensionar el movimiento ──
    const posSalones = await (async () => {
      try {
        const [openNow, today] = await Promise.all([
          Order.find({ source: POS_ORDER_SOURCE, deletedAt: null, status: { $nin: ['delivered', 'cancelled'] }, createdAt: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } })
            .select('tenantId total posTableId posTableNumber channel orderMode').lean(),
          Order.aggregate([
            { $match: { source: POS_ORDER_SOURCE, deletedAt: null, createdAt: { $gte: todayStart }, status: { $ne: 'cancelled' } } },
            { $group: { _id: '$tenantId', ventas: { $sum: 1 }, total: { $sum: '$total' } } },
          ]),
        ])
        const byTenant = new Map<string, { abiertas: number; abiertasCents: number; mesas: Set<string>; mostrador: number; ventasHoy: number; ventasHoyCents: number }>()
        const entry = (tid: string) => {
          if (!byTenant.has(tid)) byTenant.set(tid, { abiertas: 0, abiertasCents: 0, mesas: new Set(), mostrador: 0, ventasHoy: 0, ventasHoyCents: 0 })
          return byTenant.get(tid)!
        }
        for (const o of openNow as any[]) {
          const e = entry(o.tenantId.toString())
          e.abiertas++
          e.abiertasCents += o.total || 0
          if (o.posTableId) e.mesas.add(String(o.posTableId))
          else e.mostrador++
        }
        for (const t of today as any[]) {
          const e = entry(String(t._id))
          e.ventasHoy = t.ventas
          e.ventasHoyCents = t.total
        }
        return [...byTenant.entries()]
          .map(([tid, e]) => ({
            tenantId: tid,
            name: tenantMap.get(tid)?.name || '?',
            slug: tenantMap.get(tid)?.slug || '',
            mesasAbiertas: e.mesas.size,
            mostradorAbiertas: e.mostrador,
            abiertasCents: e.abiertasCents,
            ventasHoy: e.ventasHoy,
            ventasHoyCents: e.ventasHoyCents,
          }))
          .filter((t) => tenantMap.has(t.tenantId))
          .sort((a, b) => b.mesasAbiertas + b.mostradorAbiertas - (a.mesasAbiertas + a.mostradorAbiertas) || b.ventasHoyCents - a.ventasHoyCents)
      } catch (err) {
        console.error('[dashboard/summary] posSalones', err)
        return []
      }
    })()

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
      posSalones,
      comisiones,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[superadmin/dashboard/summary GET]', msg)
    return NextResponse.json({ error: 'Error al obtener resumen', detail: msg }, { status: 500 })
  }
}
