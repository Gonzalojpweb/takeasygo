import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Promotion from '@/models/Promotion'
import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRole } from '@/lib/apiAuth'

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
      .lean<{ _id: string }>()

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const authError = await requireAdminRole(request, tenant._id.toString())
    if (authError) return authError

    const { orderedIds } = await request.json()

    if (
      !orderedIds || !Array.isArray(orderedIds) || orderedIds.length === 0 ||
      orderedIds.length > 500 ||
      orderedIds.some((id: unknown) => typeof id !== 'string' || !/^[a-fA-F0-9]{24}$/.test(id))
    ) {
      return NextResponse.json({ error: 'orderedIds es requerido y debe ser un array de ObjectIds' }, { status: 400 })
    }

    const promotions = await Promotion.find({
      tenantId: tenant._id,
    }).lean<Array<{ _id: string }>>()

    const promoMap = new Map<string, { _id: string }>()
    for (const p of promotions) {
      promoMap.set(p._id.toString(), p)
    }

    const bulkOps = orderedIds.map((id: string, index: number) => ({
      updateOne: {
        filter: { _id: id, tenantId: tenant._id },
        update: { $set: { sortOrder: index } },
      },
    }))

    const result = await Promotion.bulkWrite(bulkOps)

    return NextResponse.json({
      success: true,
      message: 'Orden actualizado correctamente',
      updated: result.modifiedCount,
    })
  } catch (error) {
    console.error('Error reordenando promociones:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
