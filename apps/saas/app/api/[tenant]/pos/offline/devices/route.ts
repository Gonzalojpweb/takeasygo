import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { OFFLINE_DEVICE_LIMIT } from '@takeasygo/business'
import Tenant from '@/models/Tenant'
import Printer from '@/models/Printer'
import PosOfflineDevice, { type IPosOfflineDevice } from '@/models/PosOfflineDevice'
import { logAudit } from '@/lib/audit'
import { posRoute, readPosBody } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { OP_ID_RE } from '@/lib/pos-online/opReceipt'
import type { Plan } from '@/lib/plans'

// ============================================================================
// /api/[tenant]/pos/offline/devices — equipos habilitados para operar sin internet
// ============================================================================
// GET    (cualquier usuario del POS) — lista de la sede, tope del plan y si ESTE
//        equipo (X-Pos-Device-Id) está habilitado. El POS lo consulta al entrar
//        y en cada vuelta de conexión: un equipo revocado deja de operar offline.
// POST   (admin y encargado) — habilita este equipo { deviceId, name }.
// DELETE (admin y encargado) — ?deviceId= revoca y libera el lugar.
// Tope por sede: OFFLINE_DEVICE_LIMIT (Inicial/Crecimiento 1, Premium/Élite 2).
// ============================================================================

type DeviceDoc = Pick<IPosOfflineDevice, 'deviceId' | 'name' | 'role' | 'lastSeenAt' | 'createdAt'>

const toWire = (d: DeviceDoc) => ({
  deviceId: d.deviceId,
  name: d.name,
  role: d.role,
  lastSeenAt: d.lastSeenAt ? new Date(d.lastSeenAt).toISOString() : null,
  enabledAt: new Date(d.createdAt).toISOString(),
})

async function limitFor(tenantId: string): Promise<number> {
  const t = await Tenant.findById(tenantId).select('plan').lean<{ plan?: Plan }>()
  return OFFLINE_DEVICE_LIMIT[t?.plan ?? 'try'] ?? 1
}

function activeFilter(tenantId: string, locationId: string) {
  return {
    tenantId: new mongoose.Types.ObjectId(tenantId),
    locationId: new mongoose.Types.ObjectId(locationId),
    revokedAt: null,
  }
}

function readDeviceId(value: unknown): string {
  const id = typeof value === 'string' ? value.trim() : ''
  if (!OP_ID_RE.test(id)) throw PosError.validation('deviceId inválido')
  return id
}

export const GET = posRoute('tables.read', async (ctx) => {
  const [devices, limit] = await Promise.all([
    PosOfflineDevice.find(activeFilter(ctx.tenantId, ctx.locationId)).sort({ role: 1, createdAt: 1 }).lean<DeviceDoc[]>(),
    limitFor(ctx.tenantId),
  ])
  const headerId = ctx.request.headers.get('x-pos-device-id')?.trim() ?? ''
  const mine = devices.find((d) => d.deviceId === headerId) ?? null
  if (mine) {
    await PosOfflineDevice.updateOne(
      { tenantId: new mongoose.Types.ObjectId(ctx.tenantId), deviceId: mine.deviceId },
      { $set: { lastSeenAt: new Date() } }
    )
  }
  // Etapa 4: un equipo habilitado guarda las impresoras de la sede para armar
  // sin internet la comanda de cada estación (la manda por la red local).
  const printers = mine
    ? (
        await Printer.find({ tenantId: ctx.tenantId, locationId: ctx.locationId, isActive: true })
          .select('name paperWidth roles printSettings')
          .lean<{ _id: unknown; name: string; paperWidth?: number; roles?: string[]; printSettings?: Record<string, unknown> }[]>()
      ).map((p) => ({ id: String(p._id), name: p.name, paperWidth: p.paperWidth === 58 ? 58 : 80, roles: p.roles ?? [], printSettings: p.printSettings ?? {} }))
    : undefined
  return NextResponse.json({
    limit,
    devices: devices.map(toWire),
    thisDevice: mine ? { enabled: true, role: mine.role, name: mine.name } : { enabled: false, role: null, name: null },
    ...(printers ? { printers } : {}),
  })
})

export const POST = posRoute('config.manage', async (ctx) => {
  const body = await readPosBody<{ deviceId?: unknown; name?: unknown }>(ctx.request)
  const deviceId = readDeviceId(body.deviceId)
  const name = (typeof body.name === 'string' ? body.name.trim() : '').slice(0, 60) || 'Equipo del POS'
  const tenantOid = new mongoose.Types.ObjectId(ctx.tenantId)
  const locationOid = new mongoose.Types.ObjectId(ctx.locationId)

  const existing = await PosOfflineDevice.findOne({ tenantId: tenantOid, deviceId })
  if (existing && !existing.revokedAt) {
    if (String(existing.locationId) !== ctx.locationId) {
      throw PosError.conflict('Este equipo ya está habilitado sin internet en otra sede. Revocalo allá primero.')
    }
    if (existing.name !== name) {
      existing.name = name
      await existing.save()
    }
    return NextResponse.json({ device: toWire(existing) })
  }

  const [active, limit] = await Promise.all([
    PosOfflineDevice.find(activeFilter(ctx.tenantId, ctx.locationId)).select('role').lean<{ role: string }[]>(),
    limitFor(ctx.tenantId),
  ])
  if (active.length >= limit) {
    throw PosError.conflict(
      limit === 0
        ? 'Tu plan no incluye el POS sin internet.'
        : `Tu plan permite ${limit} ${limit === 1 ? 'equipo' : 'equipos'} sin internet por sede. Revocá uno para habilitar este.`
    )
  }
  const role = active.some((d) => d.role === 'primary') ? 'secondary' : 'primary'

  const device = existing
    ? Object.assign(existing, { locationId: locationOid, name, role, revokedAt: null, registeredBy: new mongoose.Types.ObjectId(ctx.user.id), lastSeenAt: new Date() })
    : new PosOfflineDevice({
        tenantId: tenantOid,
        locationId: locationOid,
        deviceId,
        name,
        role,
        registeredBy: mongoose.Types.ObjectId.isValid(ctx.user.id) ? new mongoose.Types.ObjectId(ctx.user.id) : null,
        lastSeenAt: new Date(),
      })
  await device.save()

  logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.offline.device_enabled',
    entity: 'location',
    entityId: ctx.locationId,
    details: { deviceId, name, role },
    request: ctx.request,
  })
  return NextResponse.json({ device: toWire(device) }, { status: 201 })
})

export const DELETE = posRoute('config.manage', async (ctx) => {
  const deviceId = readDeviceId(new URL(ctx.request.url).searchParams.get('deviceId'))
  const filter = { ...activeFilter(ctx.tenantId, ctx.locationId), deviceId }
  const device = await PosOfflineDevice.findOneAndUpdate(filter, { $set: { revokedAt: new Date() } }, { new: true })
  if (!device) throw PosError.notFound('Ese equipo no está habilitado sin internet en esta sede')

  // Si se revoca el principal, el secundario pasa a ser el principal.
  if (device.role === 'primary') {
    await PosOfflineDevice.findOneAndUpdate(
      { ...activeFilter(ctx.tenantId, ctx.locationId), role: 'secondary' },
      { $set: { role: 'primary' } },
      { sort: { createdAt: 1 } }
    )
  }
  logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.offline.device_revoked',
    entity: 'location',
    entityId: ctx.locationId,
    details: { deviceId, name: device.name },
    request: ctx.request,
  })
  return NextResponse.json({ ok: true })
})
