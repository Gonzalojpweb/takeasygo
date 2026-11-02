import { NextResponse } from 'next/server'
import { posRoute } from '@/lib/pos-online/route'
import { listControllerDocuments } from '@/lib/fiscal/controller'

// ============================================================================
// GET /api/[tenant]/pos/fiscal/controller/documents?from&to
// ============================================================================
// Comprobantes que emitió (o intentó emitir) la impresora fiscal de la sede, con
// su resultado real: lo que el POS le muestra al cajero en Facturación.
// ============================================================================

export const GET = posRoute('orders.pay', async (ctx) => {
  const params = ctx.request.nextUrl.searchParams
  return NextResponse.json(await listControllerDocuments(ctx.tenantId, ctx.locationId, { from: params.get('from'), to: params.get('to') }))
})
