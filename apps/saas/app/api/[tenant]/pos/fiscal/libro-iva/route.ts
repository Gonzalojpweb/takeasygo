import { NextResponse } from 'next/server'
import FiscalDocument from '@/models/FiscalDocument'
import { logAudit } from '@/lib/audit'
import { posRoute } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { resolvePosRole } from '@/lib/pos-online/permissions'
import { libroIvaCsv, libroIvaTotals, monthRange } from '@/lib/fiscal/libro-iva'
import { libroIvaDigitalFiles } from '@/lib/fiscal/libro-iva-digital'
import { fiscalEnvironment } from '@/lib/fiscal/pos-documents'

// ============================================================================
// GET /api/[tenant]/pos/fiscal/libro-iva?month=YYYY-MM&format=
// ============================================================================
// Fase L (decisión 24/10): Libro IVA desde el POS, SOLO encargado y admin.
//   · sin format → totales del mes (autorizados; notas de crédito restan).
//   · format=csv → Libro IVA Ventas.
//   · format=lid-cbte | lid-alicuotas → archivos del Libro IVA Digital de ARCA.
// El Libro IVA es del CUIT (todas las sedes), igual que en el panel.
// ============================================================================

export const GET = posRoute('orders.pay', async (ctx) => {
  const role = resolvePosRole(ctx.user.role)
  if (role !== 'manager' && role !== 'admin') throw PosError.forbidden('El Libro IVA es para el encargado o el administrador')
  const p = new URL(ctx.request.url).searchParams
  const month = p.get('month') ?? new Date().toISOString().slice(0, 7)
  const range = monthRange(month)
  if (!range) throw PosError.validation('Mes inválido (formato AAAA-MM)')
  const environment = await fiscalEnvironment(ctx.tenantId)
  const docs = await FiscalDocument.find({ tenantId: ctx.tenantId, environment, status: 'authorized', issuedAt: { $gte: range.from, $lt: range.to } })
    .sort({ issuedAt: 1 })
    .limit(10000)
  const suffix = environment === 'homologation' ? '_PRUEBAS' : ''
  const format = p.get('format')

  if (format) {
    await logAudit({
      tenantId: ctx.tenantId, action: 'pos.fiscal.libro_iva', entity: 'Report', entityId: month,
      details: { format, environment }, request: ctx.request, userId: ctx.user.id, userRole: ctx.user.role,
    })
  }
  if (format === 'csv') {
    return new NextResponse(libroIvaCsv(docs), {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="libro-iva-ventas-${month}${suffix}.csv"`, 'Cache-Control': 'no-store' },
    })
  }
  if (format === 'lid-cbte' || format === 'lid-alicuotas') {
    const files = libroIvaDigitalFiles(docs)
    const body = format === 'lid-cbte' ? files.comprobantes : files.alicuotas
    const name = `LIBRO_IVA_DIGITAL_VENTAS_${format === 'lid-cbte' ? 'CBTE' : 'ALICUOTAS'}_${month.replace('-', '')}${suffix}.txt`
    return new NextResponse(Buffer.from(body, 'latin1'), {
      headers: { 'Content-Type': 'text/plain; charset=iso-8859-1', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' },
    })
  }
  if (format) throw PosError.validation('format debe ser csv, lid-cbte o lid-alicuotas')
  return NextResponse.json({ month, environment, totals: libroIvaTotals(docs) })
})
