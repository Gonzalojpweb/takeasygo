import { NextRequest, NextResponse } from 'next/server'
import {
  buildPaymentMethodCatalog,
  loadPaymentMethodContext,
  LocationNotFoundError,
  TenantNotFoundError,
} from '@/lib/payment-methods'

// ⚠️ CACHE WARNING: If you add caching here, the cache key MUST include locationId.
// Payment methods vary per-sede (MP account, cash config). A global cache would
// return wrong methods for the wrong location.

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    // El mode del pedido determina si se cobra comisión de transferencia.
    // Fallback intencional a 'takeaway': si el caller no manda el parámetro,
    // el sistema falla al lado seguro (no cobra comisión de más).
    const mode = _request.nextUrl.searchParams.get('mode') || 'takeaway'
    const locationId = _request.nextUrl.searchParams.get('locationId')

    const ctx = await loadPaymentMethodContext(tenantSlug, locationId)
    const { methods, transfer } = buildPaymentMethodCatalog(ctx, mode)

    return NextResponse.json({ methods, transfer })
  } catch (error) {
    if (error instanceof TenantNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error instanceof LocationNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}