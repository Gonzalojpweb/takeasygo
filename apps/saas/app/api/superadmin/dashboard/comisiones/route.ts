/**
 * Superadmin Dashboard — Comisiones Overview
 *
 * GET /api/superadmin/dashboard/comisiones
 *
 * Returns global commission totals:
 * - Transfer: from WeeklyCommissionStatement (frozen weekly snapshots)
 * - MP Auto-split: from Orders where tenant has mpOAuth connected (already collected)
 * - MP Sin Split: from Orders where tenant does NOT have mpOAuth (pending manual collection)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

export async function GET(request: NextRequest) {
  try {
    const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
    if (!secret) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const isSecure = process.env.NODE_ENV === 'production'
    const token = await getToken({
      req: request as any,
      secret,
      secureCookie: isSecure,
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

    const mongooseMod = await import('mongoose')
    const mongoose = mongooseMod.default ?? mongooseMod
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGODB_URI!)
    }

    const TenantMod = await import('@/models/Tenant')
    const Tenant = TenantMod.default

    const WCSMod = await import('@/models/WeeklyCommissionStatement')
    const WeeklyCommissionStatement = WCSMod.default

    const OrderMod = await import('@/models/Order')
    const Order = OrderMod.default

    // ── TRANSFER: from WeeklyCommissionStatement (frozen weekly snapshots) ──
    const transferAgg = await WeeklyCommissionStatement.aggregate([
      {
        $group: {
          _id: null,
          pending: {
            $sum: {
              $cond: [{ $in: ['$status', ['pendiente', 'vencido']] }, '$amount', 0],
            },
          },
          overdue: {
            $sum: {
              $cond: [{ $eq: ['$status', 'vencido'] }, '$amount', 0],
            },
          },
          settled: {
            $sum: {
              $cond: [{ $eq: ['$status', 'pagado'] }, '$amount', 0],
            },
          },
          statementCount: { $sum: 1 },
        },
      },
    ])

    const transfer = {
      pending: transferAgg[0]?.pending || 0,
      overdue: transferAgg[0]?.overdue || 0,
      settled: transferAgg[0]?.settled || 0,
      statementCount: transferAgg[0]?.statementCount || 0,
    }

    // ── TENANTS: get mpOAuth status for each ──
    const tenants = await Tenant.find({ isActive: true })
      .select('_id name slug mpOAuth.isConnected')
      .lean()

    const tenantsWithSplit = new Set(
      tenants.filter((t: any) => t.mpOAuth?.isConnected).map((t: any) => t._id.toString())
    )
    const tenantsWithoutSplit = new Set(
      tenants.filter((t: any) => !t.mpOAuth?.isConnected).map((t: any) => t._id.toString())
    )

    // ── MP: aggregate from Orders ──
    const mpAgg = await Order.aggregate([
      {
        $match: {
          'payment.method': 'mercadopago',
          'payment.status': 'approved',
          status: { $ne: 'cancelled' },
        },
      },
      {
        $group: {
          _id: '$tenantId',
          totalFee: { $sum: '$payment.platformFeeAmount' },
        },
      },
    ])

    let mpAutoSplit = 0
    let mpNoSplit = 0

    for (const entry of mpAgg) {
      const tid = entry._id?.toString()
      const amount = entry.totalFee || 0
      if (tenantsWithSplit.has(tid)) {
        mpAutoSplit += amount
      } else {
        mpNoSplit += amount
      }
    }

    // ── COMBINED ──
    const grandPending = transfer.pending + mpNoSplit
    const grandSettled = transfer.settled + mpAutoSplit

    // ── BY TENANT ──
    const tenantTransferPending: Record<string, number> = {}
    const tenantTransferSettled: Record<string, number> = {}
    const tenantMp: Record<string, number> = {}

    const stmtByTenant = await WeeklyCommissionStatement.aggregate([
      {
        $group: {
          _id: '$tenantId',
          pending: {
            $sum: {
              $cond: [{ $in: ['$status', ['pendiente', 'vencido']] }, '$amount', 0],
            },
          },
          settled: {
            $sum: {
              $cond: [{ $eq: ['$status', 'pagado'] }, '$amount', 0],
            },
          },
        },
      },
    ])

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

    const byTenant = tenants
      .map((t: any) => {
        const tid = t._id.toString()
        const tp = tenantTransferPending[tid] || 0
        const ts = tenantTransferSettled[tid] || 0
        const mp = tenantMp[tid] || 0
        const hasSplit = tenantsWithSplit.has(tid)
        return {
          tenantId: tid,
          name: t.name,
          slug: t.slug,
          transferPending: tp,
          transferSettled: ts,
          mpAccumulated: mp,
          mpAutoSplit: hasSplit,
          totalPending: tp + (hasSplit ? 0 : mp),
        }
      })
      .filter((t: any) => t.transferPending > 0 || t.transferSettled > 0 || t.mpAccumulated > 0)
      .sort((a: any, b: any) => b.totalPending - a.totalPending)

    return NextResponse.json({
      transfer,
      mercadopago: {
        autoSplit: mpAutoSplit,
        noSplit: mpNoSplit,
        note: 'Auto-split: cobrado automáticamente vía MP split. Sin split: pendiente de cobro manual.',
      },
      combined: {
        grandPending,
        grandSettled,
      },
      byTenant,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[dashboard/comisiones GET]', msg)
    return NextResponse.json({ error: 'Error al obtener datos', detail: msg }, { status: 500 })
  }
}
