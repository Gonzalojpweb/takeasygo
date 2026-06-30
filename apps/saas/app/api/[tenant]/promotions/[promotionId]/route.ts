import { connectDB } from '@/lib/mongoose'
import Promotion from '@/models/Promotion'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; promotionId: string }> }
) {
  try {
    const { tenant: tenantSlug, promotionId } = await params
    await connectDB()

    const tenant = await import('@/models/Tenant').then(m => 
      m.default.findOne({ slug: tenantSlug, isActive: true })
    )
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const promotion = await Promotion.findOne({ 
      _id: promotionId, 
      tenantId: tenant._id 
    })

    if (!promotion) {
      return NextResponse.json({ error: 'Promoción no encontrada' }, { status: 404 })
    }

    return NextResponse.json({ promotion })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; promotionId: string }> }
) {
  try {
    const { tenant: tenantSlug, promotionId } = await params
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

    const promotion = await Promotion.findOneAndUpdate(
      { _id: promotionId, tenantId: tenant._id },
      { $set: body },
      { new: true }
    )

    if (!promotion) {
      return NextResponse.json({ error: 'Promoción no encontrada' }, { status: 404 })
    }

    logAudit({ 
      tenantId: tenant._id.toString(), 
      action: 'promotion.updated', 
      entity: 'promotion', 
      details: { promotionId: promotion._id, title: promotion.title }, 
      request 
    })

    return NextResponse.json({ promotion })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; promotionId: string }> }
) {
  try {
    const { tenant: tenantSlug, promotionId } = await params
    await connectDB()

    const tenant = await import('@/models/Tenant').then(m => 
      m.default.findOne({ slug: tenantSlug, isActive: true })
    )
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const promotion = await Promotion.findOneAndDelete({ 
      _id: promotionId, 
      tenantId: tenant._id 
    })

    if (!promotion) {
      return NextResponse.json({ error: 'Promoción no encontrada' }, { status: 404 })
    }

    logAudit({ 
      tenantId: tenant._id.toString(), 
      action: 'promotion.deleted', 
      entity: 'promotion', 
      details: { promotionId: promotion._id, title: promotion.title }, 
      request 
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}