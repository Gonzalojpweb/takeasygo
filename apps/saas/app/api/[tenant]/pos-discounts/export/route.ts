import { NextRequest, NextResponse } from 'next/server'
import Location from '@/models/Location'
import { logAudit } from '@/lib/audit'
import { DISCOUNT_VIEW_ROLES, discountAdminContext } from '@/lib/pos-online/discountAdmin'
import {
  APPROVAL_MODE_LABELS,
  AR_OFFSET,
  CSV_ROWS,
  SCOPE_LABELS,
  buildDiscountQuery,
  findDiscountEvents,
  parseDiscountFilters,
  reasonLabel,
} from '@/lib/pos-online/discountReport'

// ============================================================================
// GET /api/[tenant]/pos-discounts/export — CSV del reporte de descuentos
// ============================================================================
// Mismos filtros y alcance de sede que la página. Hasta CSV_ROWS filas.
// Celdas que empiezan con = + - @ se prefijan con ' (inyección de fórmulas
// al abrir en Excel/Sheets). La exportación queda en la auditoría.
// ============================================================================

function cell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value)
  // Un número negativo («-1500,00») es un importe, no una fórmula.
  if (/^[=+\-@\t\r]/.test(s) && !/^-\d+(,\d+)?$/.test(s)) s = `'${s}`
  // Separador «;»: la coma decimal de los importes no necesita comillas.
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const pesos = (cents: number | null) => (cents === null ? '' : (cents / 100).toFixed(2).replace('.', ','))

function arDateTime(d: Date): string {
  const local = new Date(d.getTime() - 3 * 3600_000).toISOString()
  return `${local.slice(0, 10)} ${local.slice(11, 19)}`
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params
  const ctx = await discountAdminContext(request, tenant, DISCOUNT_VIEW_ROLES)
  if (ctx instanceof NextResponse) return ctx

  const filters = parseDiscountFilters(new URL(request.url).searchParams)
  const query = buildDiscountQuery(ctx.tenantId, filters, ctx.scopeLocationIds)
  const [rows, locations] = await Promise.all([
    findDiscountEvents(query, CSV_ROWS),
    Location.find({ tenantId: ctx.tenantId }).select('name').lean<{ _id: unknown; name?: string }[]>(),
  ])
  const locName = new Map(locations.map((l) => [String(l._id), l.name ?? '']))

  const header = [
    `Fecha y hora (UTC${AR_OFFSET})`, 'Sede', 'Orden', 'Mesa', 'Operación', 'Alcance', 'Plato', 'Tipo', 'Valor',
    'Importe original', 'Total antes', 'Descuento aplicado', 'Importe final', 'Importe final pedido',
    'Motivo', 'Observación', 'Realizó', 'Rol', 'Autorizó', 'Autorización', 'Sin internet', 'Versión de política',
  ]
  const lines = rows.map((r) =>
    [
      arDateTime(r.occurredAt),
      locName.get(String(r.locationId)) ?? '',
      r.orderPosId.slice(0, 8),
      r.tableNumber ?? '',
      r.action === 'apply' ? 'Aplicó' : 'Quitó',
      SCOPE_LABELS[r.scope],
      r.lineName ?? '',
      r.kind === 'percent' ? '%' : r.kind === 'amount' ? '$' : '',
      r.kind === 'percent' ? r.value : r.kind === 'amount' ? pesos(r.value) : '',
      pesos(r.grossCents),
      pesos(r.totalBeforeCents),
      pesos(r.discountDeltaCents),
      pesos(r.totalAfterCents),
      pesos(r.requestedFinalCents),
      reasonLabel(r.reason),
      r.note ?? '',
      r.byName ?? r.byUserId,
      r.byRole ?? '',
      r.approverName ?? r.approvedByUserId ?? '',
      APPROVAL_MODE_LABELS[r.approvalMode],
      r.offline ? 'Sí' : 'No',
      r.policyVersion,
    ].map(cell).join(';')
  )

  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.discount_report.export',
    entity: 'PosDiscountEvent',
    entityId: ctx.tenantId,
    details: { ...filters, rows: rows.length },
    request,
    userId: ctx.userId,
    userRole: ctx.role,
  })

  // BOM: Excel abre bien las tildes. Separador «;» (configuración regional AR).
  const csv = '﻿' + [header.map(cell).join(';'), ...lines].join('\r\n')
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="descuentos-pos-${filters.from}-al-${filters.to}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
