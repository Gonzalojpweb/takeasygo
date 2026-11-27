import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { requireTenantRole, getSessionUser } from '@/lib/apiAuth'
import { rateLimit } from '@/lib/rateLimit'
import { logAudit } from '@/lib/audit'
import { BenefitError, redeemBenefit } from '@/lib/network/engine'

// POST { code, purchaseTotalCents, saleRef?, requestId?, dryRun? }
// Canje de un beneficio de la red en el comercio receptor (§6.1): valida en
// línea el QR dinámico o el código manual, calcula el descuento y la comisión
// según el acuerdo vigente y registra el canje. dryRun = solo validar.
// Administrador, Encargado o Cajero del comercio.
const ROLES = ['admin', 'manager', 'cashier'] as const

export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()
    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).select('_id').lean<{ _id: unknown }>()
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    const tenantId = String(tenant._id)

    const authError = await requireTenantRole(request, tenantId, ROLES)
    if (authError) return authError
    const { success } = await rateLimit(`network-redeem:${tenantId}`, 30, 60_000)
    if (!success) return NextResponse.json({ error: 'Demasiados intentos. Esperá un momento.' }, { status: 429 })

    const user = await getSessionUser(request)
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const result = await redeemBenefit({
      tenantId,
      code: body.code,
      purchaseTotalCents: body.purchaseTotalCents,
      saleRef: body.saleRef,
      requestId: body.requestId,
      dryRun: body.dryRun === true,
      actorName: (user as { name?: string | null } | null)?.name ?? user?.email ?? 'Comercio',
    })
    if (!result.dryRun && !result.replayed) {
      await logAudit({ tenantId, action: 'network.benefit_redeemed', entity: 'network_redemption', entityId: result.ledgerId ?? undefined, details: { discountCents: result.discountCents, commissionCents: result.commissionCents }, request })
    }
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof BenefitError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    console.error('[network/redeem]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'No se pudo completar el canje' }, { status: 500 })
  }
}
