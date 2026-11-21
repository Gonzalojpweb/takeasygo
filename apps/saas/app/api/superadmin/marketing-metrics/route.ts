/**
 * GET /api/superadmin/marketing-metrics?from=YYYY-MM-DD&to=YYYY-MM-DD&tenantId=&placement=
 *
 * Métricas de stories y promociones (CP4): totales, por pieza, círculo de
 * stories, salidas por posición y serie diaria. Sin datos personales: solo
 * contadores de PlacementDailyStat. Ver lib/placements/report.ts.
 */
import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { connectDB } from '@/lib/mongoose'
import { buildMarketingReport, parseRange, tenantNameOf } from '@/lib/placements/report'
import { dayInArgentina } from '@/lib/placements/ingest'
import { PLACEMENTS, type Placement } from '@/models/PlacementDailyStat'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const authError = await requireSuperAdmin()
  if (authError) return authError
  const sp = request.nextUrl.searchParams
  const range = parseRange(sp, dayInArgentina(new Date()))
  if (!range) return NextResponse.json({ error: 'Rango de fechas inválido (máximo 1 año)' }, { status: 400 })
  const tenantId = sp.get('tenantId')
  if (tenantId && !mongoose.Types.ObjectId.isValid(tenantId)) return NextResponse.json({ error: 'Comercio inválido' }, { status: 400 })
  const placement = sp.get('placement')
  if (placement && !(PLACEMENTS as readonly string[]).includes(placement)) return NextResponse.json({ error: 'Superficie inválida' }, { status: 400 })
  try {
    await connectDB()
    const report = await buildMarketingReport({ ...range, tenantId, placement: (placement as Placement) || null })
    return NextResponse.json({ ...report, tenantName: tenantId ? await tenantNameOf(tenantId) : null })
  } catch (e) {
    console.error('[superadmin/marketing-metrics]', (e as Error)?.message)
    return NextResponse.json({ error: 'No se pudieron calcular las métricas' }, { status: 500 })
  }
}
