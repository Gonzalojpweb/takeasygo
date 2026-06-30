import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { encrypt } from '@/lib/crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRole } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'

/**
 * GET /api/[tenant]/settings/pos
 * Retorna la configuración básica de integración (sin secrets en claro)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug })
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

    const authError = await requireAdminRole(request, tenant._id.toString())
    if (authError) return authError

    return NextResponse.json({
      provider: tenant.posIntegration?.provider || 'none',
      enabled: !!tenant.posIntegration?.enabled,
      hasClientId: !!tenant.posIntegration?.credentials?.clientId,
      hasClientSecret: !!tenant.posIntegration?.credentials?.clientSecret,
      apiEndpoint: tenant.posIntegration?.credentials?.apiEndpoint || null,
      hasWebhookSecret: !!tenant.posIntegration?.webhookSecret,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

/**
 * POST /api/[tenant]/settings/pos
 * Guarda la configuración del proveedor y credenciales
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug })
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

    const authError = await requireAdminRole(request, tenant._id.toString())
    if (authError) return authError

    const { provider, enabled, clientId, clientSecret, apiEndpoint, webhookSecret } = await request.json()

    if (!tenant.posIntegration) {
      tenant.posIntegration = {
        provider: 'none',
        enabled: false,
        credentials: { clientId: null, clientSecret: null, apiEndpoint: null },
        productMapping: [],
        lastSyncAt: null,
        webhookSecret: null
      }
    }

    if (provider) tenant.posIntegration.provider = provider
    if (typeof enabled === 'boolean') tenant.posIntegration.enabled = enabled
    
    if (clientId) tenant.posIntegration.credentials.clientId = encrypt(clientId)
    if (clientSecret) tenant.posIntegration.credentials.clientSecret = encrypt(clientSecret)
    if (apiEndpoint !== undefined) tenant.posIntegration.credentials.apiEndpoint = apiEndpoint
    if (webhookSecret) tenant.posIntegration.webhookSecret = encrypt(webhookSecret)

    await tenant.save()

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'settings.pos_updated',
      entity: 'settings',
      details: { provider, enabled },
      request,
    })

    return NextResponse.json({ message: 'Configuración de POS guardada' })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
