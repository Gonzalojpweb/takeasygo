import { connectDB } from '@/lib/mongoose'
import Combo from '@/models/Combo'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { requireTenantRole, MANAGE_ROLES } from '@/lib/apiAuth'
import { enforcePermissionForRequest } from '@/lib/rbac'
import { guardSharedOrLocation } from '@/lib/location-scope'
import { logAudit } from '@/lib/audit'
import { ComboInputError, parseComboInput } from '@/lib/combos/input'

const serverError = (error: unknown) => {
  console.error('[combos]', error)
  return NextResponse.json({ error: 'No se pudo completar la operación' }, { status: 500 })
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireTenantRole(request, tenant._id.toString(), MANAGE_ROLES)
    if (authError) return authError

    const { searchParams } = new URL(request.url)
    const locationId = searchParams.get('locationId')
    const filter: Record<string, unknown> = { tenantId: tenant._id }
    if (locationId) {
      if (!mongoose.isValidObjectId(locationId)) return NextResponse.json({ error: 'Sede inválida' }, { status: 400 })
      filter.$or = [{ locationId: null }, { locationId }]
    }
    const combos = await Combo.find(filter).sort({ sortOrder: 1, createdAt: -1 }).lean()
    return NextResponse.json({ combos })
  } catch (error) {
    return serverError(error)
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireTenantRole(request, tenant._id.toString(), MANAGE_ROLES)
    if (authError) return authError

    const permError = await enforcePermissionForRequest(request, {
      tenant,
      tenantId: tenant._id.toString(),
      permission: 'promotions.write',
    })
    if (permError) return permError

    const body = await request.json()
    const locationId = body?.locationId || null
    if (locationId && !mongoose.isValidObjectId(locationId)) return NextResponse.json({ error: 'Sede inválida' }, { status: 400 })
    const sedeError = await guardSharedOrLocation(request, locationId, 'Sede no encontrada')
    if (sedeError) return sedeError

    const combo = await Combo.create({ ...parseComboInput(body), tenantId: tenant._id, locationId })

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'combo.created',
      entity: 'combos',
      details: { comboId: combo._id, name: combo.name },
      request,
    })
    return NextResponse.json({ combo }, { status: 201 })
  } catch (error) {
    if (error instanceof ComboInputError) return NextResponse.json({ error: error.message }, { status: 400 })
    return serverError(error)
  }
}
