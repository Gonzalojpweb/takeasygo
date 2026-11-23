/**
 * POST /api/[tenant]/screen-pieces/preview — arma una composición SIN guardarla,
 * con el mismo motor que la pantalla, para la vista previa del panel.
 * Body: { locationId, template: { kind: 'composition', config } }.
 * Élite + rol de gestión con promotions.write (screenPiecesContext).
 */
import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { z } from 'zod'
import Location from '@/models/Location'
import Tenant from '@/models/Tenant'
import { screenPiecesContext, checkPieceLocation } from '@/lib/display/pieces-route'
import { compositionConfigSchema } from '@/lib/display/composition-schema'
import { buildCompositionBoard } from '@/lib/display/composition'
import { buildPromoBoard, parsePromosConfig } from '@/lib/display/templates'
import { effectiveScheduleWindow } from '@/lib/promo-schedule'
import { loadTemplateCtx } from '@/lib/display/manifest'
import { orderUrlFor } from '@/lib/display/attribution'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  locationId: z.string().refine((v) => mongoose.Types.ObjectId.isValid(v), 'Elegí la sede'),
  template: z.object({ kind: z.literal('composition'), config: compositionConfigSchema }),
})

const maxPercent = (p: Record<string, any>) => {
  const max = (Array.isArray(p.discountTargets) ? p.discountTargets : []).reduce((m: number, t: { percent?: number }) => Math.max(m, Number(t?.percent) || 0), 0)
  return max > 0 ? Math.round(max) : null
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const ctx = await screenPiecesContext(request, params)
  if ('error' in ctx) return ctx.error
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  const { locationId, template } = parsed.data
  const locErr = await checkPieceLocation(request, ctx, locationId)
  if (locErr) return locErr
  const cfg = template.config
  const tctx = await loadTemplateCtx({ tenantId: ctx.tenantId, locationId, orientation: cfg.orientation }, new Set(['composition']))
  if (!tctx.tenant) return NextResponse.json({ error: 'Comercio no encontrado' }, { status: 404 })
  const promos = buildPromoBoard(tctx.promos, tctx.tenant, parsePromosConfig({}), (s, e) => effectiveScheduleWindow(s as Date, e as Date, tctx.timezone), maxPercent).promos
  const board = buildCompositionBoard(tctx.menu, tctx.tenant, cfg, tctx.combos, promos, tctx.fonts)
  const [loc, tenant] = await Promise.all([
    Location.findById(locationId).select('slug').lean<{ _id: unknown; slug?: string }>(),
    Tenant.findById(ctx.tenantId).select('slug').lean<{ slug?: string }>(),
  ])
  return NextResponse.json({
    template: board,
    timezone: tctx.timezone,
    orderUrl: tenant?.slug && loc ? orderUrlFor(tenant.slug, loc, 'vista-previa') : null,
  })
}
