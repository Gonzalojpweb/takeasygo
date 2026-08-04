import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Promotion from '@/models/Promotion'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params

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

    const { orderedIds } = await request.json()

    if (!orderedIds || !Array.isArray(orderedIds) || orderedIds.length === 0) {
      return NextResponse.json({ error: 'orderedIds es requerido y debe ser un array' }, { status: 400 })
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
