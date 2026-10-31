import { NextRequest, NextResponse } from 'next/server'
import { loadCommissionWeeks, summarizeAlerts } from '@/lib/commission-weeks'
import { commissionsTenant } from '../_shared'

/**
 * GET /api/{tenant}/commissions/weeks (admin · manager · cajero)
 * Semanas con comisión (transferencia delivery), de la más nueva a la más
 * vieja, con estado (en_curso · pendiente · vencida · pagada) y montos en
 * centavos, más el resumen de avisos.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const ctx = await commissionsTenant(request, (await params).tenant)
    if ('error' in ctx) return ctx.error
    // MercadoPago / Kripton (cobradas automáticamente) NO viajan por el panel
    // del comercio, ni siquiera con sesión de superadmin (30/10/2026): lo
    // cobrado por MP de cada comercio se ve solo en Superadmin › Comisiones.
    const weeks = await loadCommissionWeeks(ctx.tenant._id, { tz: ctx.tz })
    return NextResponse.json(
      {
        alerts: summarizeAlerts(weeks),
        weeks: weeks
          .slice()
          .reverse()
          .map((w) => ({
            key: w.key,
            weekStart: w.weekStart,
            weekEnd: w.weekEnd,
            dueAt: w.dueAt,
            status: w.status,
            totalCents: w.totalCents,
            settledCents: w.settledCents,
            pendingCents: w.pendingCents,
            orderCount: w.orderCount,
            pendingOrderCount: w.pendingOrderIds.length,
          })),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    console.error('[commissions/weeks]', error)
    return NextResponse.json({ error: 'Error al calcular comisiones' }, { status: 500 })
  }
}
