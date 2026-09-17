import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRole } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'

/**
 * PUT — Update a specific transfer account
 * Body: { label?, alias?, cbu?, cvu?, bankName?, holderName? }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; accountId: string }> }
) {
  try {
    const { tenant: tenantSlug, accountId } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAdminRole(request, tenant._id.toString())
    if (authError) return authError

    const account = tenant.transferAccounts?.find((a: any) => a._id?.toString() === accountId)
    if (!account) {
      return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })
    }

    const body = await request.json()
    const updateSet: Record<string, any> = {}

    if (body.label != null) updateSet['transferAccounts.$.label'] = body.label
    if (body.alias != null) updateSet['transferAccounts.$.alias'] = body.alias.trim()
    if (body.cbu != null) updateSet['transferAccounts.$.cbu'] = body.cbu.trim() || null
    if (body.cvu != null) updateSet['transferAccounts.$.cvu'] = body.cvu.trim() || null
    if (body.bankName != null) updateSet['transferAccounts.$.bankName'] = body.bankName.trim() || null
    if (body.holderName != null) updateSet['transferAccounts.$.holderName'] = body.holderName.trim() || null

    if (Object.keys(updateSet).length === 0) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
    }

    await Tenant.updateOne(
      { _id: tenant._id, 'transferAccounts._id': account._id },
      { $set: updateSet }
    )

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'settings.transferAccount_updated',
      entity: 'settings',
      details: { accountId, label: body.label || account.label },
      request,
    })

    return NextResponse.json({ message: 'Cuenta actualizada' })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

/**
 * DELETE — Remove a specific transfer account (only if not active)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; accountId: string }> }
) {
  try {
    const { tenant: tenantSlug, accountId } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAdminRole(request, tenant._id.toString())
    if (authError) return authError

    const account = tenant.transferAccounts?.find((a: any) => a._id?.toString() === accountId)
    if (!account) {
      return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })
    }

    if (account.isActive && tenant.transferAccounts.length === 1) {
      return NextResponse.json(
        { error: 'No se puede eliminar la única cuenta activa. Desactivá transferencia primero o agregá otra cuenta.' },
        { status: 400 }
      )
    }

    if (account.isActive) {
      return NextResponse.json(
        { error: 'No se puede eliminar la cuenta activa. Activá otra cuenta primero.' },
        { status: 400 }
      )
    }

    await Tenant.updateOne(
      { _id: tenant._id },
      { $pull: { transferAccounts: { _id: account._id } } }
    )

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'settings.transferAccount_deleted',
      entity: 'settings',
      details: { accountId, label: account.label },
      request,
    })

    return NextResponse.json({ message: 'Cuenta eliminada' })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
