import { NextResponse } from 'next/server'
import { posRoute } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { resolvePosRole } from '@/lib/pos-online/permissions'
import { loadSalesMetrics, type SalesMetrics } from '@/lib/metrics/sales'

// ============================================================================
// GET /api/[tenant]/pos/reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD
// ============================================================================
// Fase G: métricas de ventas de la sede del token desde el SERVIDOR (no la
// caché del dispositivo), separadas por canal (Salón · Mostrador · App ·
// Delivery), con comensales, métodos de pago, categorías, horas y top.
// Sin from/to = hoy (zona de la sede). Rango máximo: un año.
//
// Roles: caja, encargado, admin. El CAJERO ve ventas, ticket promedio y
// comensales pero NO ingresos (decisión del 24/10): los montos llegan en null
// y `revenueVisible: false`.
// ============================================================================

/** Quita los montos para roles sin acceso a ingresos (null = oculto). */
function redactRevenue(m: SalesMetrics) {
  const hide = <T extends object>(o: T, keys: (keyof T)[]) => ({ ...o, ...Object.fromEntries(keys.map((k) => [k, null])) })
  return {
    totals: { ...hide(m.totals, ['revenue', 'discounts', 'perGuest']), voided: { count: m.totals.voided.count, amount: null }, itemVoids: { count: m.totals.itemVoids.count, amount: null, wasteAmount: null } },
    byChannel: Object.fromEntries(Object.entries(m.byChannel).map(([k, v]) => [k, hide(v, ['revenue'])])),
    byPayment: m.byPayment.map((p) => ({ ...p, amount: null })),
    byCategory: m.byCategory.map((c) => ({ ...c, revenue: null })),
    byHour: m.byHour.map((h) => ({ ...h, revenue: null })),
    topProducts: m.topProducts.map((p) => ({ ...p, revenue: null })),
  }
}

export const GET = posRoute('cash.read', async (ctx) => {
  const params = new URL(ctx.request.url).searchParams
  let result
  try {
    result = await loadSalesMetrics(ctx.tenantId, ctx.locationId, {
      from: params.get('from') ?? undefined,
      to: params.get('to') ?? undefined,
    })
  } catch (err) {
    throw PosError.validation(err instanceof Error ? err.message : 'Rango inválido')
  }
  const revenueVisible = resolvePosRole(ctx.user.role) !== 'cashier'
  return NextResponse.json({
    range: result.range,
    timezone: result.timezone,
    revenueVisible,
    metrics: revenueVisible ? result.metrics : redactRevenue(result.metrics),
  })
})
