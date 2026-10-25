import { NextResponse } from 'next/server'
import { posRoute } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { resolvePosRole } from '@/lib/pos-online/permissions'
import { loadSalesView, parseSalesFilters, redactSalesView } from '@/lib/metrics/salesView'

// ============================================================================
// GET /api/[tenant]/pos/reports/sales/view — contexto Ventas del POS
// ============================================================================
// ?from&to (días, zona de la sede) + filtros (lib/metrics/salesView):
// channel, status, payment, invoice, mode, platform, hourFrom, hourTo, q,
// page, pageSize. Devuelve KPIs, desgloses, facturación, costo (inventario)
// y el listado, todo sobre el MISMO conjunto filtrado.
// Caja, encargado y admin (cash.read). El cajero ve cantidades, no dinero
// ni costos (mismo criterio que /reports/sales).
// ============================================================================

export const GET = posRoute('cash.read', async (ctx) => {
  const p = new URL(ctx.request.url).searchParams
  let view
  try {
    view = await loadSalesView(
      ctx.tenantId,
      ctx.locationId,
      { from: p.get('from') ?? undefined, to: p.get('to') ?? undefined },
      parseSalesFilters(p),
      { page: Number(p.get('page') ?? 0) || 0, pageSize: Number(p.get('pageSize') ?? 20) || 20 }
    )
  } catch (err) {
    throw PosError.validation(err instanceof Error ? err.message : 'Rango inválido')
  }
  const revenueVisible = resolvePosRole(ctx.user.role) !== 'cashier'
  return NextResponse.json({ ...(revenueVisible ? view : (redactSalesView(view) as object)), revenueVisible })
})
