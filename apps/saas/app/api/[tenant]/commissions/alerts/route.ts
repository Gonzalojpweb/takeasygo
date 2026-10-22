import { NextRequest, NextResponse } from 'next/server'
import { loadCommissionWeeks, summarizeAlerts } from '@/lib/commission-weeks'
import { commissionsTenant } from '../_shared'

/**
 * GET /api/{tenant}/commissions/alerts (admin · manager · cajero)
 * Nivel de aviso del centro de notificaciones del panel:
 *   vencida > pendiente > acumulada > none, con montos en centavos.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const ctx = await commissionsTenant(request, (await params).tenant)
    if ('error' in ctx) return ctx.error
    const weeks = await loadCommissionWeeks(ctx.tenant._id, { tz: ctx.tz })
    return NextResponse.json(summarizeAlerts(weeks), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[commissions/alerts]', error)
    return NextResponse.json({ error: 'Error al calcular comisiones' }, { status: 500 })
  }
}
