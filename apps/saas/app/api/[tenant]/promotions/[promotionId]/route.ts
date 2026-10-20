import { connectDB } from '@/lib/mongoose'
import Promotion from '@/models/Promotion'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { enforcePermissionForRequest } from '@/lib/rbac'
import { guardSharedOrLocation } from '@/lib/location-scope'
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

    const permError = await enforcePermissionForRequest(request, {
      tenant,
      tenantId: tenant._id.toString(),
      permission: 'promotions.write',
    })
    if (permError) return permError

    const body = await request.json()
    // Sin asignación masiva de pertenencia: tenantId/_id no se editan.
    // Pertenencia y alcance de plataforma (scope global / targetTenants)
    // no se asignan desde el panel del tenant.
    const { _id: _ignoredId, tenantId: _ignoredTenant, scope: _ignoredScope, targetTenants: _ignoredTargets, ...data } = body

    const existing = await Promotion.findOne({ _id: promotionId, tenantId: tenant._id })
      .select('locationId').lean<{ locationId?: unknown }>()
    if (!existing) {
      return NextResponse.json({ error: 'Promoción no encontrada' }, { status: 404 })
    }
    const sedeError = await guardSharedOrLocation(request, existing.locationId ?? null, 'Promoción no encontrada')
    if (sedeError) return sedeError
    if ('locationId' in data) {
      const targetError = await guardSharedOrLocation(request, data.locationId ?? null, 'Sede no encontrada')
      if (targetError) return targetError
    }

    const promotion = await Promotion.findOneAndUpdate(
      { _id: promotionId, tenantId: tenant._id },
      { $set: data },
      { returnDocument: 'after' }
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

    const permError = await enforcePermissionForRequest(request, {
      tenant,
      tenantId: tenant._id.toString(),
      permission: 'promotions.write',
    })
    if (permError) return permError

    const existing = await Promotion.findOne({ _id: promotionId, tenantId: tenant._id })
      .select('locationId').lean<{ locationId?: unknown }>()
    if (!existing) {
      return NextResponse.json({ error: 'Promoción no encontrada' }, { status: 404 })
    }
    const sedeError = await guardSharedOrLocation(request, existing.locationId ?? null, 'Promoción no encontrada')
    if (sedeError) return sedeError

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