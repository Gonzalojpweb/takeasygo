import { NextResponse } from 'next/server'
import { DELIVERY_PLATFORM_LIST, validateDeliveryPlatforms, type DeliveryPlatformConfig } from '@takeasygo/business'
import Location from '@/models/Location'
import { logAudit } from '@/lib/audit'
import { posRoute, readPosBody, requireFields } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'

// ============================================================================
// /api/[tenant]/pos/config/delivery-platforms — Configuración › Deliverys
// ============================================================================
// GET  (admin y encargado): las plataformas conocidas con la config de la
//      sede (las no configuradas vienen inactivas, 0 %, cobra la plataforma).
// PUT  { platforms: [{ id, enabled, commissionPercent, settlement }] }.
// ============================================================================

async function current(ctx: { tenantId: string; locationId: string }) {
  const loc = await Location.findOne({ _id: ctx.locationId, tenantId: ctx.tenantId })
    .select('deliveryPlatforms')
    .lean<{ deliveryPlatforms?: DeliveryPlatformConfig[] }>()
  const saved = new Map((loc?.deliveryPlatforms ?? []).map((p) => [p.id, p]))
  return DELIVERY_PLATFORM_LIST.map((p) => {
    const s = saved.get(p.id)
    return {
      id: p.id,
      label: p.label,
      enabled: s?.enabled ?? false,
      commissionPercent: s?.commissionPercent ?? 0,
      settlement: s?.settlement ?? 'platform',
    }
  })
}

export const GET = posRoute('config.manage', async (ctx) => {
  return NextResponse.json({ platforms: await current(ctx) })
})

export const PUT = posRoute('config.manage', async (ctx) => {
  const body = await readPosBody(ctx.request)
  requireFields(body, ['platforms'])
  const v = validateDeliveryPlatforms(body.platforms)
  if (!v.ok) throw PosError.validation(v.error)
  const res = await Location.updateOne({ _id: ctx.locationId, tenantId: ctx.tenantId }, { $set: { deliveryPlatforms: v.platforms } }, { runValidators: true })
  if (res.matchedCount === 0) throw PosError.notFound('Sede no encontrada')
  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.config.delivery_platforms.update',
    entity: 'Location',
    entityId: ctx.locationId,
    details: { platforms: v.platforms.map((p) => `${p.id}:${p.enabled ? 'on' : 'off'}:${p.commissionPercent}%:${p.settlement}`) },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })
  return NextResponse.json({ platforms: await current(ctx) })
})
