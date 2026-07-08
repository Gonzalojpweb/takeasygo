import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
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

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const body = await request.json()
    const { mercadopago, kripton } = body

    if (!mercadopago || !kripton) {
      return NextResponse.json({ error: 'Faltan datos de recargos' }, { status: 400 })
    }

    const updated = await Tenant.findByIdAndUpdate(
      tenant._id,
      {
        $set: {
          'paymentSurcharges.mercadopago.feePercent': mercadopago.feePercent ?? 0,
          'paymentSurcharges.kripton.feePercent': kripton.feePercent ?? 0,
          'paymentSurcharges.transfer.feePercent': 0,
        },
      },
      { returnDocument: 'after' }
    )

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'settings.surcharges.updated',
      entity: 'tenant',
      details: { mercadopago: mercadopago.feePercent, kripton: kripton.feePercent },
      request,
    })

    return NextResponse.json({ paymentSurcharges: updated?.paymentSurcharges })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
