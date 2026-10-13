import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { requireAuth } from '@/lib/apiAuth'
import { toPesos } from '@takeasygo/business'
import { computePeriodCommissions } from '@/lib/commissions'

/**
 * GET /api/{tenant}/commissions?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Comisiones del período con cierre exacto (lib/commissions.ts):
 *   total = settled + pending  (por método y en general)
 *
 * - total:   comisión de TakeasyGO de las órdenes aprobadas del período (todos
 *            los métodos). Efectivo genera $0.
 * - settled: parte de esas comisiones cuyas órdenes ya están cubiertas por un
 *            pago registrado (settlement con esas órdenes adentro).
 * - pending: total - settled (nunca negativo).
 * - transfer.pending: lo que el admin puede pagar con el botón de este panel.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean()
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const { searchParams } = new URL(request.url)
    const fromParam = searchParams.get('from')
    const toParam = searchParams.get('to')

    // Parse "YYYY-MM-DD" as local date (new Date("YYYY-MM-DD") parses as UTC, causing off-by-one)
    const parseLocal = (s: string) => {
      const [y, m, d] = s.split('-').map(Number)
      return new Date(y, (m ?? 1) - 1, d ?? 1)
    }

    const now = new Date()
    const from = fromParam ? parseLocal(fromParam) : new Date(now.getFullYear(), now.getMonth(), 1)
    const to = toParam ? parseLocal(toParam) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

    if (from.getTime() > to.getTime()) {
      return NextResponse.json(
        { error: 'Rango inválido: la fecha de inicio debe ser anterior o igual a la de fin' },
        { status: 400 }
      )
    }

    const period = await computePeriodCommissions(tenant._id, from, to)

    return NextResponse.json({
      from: from.toISOString(),
      to: to.toISOString(),
      total: toPesos(period.total),
      settled: toPesos(period.settled),
      pending: toPesos(period.pending),
      orderCount: period.orderCount,
      settledOrderCount: period.settledOrderCount,
      breakdown: period.breakdown.map((r) => ({
        method: r.method,
        amount: toPesos(r.total),
        settled: toPesos(r.settled),
        pending: toPesos(r.pending),
        count: r.orderCount,
      })),
      transfer: {
        total: toPesos(period.transfer.total),
        settled: toPesos(period.transfer.settled),
        pending: toPesos(period.transfer.pending),
        orderCount: period.transfer.orderCount,
      },
      unattributedSettled: toPesos(period.unattributedSettled),
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
