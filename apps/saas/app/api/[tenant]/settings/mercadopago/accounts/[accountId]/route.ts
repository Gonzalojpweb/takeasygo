import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { encrypt } from '@/lib/crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRole } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'

/**
 * PUT — Update a specific MP account (label and/or credentials)
 * Body: { label?, accessToken?, publicKey?, webhookSecret? }
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

    const account = tenant.mpAccounts?.find((a: any) => a._id?.toString() === accountId)
    if (!account) {
      return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })
    }

    const body = await request.json()
    const updateSet: Record<string, any> = {}

    if (body.label != null) updateSet['mpAccounts.$.label'] = body.label
    if (body.accessToken) updateSet['mpAccounts.$.accessToken'] = encrypt(body.accessToken)
    if (body.publicKey) updateSet['mpAccounts.$.publicKey'] = encrypt(body.publicKey)
    if (body.webhookSecret) updateSet['mpAccounts.$.webhookSecret'] = encrypt(body.webhookSecret)

    if (Object.keys(updateSet).length === 0) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
    }

    await Tenant.updateOne(
      { _id: tenant._id, 'mpAccounts._id': account._id },
      { $set: updateSet }
    )

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'settings.mpAccount_updated',
      entity: 'settings',
      details: { accountId, fields: Object.keys(updateSet) },
      request,
    })

    return NextResponse.json({ message: 'Cuenta actualizada' })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

/**
 * DELETE — Remove an MP account (only if inactive)
 * Cannot delete the only active account.
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

    const account = tenant.mpAccounts?.find((a: any) => a._id?.toString() === accountId)
    if (!account) {
      return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })
    }

    // Cannot delete the only active account
    if (account.isActive && tenant.mpAccounts.length === 1) {
      return NextResponse.json(
        { error: 'No podés eliminar la única cuenta activa. Activá otra cuenta primero.' },
        { status: 409 }
      )
    }

    // Cannot delete an active account (must deactivate first)
    if (account.isActive) {
      return NextResponse.json(
        { error: 'No podés eliminar una cuenta activa. Desactivala primero.' },
        { status: 409 }
      )
    }

    await Tenant.updateOne(
      { _id: tenant._id },
      { $pull: { mpAccounts: { _id: account._id } } }
    )

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'settings.mpAccount_deleted',
      entity: 'settings',
      details: { accountId, label: account.label },
      request,
    })

    return NextResponse.json({ message: 'Cuenta eliminada' })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
