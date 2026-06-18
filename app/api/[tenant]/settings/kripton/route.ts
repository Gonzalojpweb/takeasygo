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
      isConfigured: tenant.kripton?.isConfigured ?? false,
      hasApiKey: !!tenant.kripton?.apiKey,
      cryptoNetworkId: tenant.kripton?.cryptoNetworkId ?? null,
      usePaymentLinks: tenant.kripton?.usePaymentLinks ?? true,
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

    const { apiKey, cryptoNetworkId, usePaymentLinks } = await request.json()

    if (!apiKey) {
      return NextResponse.json({ error: 'API Key es obligatoria' }, { status: 400 })
    }

    if (!tenant.kripton) {
      tenant.kripton = {} as any
    }

    tenant.kripton.apiKey = encrypt(apiKey)
    tenant.kripton.isConfigured = true
    tenant.kripton.cryptoNetworkId = cryptoNetworkId ?? null
    tenant.kripton.usePaymentLinks = usePaymentLinks ?? true
    await tenant.save()

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'settings.kripton_updated',
      entity: 'settings',
      details: { hasApiKey: true, cryptoNetworkId: tenant.kripton.cryptoNetworkId, usePaymentLinks: tenant.kripton.usePaymentLinks },
      request,
    })

    return NextResponse.json({ message: 'Configuración de Kripton guardada correctamente' })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
