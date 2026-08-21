import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { requireAdminRole } from '@/lib/apiAuth'

/**
 * GET /api/{tenant}/commissions/status
 *
 * Retorna el balance de comisiones por transferencia y si supera el umbral configurado.
 *
 * Response: { balance: number, threshold: number | null, overThreshold: boolean }
 * - balance: monto acumulado en PESOS (centavos / 100)
 * - threshold: umbral configurado por superadmin en PESOS (null = no configurado)
 * - overThreshold: true si threshold !== null && balance >= threshold
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
      .select('commissionBalance commissionThreshold')
      .lean()
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const authError = await requireAdminRole(request, tenant._id.toString())
    if (authError) return authError

    // commissionBalance.transfer está en centavos; threshold está en pesos
    const balanceInPesos = (tenant.commissionBalance?.transfer ?? 0) / 100
    const threshold = tenant.commissionThreshold ?? null
    const overThreshold = threshold != null && balanceInPesos >= threshold

    return NextResponse.json({
      balance: balanceInPesos,
      threshold,
      overThreshold,
    })
  } catch (error: any) {
    console.error('[commissions/status]', error)
    return NextResponse.json(
      { error: error?.message || 'Error interno' },
      { status: 500 }
    )
  }
}
