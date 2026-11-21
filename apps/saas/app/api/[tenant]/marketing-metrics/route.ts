/**
 * GET /api/[tenant]/marketing-metrics?from=YYYY-MM-DD&to=YYYY-MM-DD&locationId=
 *
 * Métricas de stories y promociones del comercio (CP4): solo SUS contadores
 * (tenantId del comercio) y, para usuarios de sede, solo sus sedes.
 * Sin datos personales. Ver lib/placements/report.ts.
 */
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { requireTenantRole, MANAGE_ROLES } from '@/lib/apiAuth'
import { scopeLocationFilter } from '@/lib/location-scope'
import { buildMarketingReport, parseRange } from '@/lib/placements/report'
import { dayInArgentina } from '@/lib/placements/ingest'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params
  await connectDB()
  const tenant = await Tenant.findOne({ slug, isActive: true }).select('_id').lean<{ _id: unknown }>()
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

  const authError = await requireTenantRole(request, String(tenant._id), MANAGE_ROLES)
  if (authError) return authError

  const sp = request.nextUrl.searchParams
  const range = parseRange(sp, dayInArgentina(new Date()))
  if (!range) return NextResponse.json({ error: 'Rango de fechas inválido (máximo 1 año)' }, { status: 400 })

  // Sede: la elegida (validada) o, para usuarios de sede, solo las suyas.
  const scope = await scopeLocationFilter(request, sp.get('locationId'))
  if ('error' in scope) return scope.error

  try {
    const report = await buildMarketingReport({ ...range, tenantId: String(tenant._id), locationFilter: scope.filter })
    return NextResponse.json(report)
  } catch (e) {
    console.error('[marketing-metrics]', (e as Error)?.message)
    return NextResponse.json({ error: 'No se pudieron calcular las métricas' }, { status: 500 })
  }
}
