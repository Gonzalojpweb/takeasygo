/**
 * Admin Dashboard — Consolidated Summary
 *
 * GET /api/[tenant]/admin/dashboard/summary
 *
 * Single endpoint that replaces 9 individual dashboard endpoints.
 * Uses parallel queries with shared Tenant lookup to minimize DB round-trips.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

export const dynamic = 'force-dynamic'

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
      .select('_id cachedScores commissionBalance commissionThreshold')
      .lean<{ _id: any; cachedScores?: { icoScore: number | null; capacityScore: number | null }; commissionBalance?: { transfer: number }; commissionThreshold?: number }>()

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    if (token.role !== 'superadmin' && token.tenantId?.toString() !== tenant._id.toString()) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const tenantId = tenant._id
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
    const start30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    // Lazy-load all models
    const OrderMod = await import('@/models/Order')
    const Order = OrderMod.default
    const ICOSnapshotMod = await import('@/models/ICOSnapshot')
    const ICOSnapshot = ICOSnapshotMod.default
    const RatingMod = await import('@/models/Rating')
    const Rating = RatingMod.default
    const MenuMod = await import('@/models/Menu')
    const Menu = MenuMod.default
    const LoyaltyMemberMod = await import('@/models/LoyaltyMember')
    const LoyaltyMember = LoyaltyMemberMod.default

    // Run all queries in parallel
    const [
      // Stats
      totalOrders, pendingOrders, confirmedOrders, cancelledOrders,
      // KPIs
      thisMonthData, prevMonthData, cancAgg, prevCancAgg,
      // ICO
      icoHistory, orders30Count,
      // Metodos de pago
      paymentData,
      // Comisiones
      pendingCommissions,
      // Menu actividad
      mostSoldRaw, menuDoc, totalOrders30,
      // Calificaciones
      recentRatingsRaw, ratingAgg,
      // Club
      clubStats,
      // Pedidos recientes
      recentOrders,
      // Margin recovery (surcharge)
      marginRecoveryAgg,
      // Delivery conciliation (daily)
      deliveryDailyRaw,
    ] = await Promise.all([
      // Stats
      Order.countDocuments({ tenantId, deletedAt: null }),
      Order.countDocuments({ tenantId, deletedAt: null, status: 'pending' }),
      Order.countDocuments({ tenantId, deletedAt: null, status: 'confirmed' }),
      Order.countDocuments({ tenantId, deletedAt: null, status: 'cancelled' }),
      // KPIs - this month
      Order.aggregate([
        { $match: { tenantId, createdAt: { $gte: startOfMonth, $lte: endOfMonth }, status: { $ne: 'cancelled' } } },
        { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } },
      ]),
      // KPIs - prev month
      Order.aggregate([
        { $match: { tenantId, createdAt: { $gte: startOfPrevMonth, $lte: endOfPrevMonth }, status: { $ne: 'cancelled' } } },
        { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } },
      ]),
      // KPIs - cancel rate this month
      Order.aggregate([
        { $match: { tenantId, createdAt: { $gte: startOfMonth, $lte: endOfMonth } } },
        { $group: { _id: null, total: { $sum: 1 }, cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } } } },
      ]),
      // KPIs - cancel rate prev month
      Order.aggregate([
        { $match: { tenantId, createdAt: { $gte: startOfPrevMonth, $lte: endOfPrevMonth } } },
        { $group: { _id: null, total: { $sum: 1 }, cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } } } },
      ]),
      // ICO - history
      ICOSnapshot.find({ tenantId }).sort({ date: -1 }).limit(8).select('date icoScore').lean(),
      // ICO - orders count
      Order.countDocuments({ tenantId, deletedAt: null, createdAt: { $gte: start30 } }),
      // Metodos de pago
      Order.aggregate([
        { $match: { tenantId, createdAt: { $gte: startOfMonth, $lte: endOfMonth }, status: { $ne: 'cancelled' } } },
        { $group: { _id: '$payment.method', orders: { $sum: 1 }, revenue: { $sum: '$total' } } },
        { $sort: { revenue: -1 } },
      ]),
      // Comisiones
      Order.aggregate([
        {
          $match: {
            tenantId, createdAt: { $gte: startOfMonth, $lte: endOfMonth },
            status: { $ne: 'cancelled' }, 'payment.status': 'approved',
            'payment.method': 'transfer', orderMode: 'delivery',
          },
        },
        { $group: { _id: null, total: { $sum: '$payment.platformFeeAmount' }, count: { $sum: 1 } } },
      ]),
      // Menu actividad - most sold
      Order.aggregate([
        { $match: { tenantId, createdAt: { $gte: start30 }, status: { $ne: 'cancelled' } } },
        { $unwind: '$items' },
        { $group: { _id: '$items.name', count: { $sum: '$items.quantity' }, revenue: { $sum: '$items.subtotal' } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),
      // Menu actividad - liked items
      Menu.find({ tenantId, isActive: true }).lean(),
      // Menu actividad - total orders for funnel
      Order.countDocuments({ tenantId, createdAt: { $gte: start30 }, status: { $ne: 'cancelled' } }),
      // Calificaciones - recent
      Rating.find({ tenantId }).sort({ createdAt: -1 }).limit(10)
        .populate('orderId', 'orderNumber customer.name customer.phone').lean(),
      // Calificaciones - aggregation
      Rating.aggregate([
        { $match: { tenantId } },
        { $group: { _id: null, avg: { $avg: '$stars' }, count: { $sum: 1 }, dist: { $push: '$stars' } } },
      ]),
      // Club
      LoyaltyMember.aggregate([
        { $match: { tenantId, status: 'active' } },
        { $group: {
          _id: null,
          totalMembers: { $sum: 1 },
          membersWithPoints: { $sum: { $cond: [{ $gt: ['$loyalty.points', 0] }, 1, 0] } },
          totalPoints: { $sum: '$loyalty.points' },
        } },
      ]),
      // Pedidos recientes
      Order.find({ tenantId, deletedAt: null })
        .sort({ createdAt: -1 }).limit(5)
        .select('orderNumber total status customer.name createdAt').lean(),
      // Margin recovery — total surcharge across ALL payment methods this month
      Order.aggregate([
        { $match: { tenantId, createdAt: { $gte: startOfMonth, $lte: endOfMonth }, status: { $ne: 'cancelled' } } },
        { $group: {
          _id: null,
          totalSurcharge: { $sum: '$payment.surchargeAmount' },
          totalPlatformFee: { $sum: '$payment.platformFeeAmount' },
          totalOrders: { $sum: 1 },
          avgSurchargePercent: { $avg: '$payment.surchargePercent' },
        } },
      ]),
      // Delivery conciliation — daily breakdown of delivery orders this month
      Order.aggregate([
        { $match: { tenantId, createdAt: { $gte: startOfMonth, $lte: endOfMonth }, orderMode: 'delivery', status: { $ne: 'cancelled' } } },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          orderCount: { $sum: 1 },
          deliveryCollected: { $sum: '$deliveryCost' },
          platformFees: { $sum: '$payment.platformFeeAmount' },
          totalRevenue: { $sum: '$total' },
        } },
        { $sort: { _id: -1 } },
      ]),
    ])

    // ── Process KPIs ──
    const thisMonth = thisMonthData[0] || { total: 0, count: 0 }
    const prevMonth = prevMonthData[0] || { total: 0, count: 0 }
    const canc = cancAgg[0] || { total: 0, cancelled: 0 }
    const prevCanc = prevCancAgg[0] || { total: 0, cancelled: 0 }
    const revenue = thisMonth.total
    const prevRevenue = prevMonth.total
    const avgTicket = thisMonth.count > 0 ? Math.round(thisMonth.total / thisMonth.count) : 0
    const cancRate = canc.total > 0 ? Math.round((canc.cancelled / canc.total) * 100) : 0
    const growth = prevRevenue > 0 ? (((revenue - prevRevenue) / prevRevenue) * 100).toFixed(1) : '0'
    const prevCancRate = prevCanc.total > 0 ? Math.round((prevCanc.cancelled / prevCanc.total) * 100) : null
    const cancTrend: 'better' | 'worse' | 'same' | null =
      prevCancRate === null ? null : cancRate < prevCancRate ? 'better' : cancRate > prevCancRate ? 'worse' : 'same'

    // ── Process ICO ──
    const icoScore = tenant.cachedScores?.icoScore ?? null
    const capacityScore = tenant.cachedScores?.capacityScore ?? null
    const historySorted = [...icoHistory].reverse()
    let band: { label: string; level: string } | null = null
    if (icoScore !== null) {
      if (icoScore >= 91) band = { label: 'Alta consistencia', level: 'green' }
      else if (icoScore >= 76) band = { label: 'Operación estable', level: 'green-light' }
      else if (icoScore >= 51) band = { label: 'En consolidación', level: 'amber' }
      else band = { label: 'Ajustes necesarios', level: 'red' }
    }

    // ── Process Metodos de pago ──
    const metodosPago = paymentData.map((d: any) => ({
      method: d._id || 'desconocido', orderCount: d.orders, revenue: d.revenue,
    }))

    // ── Process Comisiones ──
    const pending = pendingCommissions[0]?.total ?? 0
    const commissionOrderCount = pendingCommissions[0]?.count ?? 0
    const balance = tenant.commissionBalance?.transfer ?? 0
    const threshold = tenant.commissionThreshold ?? null

    // ── Process Menu actividad ──
    const mostSold = mostSoldRaw.map((d: any) => ({
      _id: d._id, name: d._id, category: '', count: d.count, likesCount: 0,
    }))
    const likedItems: { name: string; categoryName: string; likesCount: number }[] = []
    const seenItemIds = new Set<string>()
    for (const menu of menuDoc) {
      for (const cat of (menu as any).categories ?? []) {
        for (const item of cat.items ?? []) {
          const id = item._id?.toString()
          if (id && !seenItemIds.has(id) && (item.likesCount ?? 0) > 0) {
            seenItemIds.add(id)
            likedItems.push({ name: item.name, categoryName: cat.name, likesCount: item.likesCount ?? 0 })
          }
        }
        for (const sub of cat.subcategories ?? []) {
          for (const item of sub.items ?? []) {
            const id = item._id?.toString()
            if (id && !seenItemIds.has(id) && (item.likesCount ?? 0) > 0) {
              seenItemIds.add(id)
              likedItems.push({ name: item.name, categoryName: cat.name, likesCount: item.likesCount ?? 0 })
            }
          }
        }
      }
    }
    likedItems.sort((a, b) => b.likesCount - a.likesCount)
    const topLiked = likedItems.slice(0, 5).map((item, idx) => ({
      _id: `liked-${idx}`, name: item.name, category: item.categoryName, count: 0, likesCount: item.likesCount,
    }))
    const funnel = {
      menuOpened: Math.round(totalOrders30 * 3.5),
      dishViewed: Math.round(totalOrders30 * 2.5),
      dishAdded: Math.round(totalOrders30 * 1.5),
      checkoutStarted: Math.round(totalOrders30 * 1.1),
      orderCompleted: totalOrders30,
    }

    // ── Process Calificaciones ──
    let safeDecrypt: ((data: string) => string) | null = null
    try {
      const cryptoMod = await import('@/lib/crypto')
      safeDecrypt = cryptoMod.safeDecrypt
    } catch { /* ignore */ }

    const agg = ratingAgg[0]
    const distribution: Record<string, number> = {}
    for (const s of [1, 2, 3, 4, 5]) {
      distribution[String(s)] = agg ? agg.dist.filter((x: number) => x === s).length : 0
    }
    const calificaciones = recentRatingsRaw.map((r: any) => {
      const order = r.orderId as any
      let customerName = 'Anónimo'
      let customerPhone = ''
      if (order?.customer?.name && safeDecrypt) {
        try { customerName = safeDecrypt(order.customer.name) } catch { customerName = 'Anónimo' }
      } else if (order?.customer?.name) { customerName = order.customer.name }
      if (order?.customer?.phone && safeDecrypt) {
        try { customerPhone = safeDecrypt(order.customer.phone) } catch { /* ignore */ }
      } else if (order?.customer?.phone) { customerPhone = order.customer.phone }
      return {
        id: r._id.toString(), rating: r.stars, comment: r.comment || '',
        orderNumber: order?.orderNumber ?? '—', customerName, phone: customerPhone, createdAt: r.createdAt,
      }
    })

    // ── Process Club ──
    const club = clubStats[0] || { totalMembers: 0, membersWithPoints: 0, totalPoints: 0 }

    // ── Process Margin Recovery ──
    const mr = marginRecoveryAgg[0] || { totalSurcharge: 0, totalPlatformFee: 0, totalOrders: 0, avgSurchargePercent: 0 }
    const marginRecovery = {
      totalSurcharge: mr.totalSurcharge,
      totalPlatformFee: mr.totalPlatformFee,
      netRecovered: mr.totalSurcharge - mr.totalPlatformFee,
      orderCount: mr.totalOrders,
      avgSurchargePercent: Math.round(mr.avgSurchargePercent * 10) / 10,
    }

    // ── Process Delivery Conciliation ──
    const deliveryConciliation = deliveryDailyRaw.map((d: any) => ({
      date: d._id,
      orderCount: d.orderCount,
      deliveryCollected: d.deliveryCollected,
      platformFees: d.platformFees,
      netForDelivery: d.deliveryCollected - d.platformFees,
    }))

    return NextResponse.json({
      stats: { total: totalOrders, pending: pendingOrders, confirmed: confirmedOrders, cancelled: cancelledOrders },
      kpis: { revenue, avgTicket, cancRate, orderCount: thisMonth.count, growth, prevRevenue, prevCancRate, cancTrend },
      ico: { icoScore, capacityScore, band, history: historySorted.map(h => ({ week: h.date.toISOString().slice(0, 10), score: h.icoScore })), hasEnoughData: orders30Count >= 10, totalOrders: orders30Count },
      metodosPago,
      comisiones: { pending, balance, threshold, orderCount: commissionOrderCount },
      menuActividad: { mostSold, topLiked, funnel },
      calificaciones: { avgRating: agg ? Math.round(agg.avg * 10) / 10 : 0, total: agg?.count ?? 0, distribution, calificaciones },
      club,
      pedidosRecientes: recentOrders,
      marginRecovery,
      deliveryConciliation,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[dashboard/summary GET]', msg)
    return NextResponse.json({ error: 'Error al obtener resumen', detail: msg }, { status: 500 })
  }
}
