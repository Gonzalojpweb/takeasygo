import { NextRequest, NextResponse } from 'next/server'
import FiscalDocument from '@/models/FiscalDocument'
import FiscalProfile from '@/models/FiscalProfile'
import { fiscalAdminContext } from '@/lib/fiscal/admin-context'
import { documentSummary } from '@/lib/fiscal/issue'
import { libroIvaCsv, libroIvaTotals, monthRange } from '@/lib/fiscal/libro-iva'

// ============================================================================
// GET /api/[tenant]/admin/fiscal/documents — comprobantes y Libro IVA
// ============================================================================
// Fase 5 de caja (2026-10). ?month=YYYY-MM (hora argentina)
//   · por defecto: lista de comprobantes del mes (todos los estados) y los
//     totales del Libro IVA (solo autorizados, notas de crédito restan);
//   · &format=csv: descarga el Libro IVA Ventas del mes (solo autorizados).
// Ambiente: el del perfil (producción o pruebas), nunca mezclados.
// Permiso: reports.read (el contador o el encargado lo pueden bajar).
// ============================================================================

export async function GET(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const ctx = await fiscalAdminContext(request, (await params).tenant, 'reports.read')
    if ('error' in ctx) return ctx.error

    const url = new URL(request.url)
    const month = url.searchParams.get('month') ?? new Date().toISOString().slice(0, 7)
    const range = monthRange(month)
    if (!range) return NextResponse.json({ error: 'Mes inválido (formato AAAA-MM)' }, { status: 400 })

    const profile = await FiscalProfile.findOne({ tenantId: ctx.tenant._id }).select('environment').lean<{ environment?: string }>()
    const environment = profile?.environment ?? 'homologation'
    const docs = await FiscalDocument.find({
      tenantId: ctx.tenant._id,
      environment,
      issuedAt: { $gte: range.from, $lt: range.to },
    })
      .sort({ issuedAt: -1 })
      .limit(5000)

    const authorized = docs.filter((d) => d.status === 'authorized')

    if (url.searchParams.get('format') === 'csv') {
      return new NextResponse(libroIvaCsv(authorized), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="libro-iva-ventas-${month}${environment === 'homologation' ? '-PRUEBAS' : ''}.csv"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    return NextResponse.json(
      {
        month,
        environment,
        totals: libroIvaTotals(authorized),
        pending: docs.filter((d) => d.status === 'pending' || d.status === 'retrying').length,
        rejected: docs.filter((d) => d.status === 'rejected').length,
        documents: docs.slice(0, 500).map((d) => ({
          ...documentSummary(d),
          issuedAt: d.issuedAt,
          receiver: { name: d.receiver.name, docType: d.receiver.docType, docNumber: d.receiver.docNumber, condition: d.receiver.condition },
          orderNumber: d.orderNumber,
          qrUrl: d.qrUrl,
        })),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (err) {
    console.error('[admin/fiscal/documents]', err)
    return NextResponse.json({ error: 'No se pudieron cargar los comprobantes' }, { status: 500 })
  }
}
