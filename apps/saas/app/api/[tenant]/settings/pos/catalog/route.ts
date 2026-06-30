import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { decrypt } from '@/lib/crypto'
import { getPOSConnector } from '@/lib/pos'
import { logAudit } from '@/lib/audit'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRole } from '@/lib/apiAuth'

/**
 * GET /api/[tenant]/settings/pos/catalog
 * Obtiene el catálogo de productos del POS para el mapeo.
 * Detecta y alerta sobre ítems mapeados que ya no existen en el POS.
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

    // ── Detectar ítems huérfanos ────────────────────────────────────────────
    // Ítems en el mapeo que ya no existen en el catálogo del POS
    const posItemIds = new Set(catalog.map(c => c.posItemId))
    const orphaned = (integration.productMapping ?? []).filter(
      m => !posItemIds.has(m.posItemId)
    )

    if (orphaned.length > 0) {
      logAudit({
        tenantId: tenant._id.toString(),
        action: 'pos.orphaned_mappings',
        entity: 'settings',
        entityId: tenant._id.toString(),
        details: {
          provider: integration.provider,
          orphanedCount: orphaned.length,
          orphanedItems: orphaned.map(m => ({
            takeasyGoItemId: m.takeasyGoItemId,
            posItemId: m.posItemId,
            posItemName: m.posItemName,
          })),
        },
        request,
      })
    }

    // Actualizar lastSyncAt
    tenant.posIntegration.lastSyncAt = new Date()
    await tenant.save()

    return NextResponse.json({ catalog, orphanedCount: orphaned.length })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
