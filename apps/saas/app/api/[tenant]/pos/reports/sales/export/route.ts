import { NextResponse } from 'next/server'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { logAudit } from '@/lib/audit'
import { posRoute } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { resolvePosRole } from '@/lib/pos-online/permissions'
import { describeSalesFilters, loadSalesView, parseSalesFilters } from '@/lib/metrics/salesView'
import { buildSalesPdf, buildSalesXlsx } from '@/lib/metrics/salesReportFile'

// ============================================================================
// GET /api/[tenant]/pos/reports/sales/export?format=pdf|xlsx&from&to
// ============================================================================
// Fase I: «Cierre de ventas» del día o del período en PDF y Excel, con los
// mismos números del Resumen y de Ventas. Solo encargado y admin (incluye
// ingresos). Auditado.
// ============================================================================

const MAX_ROWS = 5000

export const GET = posRoute('cash.read', async (ctx) => {
  const role = resolvePosRole(ctx.user.role)
  if (role !== 'manager' && role !== 'admin') throw PosError.forbidden('Los reportes descargables son para el encargado o el administrador')
  const p = new URL(ctx.request.url).searchParams
  const format = p.get('format')
  if (format !== 'pdf' && format !== 'xlsx') throw PosError.validation('format debe ser pdf o xlsx')

  // 2026-10-25: el export respeta los MISMOS filtros que la vista (canal,
  // estado, medio, facturación, modo, plataforma, franja horaria, búsqueda).
  const filters = parseSalesFilters(p)
  let view
  try {
    view = await loadSalesView(ctx.tenantId, ctx.locationId, { from: p.get('from') ?? undefined, to: p.get('to') ?? undefined }, filters, { all: true })
  } catch (err) {
    throw PosError.validation(err instanceof Error ? err.message : 'Rango inválido')
  }
  const metrics = { range: view.range, metrics: view.metrics }
  const rows = format === 'xlsx' ? view.rows.slice(0, MAX_ROWS) : []

  const [tenant, location] = await Promise.all([
    Tenant.findById(ctx.tenantId).select('name').lean<{ name?: string }>(),
    Location.findOne({ _id: ctx.locationId, tenantId: ctx.tenantId }).select('name').lean<{ name?: string }>(),
  ])
  const data = {
    tenantName: tenant?.name ?? '',
    locationName: location?.name ?? '',
    range: metrics.range,
    metrics: metrics.metrics,
    rows,
    extra: { filtersLabel: describeSalesFilters(filters), invoicing: view.invoicing, cost: view.cost, products: view.products },
  }
  const file = format === 'pdf' ? buildSalesPdf(data) : await buildSalesXlsx(data)
  const name = `ventas_${metrics.range.from}${metrics.range.to !== metrics.range.from ? `_${metrics.range.to}` : ''}.${format}`

  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.report.export',
    entity: 'Report',
    entityId: name,
    details: { format, range: metrics.range, filters },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })

  return new NextResponse(new Uint8Array(file), {
    status: 200,
    headers: {
      'Content-Type': format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  })
})
