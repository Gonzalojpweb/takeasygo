import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import CommissionSettlement from '@/models/CommissionSettlement'
import { getSessionUser } from '@/lib/apiAuth'
import { canViewCommissions } from '@/lib/commission-access'
import { toPesos } from '@takeasygo/business'

/**
 * GET /api/{tenant}/commissions/settlements
 *
 * Retorna el historial de pagos de comisiones del comercio (admin, manager
 * y cajero: lib/commission-access.ts).
 *
 * Response: { settlements: Array<{ from, to, amountCollected, collectedBy, collectedAt, notes }> }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean()
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const user = await getSessionUser(request)
    if (!user?.role) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    if ((user.role !== 'superadmin' && user.tenantId !== tenant._id.toString()) || !canViewCommissions(user.role)) {
      return NextResponse.json({ error: 'Tu rol no tiene acceso a comisiones' }, { status: 403 })
    }

    const settlements = await CommissionSettlement.find({ tenantId: tenant._id })
      .sort({ collectedAt: -1 })
      .limit(50)
      .select('from to amountCollected collectedBy collectedAt notes orderIds')
      .lean()

    return NextResponse.json({
      settlements: settlements.map((s) => ({
        from: s.from,
        to: s.to,
        amountCollected: toPesos(s.amountCollected),
        collectedBy: s.collectedBy,
        collectedAt: s.collectedAt,
        notes: s.notes,
        orderCount: s.orderIds?.length ?? 0,
      })),
    })
  } catch (error: any) {
    console.error('[commissions/settlements]', error)
    return NextResponse.json(
      { error: error?.message || 'Error interno' },
      { status: 500 }
    )
  }
}
