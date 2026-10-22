import { NextRequest, NextResponse } from 'next/server'
import { loadAutoCollectedByWeek, loadCommissionWeeks, summarizeAlerts } from '@/lib/commission-weeks'
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
    const [weeks, auto] = await Promise.all([
      loadCommissionWeeks(ctx.tenant._id, { tz: ctx.tz }),
      loadAutoCollectedByWeek(ctx.tenant._id, { tz: ctx.tz }),
    ])
    const autoTotal = [...auto.values()].reduce((a, w) => ({ cents: a.cents + w.cents, orders: a.orders + w.orders }), { cents: 0, orders: 0 })
    return NextResponse.json(
      {
        alerts: summarizeAlerts(weeks),
        // MercadoPago / Kripton: cobradas automáticamente (informativo).
        autoCollected: { ...autoTotal, weeks: [...auto.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.key.localeCompare(a.key)) },
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
