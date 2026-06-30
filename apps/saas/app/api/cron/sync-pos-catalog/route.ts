/**
 * Cron Job: Sincronización automática diaria de catálogos POS
 *
 * Se ejecuta una vez al día para todos los tenants con POS habilitado.
 * Refresca el catálogo de productos del POS y detecta ítems huérfanos
 * en el mapeo (productos que ya no existen en el POS).
 *
 * URL: /api/cron/sync-pos-catalog
 * Método: GET (con header Authorization: Bearer CRON_SECRET)
 */

import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { decrypt } from '@/lib/crypto'
import { getPOSConnector } from '@/lib/pos'
import { logAudit } from '@/lib/audit'
import { NextRequest, NextResponse } from 'next/server'

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    const tenants = await Tenant.find({
      isActive: true,
      'posIntegration.enabled': true,
      'posIntegration.provider': { $ne: 'none' },
      'posIntegration.credentials.clientId': { $ne: null },
      'posIntegration.credentials.clientSecret': { $ne: null },
    }).select('_id slug name posIntegration').lean()

    const results: Array<{
      tenantSlug: string
      tenantName: string
      catalogSize: number
      orphanedCount: number
      error: string | null
    }> = []

    let totalOrphaned = 0

    for (const tenant of tenants) {
      try {
        const integration = tenant.posIntegration as any
        if (!integration?.credentials?.clientId || !integration?.credentials?.clientSecret) {
          results.push({
            tenantSlug: tenant.slug,
            tenantName: tenant.name,
            catalogSize: 0,
            orphanedCount: 0,
            error: 'Missing credentials',
          })
          continue
        }

        const credentials = {
          clientId: decrypt(integration.credentials.clientId),
          clientSecret: decrypt(integration.credentials.clientSecret),
          apiEndpoint: integration.credentials.apiEndpoint ?? null,
        }

        const connector = getPOSConnector(integration.provider as 'fudo' | 'bistrosoft')
        const catalog = await connector.getCatalog(credentials)

        const posItemIds = new Set(catalog.map((c: any) => c.posItemId))
        const orphaned = (integration.productMapping ?? []).filter(
          (m: any) => !posItemIds.has(m.posItemId)
        )

        if (orphaned.length > 0) {
          totalOrphaned += orphaned.length
          logAudit({
            tenantId: tenant._id.toString(),
            action: 'pos.auto_sync_orphaned',
            entity: 'settings',
            entityId: tenant._id.toString(),
            details: {
              provider: integration.provider,
              catalogSize: catalog.length,
              orphanedCount: orphaned.length,
              orphanedItems: orphaned.map((m: any) => ({
                takeasyGoItemId: m.takeasyGoItemId,
                posItemId: m.posItemId,
                posItemName: m.posItemName,
              })),
            },
          })
        }

        await Tenant.updateOne(
          { _id: tenant._id },
          { $set: { 'posIntegration.lastSyncAt': new Date() } }
        )

        results.push({
          tenantSlug: tenant.slug,
          tenantName: tenant.name,
          catalogSize: catalog.length,
          orphanedCount: orphaned.length,
          error: null,
        })
      } catch (error) {
        console.error(`[Cron][POS Sync] Error en tenant ${tenant.slug}:`, error)
        results.push({
          tenantSlug: tenant.slug,
          tenantName: tenant.name,
          catalogSize: 0,
          orphanedCount: 0,
          error: String(error),
        })
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        tenantsProcessed: tenants.length,
        totalOrphaned,
      },
      details: results,
    })
  } catch (error) {
    console.error('[Cron][POS Sync] Error general:', error)
    return NextResponse.json(
      { error: 'Error ejecutando cron job', details: String(error) },
      { status: 500 }
    )
  }
}
