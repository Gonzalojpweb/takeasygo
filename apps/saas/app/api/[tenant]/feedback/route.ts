import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Feedback from '@/models/Feedback'
import { captureFeedbackSubmitted } from '@/lib/events'
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

    // M3: Track feedback submission (MongoDB)
    captureFeedbackSubmitted({
      phoneHash: body.phoneHash || '',
      event: body.event || body.type || 'feedback',
    })

    return NextResponse.json({ ok: true, id: feedback._id })
  } catch (err: any) {
    console.error('Feedback error:', err)
    return NextResponse.json({ error: 'Error al guardar feedback' }, { status: 500 })
  }
}
