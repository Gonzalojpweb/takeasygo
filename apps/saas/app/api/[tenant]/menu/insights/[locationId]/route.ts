import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import MenuInsights from '@/models/MenuInsights'
import { computeMenuInsights } from '@/lib/menu-insights'
import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'

const STALE_MS = 24 * 60 * 60 * 1000 // 24 horas

/**
 * GET /api/[tenant]/menu/insights/[locationId]
 *
 * Devuelve pares de ítems co-ocurrentes para alimentar el upselling B2C.
 * Público (no requiere auth) — la respuesta son IDs de ítems sin datos personales.
 * Cachea el resultado 24h en la colección MenuInsights.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tenant: string; locationId: string }> },
) {
  try {
    const { tenant: tenantSlug, locationId } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean()
    if (!tenant) {
      return NextResponse.json({ pairs: [], totalOrdersAnalyzed: 0 })
    }

    const tenantId = (tenant as any)._id

    // Validar que locationId es un ObjectId válido y pertenece al tenant
    if (!mongoose.Types.ObjectId.isValid(locationId)) {
      return NextResponse.json({ pairs: [], totalOrdersAnalyzed: 0 })
    }
    const locationObjId = new mongoose.Types.ObjectId(locationId)
    const location = await Location.findOne({ _id: locationObjId, tenantId, isActive: true }).lean()
    if (!location) {
      return NextResponse.json({ pairs: [], totalOrdersAnalyzed: 0 })
    }

    // Devolver caché si está vigente
    const cached = await MenuInsights.findOne({ tenantId, locationId: locationObjId }).lean()
    if (cached && Date.now() - new Date(cached.computedAt).getTime() < STALE_MS) {
      return NextResponse.json({
        pairs: cached.pairs,
        totalOrdersAnalyzed: cached.totalOrdersAnalyzed,
        computedAt: cached.computedAt,
      })
    }

    // Computar fresh
    const { pairs, totalOrdersAnalyzed } = await computeMenuInsights(tenantId, locationObjId)

    await MenuInsights.findOneAndUpdate(
      { tenantId, locationId: locationObjId },
      { pairs, totalOrdersAnalyzed, computedAt: new Date() },
      { upsert: true },
    )

    return NextResponse.json({ pairs, totalOrdersAnalyzed, computedAt: new Date() })
  } catch (error) {
    console.error('[MenuInsights] Error:', error)
    // Falla silenciosamente — el upselling vuelve al fallback de price tiers
    return NextResponse.json({ pairs: [], totalOrdersAnalyzed: 0 })
  }
}
