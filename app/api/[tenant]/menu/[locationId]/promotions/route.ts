import { connectDB } from '@/lib/mongoose'
import Promotion from '@/models/Promotion'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; locationId: string }> }
) {
  try {
    const { tenant: tenantSlug, locationId } = await params
    await connectDB()

    const tenant = await import('@/models/Tenant').then(m => 
      m.default.findOne({ slug: tenantSlug, isActive: true })
    )
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const mode = searchParams.get('mode') || 'takeaway'

    const now = new Date()

    const query: any = {
      tenantId: tenant._id,
      isActive: true,
      $or: [
        { locationId: null },
        { locationId }
      ],
      $and: [
        {
          $or: [
            { scheduledStart: null },
            { scheduledStart: { $lte: now } }
          ]
        },
        {
          $or: [
            { scheduledEnd: null },
            { scheduledEnd: { $gte: now } }
          ]
        }
      ]
    }

    const promotions = await Promotion.find(query).sort({ sortOrder: 1, createdAt: -1 })

    const filteredPromotions = promotions.filter(p => {
      if (p.visibility === 'both') return true
      if (p.visibility === mode) return true
      return false
    })

    return NextResponse.json({ promotions: filteredPromotions })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}