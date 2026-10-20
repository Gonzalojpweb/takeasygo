/**
 * Admin Dashboard — ICO
 *
 * GET /api/[tenant]/admin/dashboard/ico
 *
 * Returns ICO score, component breakdown, capacity, and trend history.
 * Uses Tenant + ICOSnapshot models to avoid TDZ.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveDashboardScope } from '@/lib/dashboard-scope'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params

    const resolved = await resolveDashboardScope<{ _id: any; cachedScores?: { icoScore: number | null; capacityScore: number | null; updatedAt: Date | null } }>(request, tenantSlug, { select: 'cachedScores', tenantOnly: true })
    if (!resolved.ok) return resolved.response
    const { tenant, match: sedeMatch } = resolved.scope

    const ICOSnapshotMod = await import('@/models/ICOSnapshot')
    const ICOSnapshot = ICOSnapshotMod.default

    const tenantId = tenant._id

    const icoScore = tenant.cachedScores?.icoScore ?? null
    const capacityScore = tenant.cachedScores?.capacityScore ?? null

    // Last 8 snapshots for sparkline trend
    const history = await ICOSnapshot.find({ tenantId, ...sedeMatch })
      .sort({ date: -1 })
      .limit(8)
      .select('date icoScore')
      .lean<Array<{ date: Date; icoScore: number }>>()

    const historySorted = [...history].reverse()

    // Determine band
    let band: { label: string; level: string } | null = null
    if (icoScore !== null) {
      if (icoScore >= 91) band = { label: 'Alta consistencia', level: 'green' }
      else if (icoScore >= 76) band = { label: 'Operación estable', level: 'green-light' }
      else if (icoScore >= 51) band = { label: 'En consolidación', level: 'amber' }
      else band = { label: 'Ajustes necesarios', level: 'red' }
    }

    // Check if we have enough data (at least 10 orders in last 30 days)
    const OrderMod = await import('@/models/Order')
    const Order = OrderMod.default

    const start30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const orders30 = await Order.countDocuments({ tenantId, ...sedeMatch, deletedAt: null, createdAt: { $gte: start30 } })
    const hasEnoughData = orders30 >= 10

    return NextResponse.json({
      icoScore,
      capacityScore,
      band,
      history: historySorted.map(h => ({ week: h.date.toISOString().slice(0, 10), score: h.icoScore })),
      hasEnoughData,
      totalOrders: orders30,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[dashboard/ico GET]', msg)
    return NextResponse.json({ error: 'Error al obtener ICO', detail: msg }, { status: 500 })
  }
}
