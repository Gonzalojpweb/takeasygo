import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import WeeklyCommissionStatement from '@/models/WeeklyCommissionStatement'
import { requireAdminRole } from '@/lib/apiAuth'
import { toPesos } from '@takeasygo/business'

/**
 * GET /api/{tenant}/commissions/weekly-statements
 *
 * Retorna el historial de statements semanales congelados.
 *
 * Response: { statements: [{ weekStart, weekEnd, amount, status, closedAt, paidAt, orderCount }] }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
      .select('_id')
      .lean()
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const authError = await requireAdminRole(request, tenant._id.toString())
    if (authError) return authError

    const statements = await WeeklyCommissionStatement.find({ tenantId: tenant._id })
      .sort({ weekStart: -1 })
      .limit(12)
      .lean()

    return NextResponse.json({
      statements: statements.map(s => ({
        weekStart: s.weekStart,
        weekEnd: s.weekEnd,
        amount: toPesos(s.amount),
        status: s.status,
        closedAt: s.closedAt,
        paidAt: s.paidAt,
        orderCount: s.orderCount,
      })),
    })
  } catch (error: any) {
    console.error('[commissions/weekly-statements]', error)
    return NextResponse.json(
      { error: error?.message || 'Error interno' },
      { status: 500 }
    )
  }
}
