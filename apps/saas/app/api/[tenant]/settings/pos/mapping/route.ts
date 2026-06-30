import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRole } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'

/**
 * GET /api/[tenant]/settings/pos/mapping
 * Retorna el mapeo actual de productos
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
      mapping: tenant.posIntegration?.productMapping || []
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

/**
 * POST /api/[tenant]/settings/pos/mapping
 * Guarda el mapeo de productos TakeasyGO <-> POS
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

    const { mapping } = await request.json()

    if (!Array.isArray(mapping)) {
      return NextResponse.json({ error: 'Mapping debe ser un array' }, { status: 400 })
    }

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

    tenant.posIntegration.productMapping = mapping
    await tenant.save()

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'settings.pos_mapping_updated',
      entity: 'settings',
      details: { itemsMapped: mapping.length },
      request,
    })

    return NextResponse.json({ message: 'Mapeo guardado' })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
