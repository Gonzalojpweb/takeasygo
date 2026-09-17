import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRole } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'

/**
 * GET — List all transfer accounts for a tenant
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

    const accounts = (tenant.transferAccounts || []).map((acc: any) => ({
      _id: acc._id?.toString(),
      label: acc.label,
      alias: acc.alias,
      cbu: acc.cbu,
      cvu: acc.cvu,
      bankName: acc.bankName,
      holderName: acc.holderName,
      isActive: acc.isActive,
      createdAt: acc.createdAt,
    }))

    return NextResponse.json({ accounts })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

/**
 * POST — Create a new transfer account
 * Body: { label, alias, cbu?, cvu?, bankName?, holderName?, isActive? }
 *
 * If isActive is true or it's the first account, it becomes active.
 * Cannot have 0 active accounts when transfer is enabled.
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

    const { label, alias, cbu, cvu, bankName, holderName, isActive } = await request.json()

    if (!label || !alias) {
      return NextResponse.json(
        { error: 'label y alias son requeridos.' },
        { status: 400 }
      )
    }

    // Determine if this account should be active
    const isFirst = !tenant.transferAccounts?.length
    const shouldBeActive = isFirst || isActive === true

    // Build the new account subdocument
    const newAccount = {
      label,
      alias: alias.trim(),
      cbu: cbu?.trim() || null,
      cvu: cvu?.trim() || null,
      bankName: bankName?.trim() || null,
      holderName: holderName?.trim() || null,
      isActive: shouldBeActive,
      createdAt: new Date(),
    }

    if (shouldBeActive) {
      // Step 1: push new account
      await Tenant.updateOne(
        { _id: tenant._id },
        { $push: { transferAccounts: newAccount } }
      )
      // Step 2: deactivate all others (cannot combine $push + array filter $set on same array)
      const freshTenant = await Tenant.findById(tenant._id).select('transferAccounts').lean() as any
      const newId = freshTenant.transferAccounts[freshTenant.transferAccounts.length - 1]._id
      await Tenant.updateOne(
        { _id: tenant._id },
        { $set: { 'transferAccounts.$[other].isActive': false } },
        { arrayFilters: [{ 'other._id': { $ne: newId } }] }
      )
    } else {
      // Just push — don't touch active state
      await Tenant.updateOne(
        { _id: tenant._id },
        { $push: { transferAccounts: newAccount } }
      )
    }

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'settings.transferAccount_created',
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
    const targetAccount = tenant.transferAccounts?.find((a: any) => a._id?.toString() === accountId)
    if (!targetAccount) {
      return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })
    }

    // Atomic: deactivate ALL others, activate target
    await Tenant.updateOne(
      { _id: tenant._id },
      {
        $set: {
          'transferAccounts.$[other].isActive': false,
          'transferAccounts.$[target].isActive': true,
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
      action: 'settings.transferAccount_activated',
      entity: 'settings',
      details: { accountId, label: targetAccount.label },
      request,
    })

    return NextResponse.json({ message: 'Cuenta activada' })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
