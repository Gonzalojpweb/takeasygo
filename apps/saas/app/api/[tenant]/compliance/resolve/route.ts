/**
 * API: Compliance Resolve
 *
 * Resuelve alertas de compliance desde el panel del admin (botón "Descartar"
 * del ComplianceAlertBanner). Antes esa acción sólo ponía `dismissed` en
 * estado React, así que volvía a aparecer en cada recarga.
 *
 * Sólo se pueden resolver niveles 1 y 2: L3 es el bloqueo de pedidos y tiene
 * que liberarse avanzando el pedido, nunca desde este endpoint.
 *
 * POST /api/[tenant]/compliance/resolve
 * body: { alertIds?: string[] }   // sin ids = todas las L2 abiertas del tenant
 */

import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { ComplianceAlertModel } from '@takeasygo/db/models/compliance-alert'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { resolveAlerts } from '@/lib/compliance-alerts'

const MAX_ALERTS_PER_REQUEST = 200

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
      .select('_id')
      .lean()
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    let body: { alertIds?: unknown } = {}
    const raw = await request.text()
    if (raw) {
      try {
        body = JSON.parse(raw)
      } catch {
        return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
      }
    }

    const filter: Record<string, unknown> = {
      tenantId: tenant._id,
      resolvedAt: null,
      level: { $in: [1, 2] },
    }

    if (Array.isArray(body.alertIds)) {
      const ids = body.alertIds
        .filter((id): id is string => typeof id === 'string' && mongoose.Types.ObjectId.isValid(id))
        .slice(0, MAX_ALERTS_PER_REQUEST)
      if (!ids.length) {
        return NextResponse.json({ error: 'Sin alertas válidas' }, { status: 400 })
      }
      filter._id = { $in: ids }
    }

    const alerts = await ComplianceAlertModel.find(filter).select('_id').lean()
    const resolved = await resolveAlerts(
      alerts.map((a) => a._id),
      { resolvedBy: 'admin', resolution: 'justified' }
    )

    return NextResponse.json({ success: true, resolved })
  } catch (error) {
    console.error('[compliance/resolve] Error:', error)
    return NextResponse.json({ error: 'Error resolviendo alertas' }, { status: 500 })
  }
}
