/**
 * Admin Dashboard — Calificaciones
 *
 * GET /api/[tenant]/admin/dashboard/calificaciones
 *
 * Returns ratings with customer info (name, phone from order).
 * Uses Rating + Order models to avoid TDZ.
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
      .select('_id')
      .lean<{ _id: any }>()

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    if (token.role !== 'superadmin' && token.tenantId?.toString() !== tenant._id.toString()) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const RatingMod = await import('@/models/Rating')
    const Rating = RatingMod.default

    const OrderMod = await import('@/models/Order')
    const Order = OrderMod.default

    const tenantId = tenant._id

    // Get ratings with populated order for customer info
    const recentRaw = await Rating.find({ tenantId })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('orderId', 'orderNumber customer.name customer.phone')
      .lean()

    // Distribution
    const aggResult = await Rating.aggregate([
      { $match: { tenantId } },
      { $group: { _id: null, avg: { $avg: '$stars' }, count: { $sum: 1 }, dist: { $push: '$stars' } } },
    ])

    const agg = aggResult[0]
    const distributionArray = [1, 2, 3, 4, 5].map(s => ({
      stars: s,
      count: agg ? agg.dist.filter((x: number) => x === s).length : 0,
    }))

    // Convert to Record<string, number> for component
    const distribution: Record<string, number> = {}
    for (const d of distributionArray) {
      distribution[String(d.stars)] = d.count
    }

    const avgRating = agg ? Math.round(agg.avg * 10) / 10 : 0
    const total = agg?.count ?? 0

    // Decrypt customer info from orders
    let safeDecrypt: ((data: string) => string) | null = null
    try {
      const cryptoMod = await import('@/lib/crypto')
      safeDecrypt = cryptoMod.safeDecrypt
    } catch {
      // crypto module may not exist, skip decryption
    }

    const recent = recentRaw.map((r: any) => {
      const order = r.orderId as any
      let customerName = 'Anónimo'
      let customerPhone = ''

      if (order?.customer?.name && safeDecrypt) {
        try { customerName = safeDecrypt(order.customer.name) } catch { customerName = 'Anónimo' }
      } else if (order?.customer?.name) {
        customerName = order.customer.name
      }

      if (order?.customer?.phone && safeDecrypt) {
        try { customerPhone = safeDecrypt(order.customer.phone) } catch { /* ignore */ }
      } else if (order?.customer?.phone) {
        customerPhone = order.customer.phone
      }

      return {
        id: r._id.toString(),
        rating: r.stars,
        comment: r.comment || '',
        orderNumber: order?.orderNumber ?? '—',
        customerName,
        phone: customerPhone,
        createdAt: r.createdAt,
      }
    })

    return NextResponse.json({ avgRating, total, distribution, calificaciones: recent })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[dashboard/calificaciones GET]', msg)
    return NextResponse.json({ error: 'Error al obtener calificaciones', detail: msg }, { status: 500 })
  }
}
