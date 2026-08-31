import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { Types } from 'mongoose'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const { tenantId } = await params
    if (!Types.ObjectId.isValid(tenantId)) {
      return NextResponse.json({ error: 'Tenant inválido' }, { status: 400 })
    }

    await connectDB()

    const tenant = await Tenant.findById(tenantId).select('_id name').lean()
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const locations = await Location.find({ tenantId, isActive: true })
      .select('name slug status')
      .lean()

    return NextResponse.json({
      locations: locations.map((l) => ({
        _id: String(l._id),
        name: l.name,
        slug: l.slug,
        status: l.status ?? 'active',
      })),
    })
  } catch (error) {
    console.error('[superadmin/tenants/[tenantId]/locations GET]', error)
    return NextResponse.json({ error: 'Error al obtener sedes' }, { status: 500 })
  }
}
