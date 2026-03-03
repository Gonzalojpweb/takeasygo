import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { encrypt, decrypt } from '@/lib/crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRole } from '@/lib/apiAuth'
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

    return NextResponse.json({
      isConfigured: tenant.mercadopago.isConfigured,
      publicKey: tenant.mercadopago.publicKey
        ? decrypt(tenant.mercadopago.publicKey)
        : null,
      hasAccessToken: !!tenant.mercadopago.accessToken,
      hasWebhookSecret: !!tenant.mercadopago.webhookSecret,
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

    const { accessToken, publicKey, webhookSecret } = await request.json()

    if (!accessToken || !publicKey) {
      return NextResponse.json({ error: 'Access Token y Public Key son obligatorios' }, { status: 400 })
    }

    tenant.mercadopago.accessToken = encrypt(accessToken)
    tenant.mercadopago.publicKey = encrypt(publicKey)
    if (webhookSecret) {
      tenant.mercadopago.webhookSecret = encrypt(webhookSecret)
    }
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