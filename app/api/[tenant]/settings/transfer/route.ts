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
    const { enabled, alias, cbu, cvu, bankName, holderName } = body

    const updated = await Tenant.findByIdAndUpdate(
      tenant._id,
      {
        $set: {
          'transfer.enabled': !!enabled,
          'transfer.alias': alias || null,
          'transfer.cbu': cbu || null,
          'transfer.cvu': cvu || null,
          'transfer.bankName': bankName || null,
          'transfer.holderName': holderName || null,
        },
      },
      { returnDocument: 'after' }
    )

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'settings.transfer.updated',
      entity: 'tenant',
      details: { enabled: !!enabled, hasAlias: !!alias, hasCbu: !!cbu },
      request,
    })

    return NextResponse.json({ transfer: updated?.transfer })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
