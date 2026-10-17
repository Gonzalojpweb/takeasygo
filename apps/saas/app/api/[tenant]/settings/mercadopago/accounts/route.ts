import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { encrypt } from '@/lib/crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRole } from '@/lib/apiAuth'
import { enforcePermissionForRequest } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'

/**
 * GET — List all MP accounts for a tenant (tokens masked)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAdminRole(request, tenant._id.toString())
    if (authError) return authError

    const permError = await enforcePermissionForRequest(request, {
      tenant,
      tenantId: tenant._id.toString(),
      permission: 'payments.configure',
    })
    if (permError) return permError

    const accounts = (tenant.mpAccounts || []).map((acc: any) => ({
      _id: acc._id?.toString(),
      label: acc.label,
      isActive: acc.isActive,
      hasAccessToken: !!acc.accessToken,
      hasPublicKey: !!acc.publicKey,
      hasWebhookSecret: !!acc.webhookSecret,
      oauthIsConnected: !!acc.oauthIsConnected,
      oauthAuthorizedAt: acc.oauthAuthorizedAt,
      createdAt: acc.createdAt,
      mpUserId: acc.mpUserId ?? null,
      oauthMpUserId: acc.oauthMpUserId ?? null,
    }))

    return NextResponse.json({ accounts })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

/**
 * POST — Create a new MP account
 * Body: { label, accessToken, publicKey, webhookSecret, isActive? }
 *
 * If isActive is true or it's the first account, it becomes active.
 * Atomic: if activating, deactivate all others in the same operation.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAdminRole(request, tenant._id.toString())
    if (authError) return authError

    const permError = await enforcePermissionForRequest(request, {
      tenant,
      tenantId: tenant._id.toString(),
      permission: 'payments.configure',
    })
    if (permError) return permError

    const { label, accessToken, publicKey, webhookSecret, isActive } = await request.json()

    if (!label || !accessToken || !publicKey || !webhookSecret) {
      return NextResponse.json(
        { error: 'label, accessToken, publicKey y webhookSecret son requeridos.' },
        { status: 400 }
      )
    }

    // Resolver user_id de MP del token manual (para trazabilidad y chequeo de
    // unicidad en el callback OAuth). Si /users/me falla, se guarda null sin bloquear.
    let mpUserId: number | null = null
    try {
      const meRes = await fetch('https://api.mercadopago.com/users/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (meRes.ok) {
        const meData = await meRes.json()
        mpUserId = typeof meData?.id === 'number' ? meData.id : null
      }
    } catch {
      // sin red o token inválido — no bloquea la creación
    }

    // Determine if this account should be active
    const isFirst = !tenant.mpAccounts?.length
    const shouldBeActive = isFirst || isActive === true

    // Build the new account subdocument
    const newAccount = {
      label,
      accessToken: encrypt(accessToken),
      publicKey: encrypt(publicKey),
      webhookSecret: encrypt(webhookSecret),
      isActive: shouldBeActive,
      createdAt: new Date(),
      mpUserId,
    }

    if (shouldBeActive) {
      // Step 1: push new account
      await Tenant.updateOne(
        { _id: tenant._id },
        { $push: { mpAccounts: newAccount } }
      )
      // Step 2: deactivate all others (cannot combine $push + array filter $set on same array)
      const freshTenant = await Tenant.findById(tenant._id).select('mpAccounts').lean() as any
      const newId = freshTenant.mpAccounts[freshTenant.mpAccounts.length - 1]._id
      await Tenant.updateOne(
        { _id: tenant._id },
        { $set: { 'mpAccounts.$[other].isActive': false } },
        { arrayFilters: [{ 'other._id': { $ne: newId } }] }
      )
    } else {
      // Just push — don't touch active state
      await Tenant.updateOne(
        { _id: tenant._id },
        { $push: { mpAccounts: newAccount } }
      )
    }

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'settings.mpAccount_created',
      entity: 'settings',
      details: { label, isActive: shouldBeActive },
      request,
    })

    return NextResponse.json({ message: 'Cuenta creada', isActive: shouldBeActive }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

/**
 * PUT — Activate a specific account (deactivate all others atomically)
 * Body: { accountId }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAdminRole(request, tenant._id.toString())
    if (authError) return authError

    const { accountId } = await request.json()
    if (!accountId) {
      return NextResponse.json({ error: 'accountId requerido' }, { status: 400 })
    }

    // Verify the account exists in this tenant
    const targetAccount = tenant.mpAccounts?.find((a: any) => a._id?.toString() === accountId)
    if (!targetAccount) {
      return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })
    }

    // Atomic: deactivate ALL others, activate target
    await Tenant.updateOne(
      { _id: tenant._id },
      {
        $set: {
          'mpAccounts.$[other].isActive': false,
          'mpAccounts.$[target].isActive': true,
        },
      },
      {
        arrayFilters: [
          { 'other._id': { $ne: targetAccount._id } },
          { 'target._id': targetAccount._id },
        ],
      }
    )

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'settings.mpAccount_activated',
      entity: 'settings',
      details: { accountId, label: targetAccount.label },
      request,
    })

    return NextResponse.json({ message: 'Cuenta activada' })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
