import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { loadPlatformRevenue, parseRevenueRange } from '@/lib/platform-revenue'

// ============================================================================
// GET /api/superadmin/ingresos?from=YYYY-MM-DD&to=YYYY-MM-DD&group=week|month&tenant=<id>
// ============================================================================
// Ingresos de la plataforma por comisiones (lib/platform-revenue): por semana
// o por mes, por medio de pago y por comercio. Solo superadmin, solo lectura.
// ============================================================================

export async function GET(request: NextRequest) {
  const authError = await requireSuperAdmin('ingresos', request)
  if (authError) return authError
  const p = request.nextUrl.searchParams
  let range
  try {
    range = parseRevenueRange(p.get('from'), p.get('to'))
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
  const group = p.get('group') === 'month' ? 'month' : 'week'
  try {
    await connectDB()
    return NextResponse.json(await loadPlatformRevenue({ range, group, tenantId: p.get('tenant') }))
  } catch (err) {
    console.error('[superadmin/ingresos]', err)
    return NextResponse.json({ error: 'No se pudieron calcular los ingresos' }, { status: 500 })
  }
}
