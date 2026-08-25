import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import WeeklyCommissionStatement from '@/models/WeeklyCommissionStatement'
import Tenant from '@/models/Tenant'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { toPesos } from '@takeasygo/business'

/**
 * GET /api/superadmin/commissions/weekly-statements
 *
 * Retorna todos los WeeklyCommissionStatement de todos los tenants,
 * ordenados por weekStart descendente. Para la vista cross-tenant del superadmin.
 *
 * Response: { statements: [{ _id, tenantId, tenantName, tenantSlug, weekStart, weekEnd, amount, status, closedAt, paidAt, paidBy, orderCount }] }
 */
export async function GET(request: NextRequest) {
  const authError = await requireSuperAdmin()
  if (authError) return authError

  await connectDB()

  const statements = await WeeklyCommissionStatement.find()
    .sort({ weekStart: -1 })
    .limit(100)
    .lean()

  // Enriquecer con datos del tenant
  const tenantIds = [...new Set(statements.map(s => s.tenantId.toString()))]
  const tenants = await Tenant.find({ _id: { $in: tenantIds } })
    .select('slug name')
    .lean()

  const tenantMap = new Map(tenants.map(t => [t._id.toString(), { name: t.name, slug: t.slug }]))

  return NextResponse.json({
    statements: statements.map(s => {
      const tenant = tenantMap.get(s.tenantId.toString())
      return {
        _id: s._id.toString(),
        tenantId: s.tenantId.toString(),
        tenantName: tenant?.name || 'Desconocido',
        tenantSlug: tenant?.slug || '',
        weekStart: s.weekStart,
        weekEnd: s.weekEnd,
        amount: toPesos(s.amount),
        status: s.status,
        closedAt: s.closedAt,
        paidAt: s.paidAt,
        paidBy: s.paidBy,
        orderCount: s.orderCount,
      }
    }),
  })
}
