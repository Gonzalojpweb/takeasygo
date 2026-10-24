import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import mongoose from 'mongoose'
import Location from '@/models/Location'
import { logAudit } from '@/lib/audit'
import { fiscalAdminContext } from '@/lib/fiscal/admin-context'
import { MpPointError, listPointDevices, pointTokenFor, setPointPdvMode } from '@/lib/mp-point'

// ============================================================================
// GET/PUT /api/[tenant]/admin/mp-point — posnet MercadoPago Point por sede
// ============================================================================
// Fase 6. GET: sedes con su posnet y los dispositivos de la cuenta de MP del
// comercio. PUT { locationId, deviceId | null }: asigna el posnet a la caja de
// la sede y lo pasa a modo PDV (integrado). Permiso: payments.configure.
// ============================================================================

export async function GET(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const ctx = await fiscalAdminContext(request, (await params).tenant, 'payments.configure')
  if ('error' in ctx) return ctx.error
  const locations = await Location.find({ tenantId: ctx.tenant._id, isActive: true })
    .select('_id name settings.mpPointDeviceId')
    .sort({ name: 1 })
    .lean<{ _id: mongoose.Types.ObjectId; name: string; settings?: { mpPointDeviceId?: string | null } }[]>()

  let devices: Awaited<ReturnType<typeof listPointDevices>> = []
  let error: string | null = null
  if (locations[0]) {
    try {
      devices = await listPointDevices(await pointTokenFor(ctx.tenantId, String(locations[0]._id)))
    } catch (err) {
      error = err instanceof MpPointError ? err.message : 'No se pudieron leer los posnet de MercadoPago'
    }
  }
  return NextResponse.json({
    locations: locations.map((l) => ({ id: String(l._id), name: l.name, deviceId: l.settings?.mpPointDeviceId ?? null })),
    devices,
    error,
  })
}

const bodySchema = z.object({
  locationId: z.string().regex(/^[a-f0-9]{24}$/),
  deviceId: z.string().regex(/^[A-Za-z0-9_-]{1,120}$/).nullable(),
})

export async function PUT(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const ctx = await fiscalAdminContext(request, (await params).tenant, 'payments.configure')
  if ('error' in ctx) return ctx.error
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const { locationId, deviceId } = parsed.data

  const location = await Location.findOne({ _id: locationId, tenantId: ctx.tenant._id })
  if (!location) return NextResponse.json({ error: 'Sede no encontrada' }, { status: 404 })

  if (deviceId) {
    try {
      const token = await pointTokenFor(ctx.tenantId, locationId)
      const devices = await listPointDevices(token)
      if (!devices.some((d) => d.id === deviceId)) {
        return NextResponse.json({ error: 'Ese posnet no está en la cuenta de MercadoPago del comercio' }, { status: 400 })
      }
      await setPointPdvMode(token, deviceId)
    } catch (err) {
      const message = err instanceof MpPointError ? err.message : 'No se pudo configurar el posnet'
      return NextResponse.json({ error: message }, { status: 502 })
    }
  }

  await Location.updateOne({ _id: locationId, tenantId: ctx.tenant._id }, { $set: { 'settings.mpPointDeviceId': deviceId } })
  await logAudit({
    tenantId: ctx.tenantId,
    action: 'mp.point.device',
    entity: 'Location',
    entityId: locationId,
    details: { deviceId },
    request,
    userId: ctx.user?.id,
    userRole: ctx.user?.role,
  })
  return NextResponse.json({ ok: true })
}
