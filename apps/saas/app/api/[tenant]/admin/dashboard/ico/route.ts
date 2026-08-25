/**
 * Admin Dashboard — ICO
 *
 * GET /api/[tenant]/admin/dashboard/ico
 *
 * Returns ICO score, component breakdown, capacity, and trend history.
 * Uses Tenant + ICOSnapshot models to avoid TDZ.
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
      .select('_id cachedScores')
      .lean<{ _id: any; cachedScores?: { icoScore: number | null; capacityScore: number | null; updatedAt: Date | null } }>()

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    if (token.role !== 'superadmin' && token.tenantId?.toString() !== tenant._id.toString()) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const ICOSnapshotMod = await import('@/models/ICOSnapshot')
    const ICOSnapshot = ICOSnapshotMod.default

    const tenantId = tenant._id

    const icoScore = tenant.cachedScores?.icoScore ?? null
    const capacityScore = tenant.cachedScores?.capacityScore ?? null

    // Last 8 snapshots for sparkline trend
    const history = await ICOSnapshot.find({ tenantId })
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
    const orders30 = await Order.countDocuments({ tenantId, deletedAt: null, createdAt: { $gte: start30 } })
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
