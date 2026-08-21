import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import CommissionSettlement from '@/models/CommissionSettlement'
import { requireAuth } from '@/lib/apiAuth'
import { toPesos } from '@takeasygo/business'

/**
 * GET /api/{tenant}/commissions/settlements
 *
 * Retorna el historial de settlements del superadmin para este tenant.
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

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const settlements = await CommissionSettlement.find({ tenantId: tenant._id })
      .sort({ collectedAt: -1 })
      .limit(50)
      .lean()

    return NextResponse.json({
      settlements: settlements.map((s) => ({
        from: s.from,
        to: s.to,
        amountCollected: toPesos(s.amountCollected),
        collectedBy: s.collectedBy,
        collectedAt: s.collectedAt,
        notes: s.notes,
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
