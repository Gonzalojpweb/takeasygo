import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantRole, ADMIN_ROLES } from '@/lib/apiAuth'
import { enforcePermissionForRequest } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireTenantRole(request, tenant._id.toString(), ADMIN_ROLES)
    if (authError) return authError

    const permError = await enforcePermissionForRequest(request, {
      tenant,
      tenantId: tenant._id.toString(),
      permission: 'settings.write',
    })
    if (permError) return permError

    const body = await request.json()
    const { mercadopago, kripton, transfer } = body

    if (!mercadopago || !kripton) {
      return NextResponse.json({ error: 'Faltan datos de recargos' }, { status: 400 })
    }

    // Recargo propio del comercio para transferencia (opcional, 0–100)
    const transferFeeRaw = Number(transfer?.feePercent ?? 0)
    const transferFee = Number.isFinite(transferFeeRaw)
      ? Math.min(100, Math.max(0, transferFeeRaw))
      : 0

    const updated = await Tenant.findByIdAndUpdate(
      tenant._id,
      {
        $set: {
          'paymentSurcharges.mercadopago.feePercent': mercadopago.feePercent ?? 0,
          'paymentSurcharges.kripton.feePercent': kripton.feePercent ?? 0,
          'paymentSurcharges.transfer.feePercent': transferFee,
        },
      },
      { returnDocument: 'after' }
    )

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'settings.surcharges.updated',
      entity: 'tenant',
      details: { mercadopago: mercadopago.feePercent, kripton: kripton.feePercent, transfer: transferFee },
      request,
    })

    return NextResponse.json({ paymentSurcharges: updated?.paymentSurcharges })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
