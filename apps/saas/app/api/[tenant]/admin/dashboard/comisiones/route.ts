/**
 * Admin Dashboard — Comisiones Pendientes
 *
 * GET /api/[tenant]/admin/dashboard/comisiones
 *
 * Returns pending transfer commissions (what the admin owes to TakeasyGO).
 * MercadoPago commissions are auto-debited; these are manual transfer commissions.
 * Uses Order + Tenant models to avoid TDZ.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveDashboardScope } from '@/lib/dashboard-scope'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params

    const resolved = await resolveDashboardScope<{ _id: any; commissionBalance?: { transfer: number }; commissionThreshold?: number }>(request, tenantSlug, { select: 'commissionBalance commissionThreshold', tenantOnly: true })
    if (!resolved.ok) return resolved.response
    const { tenant, match: sedeMatch } = resolved.scope

    const tenantId = tenant._id

    // Transferencias sin pagar del mes actual — misma fórmula que el panel de
    // comisiones (lib/commissions): órdenes transfer del período menos las que
    // ya están cubiertas por un pago registrado. En CENTAVOS (igual que antes).
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

    const { computeTransferPayable } = await import('@/lib/commissions')
    const payable = await computeTransferPayable(tenantId, startOfMonth, endOfMonth)

    const pending = payable.pendingCents
    const orderCount = payable.orderCount

    // Cumulative balance (lifetime)
    const balance = tenant.commissionBalance?.transfer ?? 0
    const threshold = tenant.commissionThreshold ?? null

    return NextResponse.json({
      pending,
      balance,
      threshold,
      orderCount,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[dashboard/comisiones GET]', msg)
    return NextResponse.json({ error: 'Error al obtener comisiones', detail: msg }, { status: 500 })
  }
}
