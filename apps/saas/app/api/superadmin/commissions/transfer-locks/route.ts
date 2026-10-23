import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { TRANSFER_LOCK_THRESHOLD_CENTS, loadCommissionWeeks, summarizeAlerts } from '@/lib/commission-weeks'

/**
 * GET /api/superadmin/commissions/transfer-locks (superadmin)
 *
 * Comercios con deuda de comisiones por transferencia impaga, del mayor al
 * menor, y cuáles tienen las transferencias APAGADAS por tener más del tope
 * VENCIDO (lib/commission-weeks). Desde el panel el superadmin puede marcar toda la
 * deuda como cobrada (POST /api/superadmin/commissions con `all: true`) si
 * recibió el pago por fuera de la plataforma: eso las vuelve a habilitar.
 *
 * Montos en centavos.
 */
export async function GET() {
  const authError = await requireSuperAdmin()
  if (authError) return authError

  await connectDB()
  const tenants = await Tenant.find({ isActive: true })
    .select('_id name slug timezone')
    .lean<Array<{ _id: unknown; name: string; slug: string; timezone?: string | null }>>()

  const rows = await Promise.all(
    tenants.map(async (t) => {
      const alerts = summarizeAlerts(await loadCommissionWeeks(String(t._id), { tz: t.timezone || undefined }))
      return {
        tenantId: String(t._id),
        name: t.name,
        slug: t.slug,
        owedCents: alerts.overdue.cents + alerts.pending.cents + alerts.accrued.cents,
        overdueCents: alerts.overdue.cents,
        pendingCents: alerts.pending.cents,
        accruedCents: alerts.accrued.cents,
        locked: alerts.transferLock.locked,
      }
    }),
  )

  return NextResponse.json(
    {
      thresholdCents: TRANSFER_LOCK_THRESHOLD_CENTS,
      tenants: rows.filter((r) => r.owedCents > 0).sort((a, b) => b.owedCents - a.owedCents),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
