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

type Params = { params: Promise<{ tenant: string; id: string }> }

const serverError = (error: unknown) => {
  console.error('[combos]', error)
  return NextResponse.json({ error: 'No se pudo completar la operación' }, { status: 500 })
}

/** Comercio y permiso de escritura. Devuelve la respuesta de error si no pasa. */
async function writeContext(request: NextRequest, params: Params['params']) {
  const { tenant: tenantSlug, id } = await params
  await connectDB()
  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
  if (!tenant) return { error: NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 }) }
  const authError = await requireTenantRole(request, tenant._id.toString(), MANAGE_ROLES)
  if (authError) return { error: authError }
  const permError = await enforcePermissionForRequest(request, {
    tenant,
    tenantId: tenant._id.toString(),
    permission: 'promotions.write',
  })
  if (permError) return { error: permError }
  if (!mongoose.isValidObjectId(id)) return { error: NextResponse.json({ error: 'Combo no encontrado' }, { status: 404 }) }
  return { tenant, id }
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { tenant: tenantSlug, id } = await params
    await connectDB()
    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    const authError = await requireTenantRole(request, tenant._id.toString(), MANAGE_ROLES)
    if (authError) return authError
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: 'Combo no encontrado' }, { status: 404 })
    const combo = await Combo.findOne({ _id: id, tenantId: tenant._id }).lean()
    if (!combo) return NextResponse.json({ error: 'Combo no encontrado' }, { status: 404 })
    return NextResponse.json({ combo })
  } catch (error) {
    return serverError(error)
  }
}

async function update(request: NextRequest, params: Params['params'], action: string) {
  try {
    const ctx = await writeContext(request, params)
    if (ctx.error) return ctx.error
    const combo = await Combo.findOne({ _id: ctx.id, tenantId: ctx.tenant!._id })
    if (!combo) return NextResponse.json({ error: 'Combo no encontrado' }, { status: 404 })

    const body = await request.json()
    combo.set(parseComboInput(body, combo.toObject()))
    if (body?.locationId !== undefined) {
      const locationId = body.locationId || null
      if (locationId && !mongoose.isValidObjectId(locationId)) return NextResponse.json({ error: 'Sede inválida' }, { status: 400 })
      const sedeError = await guardSharedOrLocation(request, locationId, 'Sede no encontrada')
      if (sedeError) return sedeError
      combo.locationId = locationId
    }
    await combo.save()

    logAudit({
      tenantId: ctx.tenant!._id.toString(),
      action,
      entity: 'combos',
      details: { comboId: combo._id, name: combo.name, isActive: combo.isActive },
      request,
    })
    return NextResponse.json({ combo })
  } catch (error) {
    if (error instanceof ComboInputError) return NextResponse.json({ error: error.message }, { status: 400 })
    return serverError(error)
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  return update(request, params, 'combo.updated')
}

export async function PATCH(request: NextRequest, { params }: Params) {
  return update(request, params, 'combo.patched')
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const ctx = await writeContext(request, params)
    if (ctx.error) return ctx.error
    const combo = await Combo.findOneAndDelete({ _id: ctx.id, tenantId: ctx.tenant!._id })
    if (!combo) return NextResponse.json({ error: 'Combo no encontrado' }, { status: 404 })
    logAudit({
      tenantId: ctx.tenant!._id.toString(),
      action: 'combo.deleted',
      entity: 'combos',
      details: { comboId: ctx.id, name: combo.name },
      request,
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    return serverError(error)
  }
}
