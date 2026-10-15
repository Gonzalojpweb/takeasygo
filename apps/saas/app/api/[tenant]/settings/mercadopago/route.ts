import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Order from '@/models/Order'
import Reservation from '@/models/Reservation'
import { encrypt, decrypt } from '@/lib/crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRole } from '@/lib/apiAuth'
import { enforcePermissionForRequest } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'

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

    return NextResponse.json({
      isConfigured: tenant.mercadopago.isConfigured,
      publicKey: tenant.mercadopago.publicKey
        ? decrypt(tenant.mercadopago.publicKey)
        : null,
      hasAccessToken: !!tenant.mercadopago.accessToken,
      hasWebhookSecret: !!tenant.mercadopago.webhookSecret,
      mpAccounts: (tenant.mpAccounts || []).map((acc: any) => ({
        _id: acc._id?.toString(),
        label: acc.label,
        isActive: acc.isActive,
        hasAccessToken: !!acc.accessToken,
        hasPublicKey: !!acc.publicKey,
        hasWebhookSecret: !!acc.webhookSecret,
        oauthIsConnected: !!acc.oauthIsConnected,
        oauthAuthorizedAt: acc.oauthAuthorizedAt,
        createdAt: acc.createdAt,
      })),
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

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

    const { accessToken, publicKey, webhookSecret } = await request.json()

    if (!accessToken || !publicKey || !webhookSecret) {
      return NextResponse.json({ error: 'Access Token, Public Key y Webhook Secret son obligatorios' }, { status: 400 })
    }

    tenant.mercadopago.accessToken = encrypt(accessToken)
    tenant.mercadopago.publicKey = encrypt(publicKey)
    tenant.mercadopago.webhookSecret = encrypt(webhookSecret)
    tenant.mercadopago.isConfigured = true
    await tenant.save()

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'settings.mercadopago_updated',
      entity: 'settings',
      details: { hasWebhookSecret: !!webhookSecret },
      request,
    })

    return NextResponse.json({ message: 'Credenciales guardadas correctamente' })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

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

    const permError = await enforcePermissionForRequest(request, {
      tenant,
      tenantId: tenant._id.toString(),
      permission: 'payments.configure',
    })
    if (permError) return permError

    const { mpMode } = await request.json()
    if (mpMode !== 'shared' && mpMode !== 'perLocation') {
      return NextResponse.json({ error: 'mpMode debe ser "shared" o "perLocation"' }, { status: 400 })
    }

    // ── Protección: cambiar a perLocation requiere verificaciones ──
    if (mpMode === 'perLocation') {
      // 1. Cada sede activa debe tener cuenta elegida
      const activeLocations = await Location.find({ tenantId: tenant._id, isActive: true })
        .select('name settings.mpAccountId').lean()
      const locationsWithoutAccount = activeLocations.filter(
        (loc: any) => !loc.settings?.mpAccountId
      )
      if (locationsWithoutAccount.length > 0) {
        const names = locationsWithoutAccount.map((l: any) => l.name).join(', ')
        return NextResponse.json(
          {
            error: `No se puede cambiar a "por sede": ${locationsWithoutAccount.length} sede(s) sin cuenta de Mercado Pago asignada. Asigná una cuenta a: ${names}.`,
            missingLocations: locationsWithoutAccount.map((l: any) => l.name),
          },
          { status: 409 }
        )
      }

      // 2. No debe haber pagos pendientes sin cuenta guardada
      const [pendingOrders, pendingReservations] = await Promise.all([
        Order.countDocuments({
          tenantId: tenant._id,
          status: { $in: ['pending', 'pending_payment'] },
          'payment.mpAccountId': null,
        }),
        Reservation.countDocuments({
          tenantId: tenant._id,
          status: 'pending_payment',
          'payment.mpAccountId': null,
        }),
      ])
      const totalPending = pendingOrders + pendingReservations
      if (totalPending > 0) {
        return NextResponse.json(
          {
            error: `No se puede cambiar a "por sede": hay ${totalPending} pago(s) pendiente(s) sin cuenta de Mercado Pago asignada. Esperá a que se resuelvan o asigná cuentas manualmente.`,
            pendingCount: totalPending,
          },
          { status: 409 }
        )
      }
    }

    tenant.mpMode = mpMode
    await tenant.save()

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'settings.mercadopago.mpMode_changed',
      entity: 'settings',
      details: { mpMode, previous: tenant.isModified('mpMode') ? 'changed' : 'same' },
      request,
    })

    return NextResponse.json({ mpMode: tenant.mpMode })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}