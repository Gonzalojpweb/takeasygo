import { NextResponse } from 'next/server'
import { posRoute } from '@/lib/pos-online/route'
import { listPosFiscalDocuments } from '@/lib/fiscal/pos-documents'

// ============================================================================
// GET /api/[tenant]/pos/fiscal/documents?from=YYYY-MM-DD&to=YYYY-MM-DD
// ============================================================================
// Fase L: comprobantes electrónicos de la sede (hoy por defecto, zona de la
// sede) con su estado (autorizado con CAE/CAEA, pendiente, rechazado),
// totales facturados / notas de crédito y si cada factura ya tiene nota de
// crédito. Caja, encargado y admin (orders.pay).
// ============================================================================

export const GET = posRoute('orders.pay', async (ctx) => {
  const p = new URL(ctx.request.url).searchParams
  return NextResponse.json(await listPosFiscalDocuments(ctx.tenantId, ctx.locationId, { from: p.get('from'), to: p.get('to') }))
})
