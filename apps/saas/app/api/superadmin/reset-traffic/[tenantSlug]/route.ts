import { connectDB } from '@/lib/mongoose'
import MenuVisit from '@/models/MenuVisit'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/apiAuth'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> }
) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const { tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug }).select('_id name slug').lean()
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const result = await MenuVisit.deleteMany({ tenantId: tenant._id })

    return NextResponse.json({
      ok: true,
      tenant: { slug: tenant.slug, name: tenant.name },
      deleted: result.deletedCount,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
