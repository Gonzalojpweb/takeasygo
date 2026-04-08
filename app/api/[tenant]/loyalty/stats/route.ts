import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import LoyaltyMember from '@/models/LoyaltyMember'
import Order from '@/models/Order'
import { requireAuth } from '@/lib/apiAuth'
import { canAccess } from '@/lib/plans'
import type { Plan } from '@/lib/plans'
import mongoose from 'mongoose'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    const { searchParams } = request.nextUrl
    const days = Math.min(365, Math.max(7, parseInt(searchParams.get('days') ?? '30', 10)))

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
      .select('_id plan')
      .lean<{ _id: mongoose.Types.ObjectId; plan: Plan }>()

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    if (!canAccess(tenant.plan, 'loyaltyClub')) {
      return NextResponse.json({ error: 'Tu plan no incluye el Club de Fidelización' }, { status: 403 })
    }

    const dateFrom = new Date()
    dateFrom.setDate(dateFrom.getDate() - days)

    const [
      totalMembers,
      activeMembers,
      inactiveMembers,
      blockedMembers,
      recentMembers,
      bySource,
      topSpenders,
    ] = await Promise.all([
      LoyaltyMember.countDocuments({ tenantId: tenant._id }),
      LoyaltyMember.countDocuments({ tenantId: tenant._id, status: 'active' }),
      LoyaltyMember.countDocuments({ tenantId: tenant._id, status: 'inactive' }),
      LoyaltyMember.countDocuments({ tenantId: tenant._id, status: 'blocked' }),
      LoyaltyMember.find({ tenantId: tenant._id, joinedAt: { $gte: dateFrom } })
        .sort({ joinedAt: -1 })
        .limit(10)
        .select('name phone email joinedAt source')
        .lean<any[]>(),
      LoyaltyMember.aggregate([
        { $match: { tenantId: tenant._id } },
        { $group: { _id: '$source', count: { $sum: 1 } } },
      ]),
      LoyaltyMember.find({ tenantId: tenant._id, status: 'active' })
        .sort({ 'cache.totalSpent': -1 })
        .limit(5)
        .select('name phone cache.totalOrders cache.totalSpent')
        .lean<any[]>(),
    ])

    const membersWithMaskedPhone = recentMembers.map(m => ({
      ...m,
      phone: m.phone ? `****${m.phone.slice(-4)}` : '',
    }))

    const topSpendersMasked = topSpenders.map(m => ({
      ...m,
      phone: m.phone ? `****${m.phone.slice(-4)}` : '',
    }))

    const sourceStats = {
      checkout:      0,
      qr_scan:       0,
      admin:         0,
      manual_import: 0,
    }
    bySource.forEach(s => {
      if (s._id in sourceStats) sourceStats[s._id as keyof typeof sourceStats] = s.count
    })

    const customersWithOrders = await LoyaltyMember.distinct('_id', {
      tenantId: tenant._id,
      'cache.totalOrders': { $gt: 0 },
    })

    const returningRate = totalMembers > 0
      ? Math.round((customersWithOrders.length / totalMembers) * 100)
      : 0

    const totalRevenue = await Order.aggregate([
      {
        $match: {
          tenantId: tenant._id,
          payment: { $elemMatch: { status: 'approved' } },
          createdAt: { $gte: dateFrom },
        },
      },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ])

    const revenueFromMembers = await Order.aggregate([
      {
        $match: {
          tenantId: tenant._id,
          'payment.status': 'approved',
          'customer.phoneHash': { $exists: true, $ne: null },
          createdAt: { $gte: dateFrom },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$total' },
          orders: { $sum: 1 },
        },
      },
    ])

    return NextResponse.json({
      overview: {
        total:      totalMembers,
        active:     activeMembers,
        inactive:   inactiveMembers,
        blocked:    blockedMembers,
        returningRate,
      },
      bySource: sourceStats,
      recentMembers: membersWithMaskedPhone,
      topSpenders: topSpendersMasked,
      period: { days, dateFrom: dateFrom.toISOString() },
      revenue: {
        total:        totalRevenue[0]?.total ?? 0,
        fromMembers:  revenueFromMembers[0]?.total ?? 0,
        ordersFromMembers: revenueFromMembers[0]?.orders ?? 0,
        memberShare:  totalRevenue[0]?.total > 0
          ? Math.round((revenueFromMembers[0]?.total / totalRevenue[0].total) * 100)
          : 0,
      },
    })
  } catch (error) {
    console.error('[loyalty/stats GET]', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
