import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { decrypt } from '@/lib/crypto'
import { getPOSConnector } from '@/lib/pos'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRole } from '@/lib/apiAuth'

/**
 * GET /api/[tenant]/settings/pos/catalog
 * Obtiene el catálogo de productos del POS para el mapeo
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

    const integration = tenant.posIntegration
    if (!integration || integration.provider === 'none') {
      return NextResponse.json({ error: 'POS no configurado' }, { status: 400 })
    }

    if (!integration.credentials.clientId || !integration.credentials.clientSecret) {
      return NextResponse.json({ error: 'Faltan credenciales' }, { status: 400 })
    }

    const credentials = {
      clientId: decrypt(integration.credentials.clientId),
      clientSecret: decrypt(integration.credentials.clientSecret),
      apiEndpoint: integration.credentials.apiEndpoint
    }

    const connector = getPOSConnector(integration.provider)
    const catalog = await connector.getCatalog(credentials)

    // Actualizar lastSyncAt
    tenant.posIntegration.lastSyncAt = new Date()
    await tenant.save()

    return NextResponse.json({ catalog })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
