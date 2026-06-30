import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Feedback from '@/models/Feedback'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    const body = await request.json()

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug }).select('_id')
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const feedback = await Feedback.create({
      tenantId: tenant._id,
      ...body,
    })

    return NextResponse.json({ ok: true, id: feedback._id })
  } catch (err: any) {
    console.error('Feedback error:', err)
    return NextResponse.json({ error: 'Error al guardar feedback' }, { status: 500 })
  }
}
