/**
 * API: Compliance Status
 *
 * Retorna el estado de compliance para la sede activa del admin.
 * Usado por el frontend para decidir si mostrar ComplianceAlertBanner (L2)
 * o ComplianceBlockModal (L3).
 *
 * GET /api/[tenant]/compliance/status?locationId=xxx
 */

import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { ComplianceAlertModel } from '@takeasygo/db/models/compliance-alert'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const url = new URL(request.url)
    const locationId = url.searchParams.get('locationId')

    // Build filter: alerts for this tenant, optionally filtered by location
    const filter: Record<string, unknown> = {
      tenantId: tenant._id,
      resolvedAt: null,
    }
    if (locationId) {
      filter.locationId = locationId
    }

    const alerts = await ComplianceAlertModel.find(filter)
      .sort({ level: -1, triggeredAt: -1 })
      .lean()

    // Determine blocked locations (any location with L3 alerts)
    const blockedLocations = [
      ...new Set(
        alerts
          .filter((a) => a.level === 3)
          .map((a) => a.locationId.toString())
      ),
    ]

    // Determine locations with L2 alerts (for banner)
    const warningLocations = [
      ...new Set(
        alerts
          .filter((a) => a.level === 2)
          .map((a) => a.locationId.toString())
      ),
    ]

    const hasLevel3 = blockedLocations.length > 0
    const hasLevel2 = warningLocations.length > 0

    return NextResponse.json({
      hasLevel3,
      hasLevel2,
      blockedLocations,
      warningLocations,
      alerts: alerts.map((a) => ({
        _id: a._id.toString(),
        orderId: a.orderId.toString(),
        orderNumber: a.orderNumber,
        level: a.level,
        fromStatus: a.fromStatus,
        toStatus: a.toStatus,
        locationId: a.locationId.toString(),
        triggeredAt: a.triggeredAt,
        clientConfirmed: a.clientConfirmed,
      })),
      total: alerts.length,
    })
  } catch (error) {
    console.error('[compliance/status] Error:', error)
    return NextResponse.json(
      { error: 'Error obteniendo estado de compliance' },
      { status: 500 }
    )
  }
}
