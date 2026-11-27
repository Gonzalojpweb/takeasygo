import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { requireTenantRole, getSessionUser } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'
import { BenefitError, reverseRedemption } from '@/lib/network/engine'

// POST { reason } — anula un canje (cancelación o devolución): registra un
// movimiento negativo; el beneficio no vuelve a quedar disponible. Solo Administrador.
export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string; ledgerId: string }> }) {
  try {
    const { tenant: tenantSlug, ledgerId } = await params
    await connectDB()
    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).select('_id').lean<{ _id: unknown }>()
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    const tenantId = String(tenant._id)
    const authError = await requireTenantRole(request, tenantId, ['admin'])
    if (authError) return authError
    const user = await getSessionUser(request)
    const body = await request.json().catch(() => ({})) as { reason?: unknown }
    const reversal = await reverseRedemption({ tenantId, ledgerId, reason: body.reason, actorName: (user as { name?: string | null } | null)?.name ?? user?.email ?? 'Comercio' })
    await logAudit({ tenantId, action: 'network.redemption_reversed', entity: 'network_redemption', entityId: ledgerId, details: { reason: body.reason }, request })
    return NextResponse.json({ reversalId: String(reversal._id) })
  } catch (err) {
    if (err instanceof BenefitError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    console.error('[network/reverse]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'No se pudo anular el canje' }, { status: 500 })
  }
}
