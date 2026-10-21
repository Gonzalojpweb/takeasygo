import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import InventoryLedger from '@/models/InventoryLedger'
import { requireAuth, getSessionUser } from '@/lib/apiAuth'
import { enforcePermissionForRequest } from '@/lib/rbac'
import { guardStorageLocation } from '@/lib/inventory/storage-scope'
import { scopeLocationFilter } from '@/lib/location-scope'
import { logAudit } from '@/lib/audit'
import { transferStock, TransferError } from '@/lib/inventory/transfer'

/**
 * POST /api/[tenant]/inventory/transfers
 * Body: { skuId, fromStorageLocationId, toStorageLocationId, quantity, reason?, transferId? }
 *
 * Transfiere stock entre depósitos (de la misma o de otra sede). El usuario
 * necesita alcance sobre el depósito de ORIGEN; el destino tiene que ser del
 * mismo tenant. Queda trazado en el ledger (TransferOut + TransferIn con el
 * mismo correlationId) y en la bitácora.
 *
 * GET /api/[tenant]/inventory/transfers?locationId=
 * Transferencias recientes que salen o entran a las sedes del alcance.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const permError = await enforcePermissionForRequest(request, {
      tenant,
      tenantId: tenant._id.toString(),
      permission: 'inventory.write',
    })
    if (permError) return permError

    const body = await request.json()

    // Origen: dentro del alcance del usuario. Destino: del tenant.
    const fromError = await guardStorageLocation(request, tenant._id, body?.fromStorageLocationId)
    if (fromError) return fromError

    const user = await getSessionUser(request)
    const { transferId } = await transferStock({
      tenantId: tenant._id.toString(),
      skuId: body?.skuId,
      fromStorageLocationId: body?.fromStorageLocationId,
      toStorageLocationId: body?.toStorageLocationId,
      quantity: body?.quantity,
      reason: body?.reason,
      actorId: user?.id ?? undefined,
      transferId: body?.transferId,
    })

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'inventory.transfer',
      entity: 'inventory',
      entityId: transferId,
      details: {
        skuId: body.skuId,
        quantity: body.quantity,
        fromStorageLocationId: body.fromStorageLocationId,
        toStorageLocationId: body.toStorageLocationId,
      },
      request,
    })

    return NextResponse.json({ transferId }, { status: 201 })
  } catch (error) {
    if (error instanceof TransferError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const sedeScope = await scopeLocationFilter(request, request.nextUrl.searchParams.get('locationId'))
    if ('error' in sedeScope) return sedeScope.error

    // La sede viaja en el payload (origen y destino): se filtra por ambas.
    const sedeIds = (sedeScope.filter as { locationId?: unknown }).locationId
    const sedeMatch = sedeIds === undefined
      ? {}
      : (() => {
          const ids = (sedeIds as { $in?: unknown[] }).$in ?? [sedeIds]
          const asStrings = ids.map(String)
          return { $or: [{ 'payload.fromLocationId': { $in: asStrings } }, { 'payload.toLocationId': { $in: asStrings } }] }
        })()

    const transfers = await InventoryLedger.find({
      tenantId: tenant._id,
      eventType: 'TransferOut',
      ...sedeMatch,
    })
      .sort({ occurredAt: -1 })
      .limit(100)
      .select('skuId occurredAt actorId correlationId payload')
      .lean()

    return NextResponse.json({ transfers })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
