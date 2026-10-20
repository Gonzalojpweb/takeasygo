import { connectDB } from '@/lib/mongoose'
import mongoose from 'mongoose'
import Location from '@/models/Location'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/apiAuth'
import { enforcePermissionOrAdmin } from '@/lib/rbac'
import { guardResourceLocation } from '@/lib/location-scope'
import { logAudit } from '@/lib/audit'
import { generateAgentToken, hashAgentToken } from '@/lib/printer-agent-auth'

/**
 * Token del agente de impresión de una sede (P-1).
 *
 * POST   → genera (o rota) el token: se guarda solo el hash y el token en
 *          claro se devuelve UNA vez. Desde ese momento la sede exige el
 *          token en print-jobs (el agente viejo sin token deja de imprimir
 *          hasta cargarlo en SETUP).
 * DELETE → revoca: la sede vuelve al modo sin token.
 */
async function resolveContext(
  request: NextRequest,
  params: Promise<{ tenant: string; locationId: string }>
) {
  const { tenant: tenantSlug, locationId } = await params
  await connectDB()
  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
  if (!tenant) return { error: NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 }) }

  const permError = await enforcePermissionOrAdmin(request, {
    tenant,
    tenantId: tenant._id.toString(),
    locationId,
    permission: 'printjobs.manage',
  })
  if (permError) return { error: permError }

  if (!mongoose.Types.ObjectId.isValid(locationId)) {
    return { error: NextResponse.json({ error: 'Sede no encontrada' }, { status: 404 }) }
  }
  const location = await Location.findOne({ _id: locationId, tenantId: tenant._id })
    .select('_id name')
    .lean<{ _id: mongoose.Types.ObjectId; name: string }>()
  if (!location) return { error: NextResponse.json({ error: 'Sede no encontrada' }, { status: 404 }) }

  const user = await getSessionUser(request)
  const scopeError = guardResourceLocation(user, location._id, 'Sede no encontrada')
  if (scopeError) return { error: scopeError }

  return { tenant, location }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; locationId: string }> }
) {
  try {
    const ctx = await resolveContext(request, params)
    if ('error' in ctx) return ctx.error
    const { tenant, location } = ctx

    const token = generateAgentToken()
    await Location.updateOne(
      { _id: location._id, tenantId: tenant._id },
      { $set: { 'printerAgent.secretHash': hashAgentToken(token) } }
    )

    logAudit({
      tenantId: tenant._id.toString(),
      locationId: location._id.toString(),
      action: 'printer_agent.token_generated',
      entity: 'location',
      entityId: location._id.toString(),
      details: { locationName: location.name },
      request,
    })

    return NextResponse.json({ token })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; locationId: string }> }
) {
  try {
    const ctx = await resolveContext(request, params)
    if ('error' in ctx) return ctx.error
    const { tenant, location } = ctx

    await Location.updateOne(
      { _id: location._id, tenantId: tenant._id },
      { $set: { 'printerAgent.secretHash': null } }
    )

    logAudit({
      tenantId: tenant._id.toString(),
      locationId: location._id.toString(),
      action: 'printer_agent.token_revoked',
      entity: 'location',
      entityId: location._id.toString(),
      details: { locationName: location.name },
      request,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
