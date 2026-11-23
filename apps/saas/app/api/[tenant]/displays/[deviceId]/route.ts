/**
 * PATCH  /api/[tenant]/displays/[deviceId] — renombrar, orientación o sede.
 * DELETE /api/[tenant]/displays/[deviceId] — revocar: el token deja de servir
 *        y la pantalla vuelve a pedir un código.
 */
import crypto from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { z } from 'zod'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import DisplayDevice from '@/models/DisplayDevice'
import { screensAllowed, screensLockedResponse } from '@/lib/display/plan'
import { requireTenantRole, MANAGE_ROLES, getSessionUser } from '@/lib/apiAuth'
import { guardRequestLocation } from '@/lib/location-scope'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ tenant: string; deviceId: string }> }

async function load(request: NextRequest, ctx: Ctx) {
  const { tenant: slug, deviceId } = await ctx.params
  await connectDB()
  const tenant = await Tenant.findOne({ slug, isActive: true }).select('_id plan').lean<{ _id: mongoose.Types.ObjectId; plan?: string }>()
  if (!tenant) return { error: NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 }) }
  const authError = await requireTenantRole(request, String(tenant._id), MANAGE_ROLES)
  if (authError) return { error: authError }
  if (!screensAllowed(tenant.plan)) return { error: screensLockedResponse() }
  if (!mongoose.Types.ObjectId.isValid(deviceId)) return { error: NextResponse.json({ error: 'Pantalla no encontrada' }, { status: 404 }) }
  const device = await DisplayDevice.findOne({ _id: deviceId, tenantId: tenant._id, status: { $in: ['active', 'claimed'] } })
  if (!device) return { error: NextResponse.json({ error: 'Pantalla no encontrada' }, { status: 404 }) }
  if (device.locationId) {
    const sedeError = await guardRequestLocation(request, String(device.locationId), 'Pantalla no encontrada')
    if (sedeError) return { error: sedeError }
  }
  return { tenant, device }
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  orientation: z.enum(['landscape', 'portrait']).optional(),
  group: z.string().trim().max(30).nullable().optional(),
  command: z.enum(['reload', 'resync']).optional(),
  locationId: z.string().refine((v) => mongoose.Types.ObjectId.isValid(v)).optional(),
})

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const r = await load(request, ctx)
  if ('error' in r) return r.error
  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const { name, orientation, locationId, group, command } = parsed.data
  if (locationId) {
    if (!(await Location.exists({ _id: locationId, tenantId: r.tenant._id }))) return NextResponse.json({ error: 'Sede no encontrada' }, { status: 404 })
    const sedeError = await guardRequestLocation(request, locationId, 'Sede no encontrada')
    if (sedeError) return sedeError
    r.device.locationId = new mongoose.Types.ObjectId(locationId)
  }
  if (name !== undefined) r.device.name = name
  if (orientation !== undefined) r.device.orientation = orientation
  if (group !== undefined) r.device.group = group ? group : null
  if (command) r.device.command = { id: crypto.randomBytes(8).toString('hex'), type: command, issuedAt: new Date() }
  await r.device.save()
  logAudit({ tenantId: String(r.tenant._id), action: 'display.updated', entity: 'displayDevice', details: { deviceId: String(r.device._id), name, orientation, locationId, group, command }, request })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const r = await load(request, ctx)
  if ('error' in r) return r.error
  const user = await getSessionUser(request)
  r.device.status = 'revoked'
  r.device.tokenHash = null
  r.device.revokedAt = new Date()
  r.device.revokedBy = user?.id && mongoose.Types.ObjectId.isValid(user.id) ? new mongoose.Types.ObjectId(user.id) : null
  await r.device.save()
  logAudit({ tenantId: String(r.tenant._id), action: 'display.revoked', entity: 'displayDevice', details: { deviceId: String(r.device._id), name: r.device.name }, request })
  return NextResponse.json({ ok: true })
}
