import { connectDB } from '@/lib/mongoose'
import Promotion from '@/models/Promotion'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await import('@/models/Tenant').then(m => 
      m.default.findOne({ slug: tenantSlug, isActive: true })
    )
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const locationId = searchParams.get('locationId')
    const isActive = searchParams.get('isActive')
    const visibility = searchParams.get('visibility')

    const query: any = { tenantId: tenant._id }

    if (locationId) {
      query.$or = [
        { locationId: null },
        { locationId }
      ]
    }

    if (isActive !== null) {
      query.isActive = isActive === 'true'
    }

    if (visibility) {
      query.visibility = visibility
    }

    const promotions = await Promotion.find(query).sort({ sortOrder: 1, createdAt: -1 })

    return NextResponse.json({ promotions })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await import('@/models/Tenant').then(m => 
      m.default.findOne({ slug: tenantSlug, isActive: true })
    )
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const body = await request.json()

    const promotion = await Promotion.create({
      ...body,
      tenantId: tenant._id,
    })

    logAudit({ 
      tenantId: tenant._id.toString(), 
      action: 'promotion.created', 
      entity: 'promotion', 
      details: { promotionId: promotion._id, title: promotion.title }, 
      request 
    })

    return NextResponse.json({ promotion }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}