import { NextResponse } from 'next/server'
import { posRoute } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { resolvePosRole } from '@/lib/pos-online/permissions'
import { listSales } from '@/lib/metrics/salesList'
import { SALE_CHANNELS, type SaleChannel } from '@/lib/metrics/sales'

// ============================================================================
// GET /api/[tenant]/pos/reports/sales/list?from&to&channel&q&page&pageSize
// ============================================================================
// Fase I: listado de ventas de la sede desde el servidor, paginado, con el
// detalle de cada venta (canal, mesa, modo, plataforma, comensales, platos,
// pagos, descuentos, anulación). Caja, encargado y admin; el cajero recibe
// las ventas sin montos (decisión 24/10).
// ============================================================================

export const GET = posRoute('cash.read', async (ctx) => {
  const p = new URL(ctx.request.url).searchParams
  const channel = p.get('channel') ?? 'all'
  if (channel !== 'all' && !SALE_CHANNELS.includes(channel as SaleChannel)) throw PosError.validation('Canal inválido')
  let result
  try {
    result = await listSales(ctx.tenantId, ctx.locationId, {
      from: p.get('from') ?? undefined,
      to: p.get('to') ?? undefined,
      channel: channel as SaleChannel | 'all',
      q: p.get('q') ?? undefined,
      page: Number(p.get('page') ?? 0) || 0,
      pageSize: Number(p.get('pageSize') ?? 20) || 20,
    })
  } catch (err) {
    throw PosError.validation(err instanceof Error ? err.message : 'Rango inválido')
  }
  const revenueVisible = resolvePosRole(ctx.user.role) !== 'cashier'
  const rows = revenueVisible
    ? result.rows
    : result.rows.map((r) => ({
        ...r,
        total: null,
        discounts: null,
        items: r.items.map((i) => ({ ...i, total: null, discount: i.discount ? { ...i.discount, amount: null } : null })),
        payments: r.payments.map((x) => ({ ...x, amount: null })),
      }))
  return NextResponse.json({ ...result, rows, revenueVisible })
})
