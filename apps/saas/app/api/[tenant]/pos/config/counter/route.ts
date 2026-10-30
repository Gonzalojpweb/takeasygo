import { NextResponse } from 'next/server'
import Location from '@/models/Location'
import { logAudit } from '@/lib/audit'
import { posRoute, readPosBody, requireFields } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'

// ============================================================================
// /api/[tenant]/pos/config/counter — Configuración › Mostrador (30/10/2026)
// ============================================================================
// GET (cualquier rol del POS): cómo se ve el Mostrador en la sede. El
//      selector de productos lo necesita para dibujarse, por eso no exige
//      config.manage.
// PUT { showProductImages: boolean } (solo admin): con o sin las fotos del
//      menú en las tarjetas. Son las mismas imágenes del menú (/takeaway).
// ============================================================================

type CounterConfig = { showProductImages: boolean }

async function current(ctx: { tenantId: string; locationId: string }): Promise<CounterConfig> {
  const loc = await Location.findOne({ _id: ctx.locationId, tenantId: ctx.tenantId })
    .select('posCounter')
    .lean<{ posCounter?: Partial<CounterConfig> }>()
  return { showProductImages: loc?.posCounter?.showProductImages === true }
}

export const GET = posRoute('catalog.read', async (ctx) => {
  return NextResponse.json(await current(ctx))
})

export const PUT = posRoute('config.admin', async (ctx) => {
  const body = await readPosBody(ctx.request)
  requireFields(body, ['showProductImages'])
  if (typeof body.showProductImages !== 'boolean') throw PosError.validation('showProductImages tiene que ser verdadero o falso')
  const res = await Location.updateOne(
    { _id: ctx.locationId, tenantId: ctx.tenantId },
    { $set: { 'posCounter.showProductImages': body.showProductImages } },
    { runValidators: true },
  )
  if (res.matchedCount === 0) throw PosError.notFound('Sede no encontrada')
  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.config.counter.update',
    entity: 'Location',
    entityId: ctx.locationId,
    details: { showProductImages: body.showProductImages },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })
  return NextResponse.json(await current(ctx))
})
