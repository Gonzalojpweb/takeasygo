import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Promotion from '@/models/Promotion'
import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { enforcePermissionOrAdmin } from '@/lib/rbac'
import { scopedLocationIds } from '@/lib/location-scope'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params

    // CSRF: header custom que solo puede fijar quien complete el preflight CORS.
    const headerList = await headers()
    if (headerList.get('x-tenant-slug') !== tenantSlug) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()
    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
      .lean<{ _id: string; flags?: Record<string, boolean | string | number | null | undefined> }>()

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    // Flag off: admin-only (como siempre). Flag on: matriz v3 → admin+manager.
    const guardError = await enforcePermissionOrAdmin(request, {
      tenant,
      tenantId: tenant._id.toString(),
      permission: 'promotions.write',
    })
    if (guardError) return guardError

    const { orderedIds } = await request.json()

    if (
      !orderedIds || !Array.isArray(orderedIds) || orderedIds.length === 0 ||
      orderedIds.length > 500 ||
      orderedIds.some((id: unknown) => typeof id !== 'string' || !/^[a-fA-F0-9]{24}$/.test(id))
    ) {
      return NextResponse.json({ error: 'orderedIds es requerido y debe ser un array de ObjectIds' }, { status: 400 })
    }

    // Un usuario de sede solo reordena promos de sus sedes (las compartidas
    // y las de otras sedes quedan afuera del lote).
    const scoped = await scopedLocationIds(request)
    const promotions = await Promotion.find({
      tenantId: tenant._id,
      ...(scoped ? { locationId: { $in: scoped } } : {}),
    }).lean<Array<{ _id: string }>>()

    const promoMap = new Map<string, { _id: string }>()
    for (const p of promotions) {
      promoMap.set(p._id.toString(), p)
    }

    const bulkOps = orderedIds
      .map((id: string, index: number) => ({ id, index }))
      .filter(({ id }: { id: string }) => promoMap.has(id))
      .map(({ id, index }: { id: string; index: number }) => ({
        updateOne: {
          filter: { _id: id, tenantId: tenant._id },
          update: { $set: { sortOrder: index } },
        },
      }))

    const result = bulkOps.length > 0 ? await Promotion.bulkWrite(bulkOps) : null

    return NextResponse.json({
      success: true,
      message: 'Orden actualizado correctamente',
      updated: result?.modifiedCount ?? 0,
    })
  } catch (error) {
    console.error('Error reordenando promociones:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
