import { connectDB } from '@/lib/mongoose'
import Promotion from '@/models/Promotion'
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantRole, MANAGE_ROLES } from '@/lib/apiAuth'
import { enforcePermissionForRequest } from '@/lib/rbac'
import { guardSharedOrLocation } from '@/lib/location-scope'
import { logAudit } from '@/lib/audit'
import { resolveCtaLinkUpdate } from '@/lib/cta-link'
import { normalizeChannels } from '@/lib/sales-channels'
import { sanitizePromoScheduleInput } from '@/lib/promo-schedule'

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

    const authError = await requireTenantRole(request, tenant._id.toString(), MANAGE_ROLES)
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

    // 20/11/2026: horario en 12 h o 24 h → «HH:MM»; sin horas = todo el día.
    const scheduleError = sanitizePromoScheduleInput(data)
    if (scheduleError) return NextResponse.json({ error: scheduleError }, { status: 400 })

    // 20/11/2026: canales donde vale la promo ([] = todos). El viejo
    // `visibility` nunca se respetó: queda en 'both' para no confundir.
    if ('channels' in data || 'visibility' in data) {
      const channels = normalizeChannels(data.channels)
      if (channels === null) {
        return NextResponse.json({ error: 'Canales inválidos: elegí delivery, para retirar o en el salón' }, { status: 400 })
      }
      data.channels = channels
      data.visibility = 'both'
    }

    const existing = await Promotion.findOne({ _id: promotionId, tenantId: tenant._id })
      .select('locationId ctaLink').lean<{ locationId?: unknown; ctaLink?: string }>()
    if (!existing) {
      return NextResponse.json({ error: 'Promoción no encontrada' }, { status: 404 })
    }
    const sedeError = await guardSharedOrLocation(request, existing.locationId ?? null, 'Promoción no encontrada')
    if (sedeError) return sedeError
    if ('locationId' in data) {
      const targetError = await guardSharedOrLocation(request, data.locationId ?? null, 'Sede no encontrada')
      if (targetError) return targetError
    }

    // 20/11/2026: link validado; el mismo link viejo inválido pasa sin
    // cambios y con aviso (para no trabar la edición de otros campos).
    const cta = resolveCtaLinkUpdate(data.ctaLink, existing.ctaLink)
    if (!cta.ok) return NextResponse.json({ error: cta.error, field: 'ctaLink' }, { status: 400 })
    if (cta.changed) data.ctaLink = cta.value
    else delete data.ctaLink
    const warnings = !cta.changed && cta.warning ? [cta.warning] : []

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

    return NextResponse.json(warnings.length ? { promotion, warnings } : { promotion })
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

    const authError = await requireTenantRole(request, tenant._id.toString(), MANAGE_ROLES)
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