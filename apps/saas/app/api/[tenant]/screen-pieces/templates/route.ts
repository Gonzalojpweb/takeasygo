/**
 * GET  /api/[tenant]/screen-pieces/templates?locationId= — categorías de la carta
 *      de la sede (para elegir qué mostrar y en qué orden). Con &catalog=1,
 *      también productos, combos y promos (armador de composiciones).
 * POST /api/[tenant]/screen-pieces/templates — nueva pieza automática (carta o promos).
 *
 * La pieza automática entra en la misma lista que las piezas subidas (mismo
 * tope de 20 activas, sin peso: no tiene archivo). Solo plan Élite y rol de
 * gestión con promotions.write (screenPiecesContext).
 */
import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import AppStory from '@/models/AppStory'
import Menu from '@/models/Menu'
import Combo from '@/models/Combo'
import Promotion from '@/models/Promotion'
import { logAudit } from '@/lib/audit'
import { screenUsage } from '@/lib/display/quota'
import { scheduleError } from '@/lib/display/pieces'
import { createTemplatePieceSchema, TEMPLATES_NEED_LOCATION } from '@/lib/display/templates'
import { illustrationUrls } from '@/lib/display/composition-schema'
import { compositionMediaError } from '@/lib/display/composition-media'
import { markSaved } from '@/lib/media/ads'
import { SCREEN_MAX_ACTIVE_PIECES } from '@/lib/display/constants'
import { screenPiecesContext, serializePiece, checkPieceLocation } from '@/lib/display/pieces-route'

export const dynamic = 'force-dynamic'

type AnyDoc = Record<string, any>

export async function GET(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const ctx = await screenPiecesContext(request, params)
  if ('error' in ctx) return ctx.error
  const locationId = request.nextUrl.searchParams.get('locationId')
  if (!locationId || !mongoose.Types.ObjectId.isValid(locationId)) return NextResponse.json({ error: 'Elegí la sede' }, { status: 400 })
  const locErr = await checkPieceLocation(request, ctx, locationId)
  if (locErr) return locErr
  const withCatalog = request.nextUrl.searchParams.get('catalog') === '1'
  const tid = new mongoose.Types.ObjectId(ctx.tenantId)
  const lid = new mongoose.Types.ObjectId(locationId)
  const menu = await Menu.findOne({ tenantId: tid, locationId: lid })
    .select(withCatalog
      ? 'categories._id categories.name categories.isAvailable categories.sortOrder categories.items._id categories.items.name categories.items.imageUrl categories.items.isAvailable categories.subcategories.name categories.subcategories.items._id categories.subcategories.items.name categories.subcategories.items.imageUrl categories.subcategories.items.isAvailable'
      : 'categories._id categories.name categories.isAvailable categories.sortOrder categories.items._id categories.subcategories.items._id')
    .lean<AnyDoc>()
  const categories = [...(menu?.categories ?? [])]
    .sort((a: AnyDoc, b: AnyDoc) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((c: AnyDoc) => ({
      _id: String(c._id),
      name: String(c.name ?? ''),
      isAvailable: c.isAvailable !== false,
      products: (c.items?.length ?? 0) + (c.subcategories ?? []).reduce((n: number, s: AnyDoc) => n + (s.items?.length ?? 0), 0),
    }))
  if (!withCatalog) return NextResponse.json({ categories })
  const products: Array<{ _id: string; name: string; category: string; hasPhoto: boolean; isAvailable: boolean }> = []
  for (const c of [...(menu?.categories ?? [])].sort((a: AnyDoc, b: AnyDoc) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))) {
    const add = (i: AnyDoc, cat: string) => products.push({ _id: String(i._id), name: String(i.name ?? ''), category: cat, hasPhoto: !!i.imageUrl, isAvailable: i.isAvailable !== false })
    for (const i of c.items ?? []) add(i, String(c.name ?? ''))
    for (const sub of c.subcategories ?? []) for (const i of sub.items ?? []) add(i, `${c.name} · ${sub.name}`)
  }
  const [combos, promos] = await Promise.all([
    Combo.find({ tenantId: tid, isActive: true, $or: [{ locationId: null }, { locationId: { $exists: false } }, { locationId: lid }] }).select('name').sort({ sortOrder: 1 }).limit(50).lean<AnyDoc[]>(),
    Promotion.find({ tenantId: tid, scope: { $ne: 'global' }, isActive: true, $or: [{ locationId: null }, { locationId: { $exists: false } }, { locationId: lid }] }).select('title').sort({ sortOrder: 1 }).limit(50).lean<AnyDoc[]>(),
  ])
  return NextResponse.json({
    categories,
    products,
    combos: combos.map((c) => ({ _id: String(c._id), name: String(c.name ?? '') })),
    promotions: promos.map((p) => ({ _id: String(p._id), title: String(p.title ?? '') })),
  })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const ctx = await screenPiecesContext(request, params)
  if ('error' in ctx) return ctx.error
  const parsed = createTemplatePieceSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  const b = parsed.data
  const sched = scheduleError(b.startsAt, b.endsAt)
  if (sched) return NextResponse.json({ error: sched }, { status: 400 })
  if (TEMPLATES_NEED_LOCATION.has(b.template.kind) && !b.locationId) return NextResponse.json({ error: 'Elegí la sede: cada sede tiene su carta' }, { status: 400 })
  const locErr = await checkPieceLocation(request, ctx, b.locationId ?? null)
  if (locErr) return locErr
  const mediaErr = b.template.kind === 'composition' ? compositionMediaError(b.template.config, ctx.tenantId) : null
  if (mediaErr) return NextResponse.json({ error: mediaErr }, { status: 400 })

  const active = b.isActive !== false
  if (active) {
    const usage = await screenUsage(ctx.tenantId)
    if (usage.active >= SCREEN_MAX_ACTIVE_PIECES) return NextResponse.json({ error: `Ya tenés ${usage.active} piezas activas (máximo ${SCREEN_MAX_ACTIVE_PIECES}). Pausá alguna.` }, { status: 409 })
  }

  const doc = await AppStory.create({
    title: b.title,
    type: 'promotion',
    surfaces: ['screen'],
    owner: { kind: 'tenant', tenantId: new mongoose.Types.ObjectId(ctx.tenantId), locationId: b.locationId ? new mongoose.Types.ObjectId(b.locationId) : null },
    imageUrl: '',
    videoUrl: '',
    screenTemplate: { kind: b.template.kind, config: b.template.config },
    scheduledStart: b.startsAt ? new Date(b.startsAt) : null,
    scheduledEnd: b.endsAt ? new Date(b.endsAt) : null,
    daypart: b.daypart ?? null,
    isActive: active,
    sortOrder: b.sortOrder ?? 0,
  })
  if (b.template.kind === 'composition') await markSaved(illustrationUrls(b.template.config))
  logAudit({ tenantId: ctx.tenantId, action: 'screen_piece.created', entity: 'appStory', details: { pieceId: String(doc._id), title: doc.title, kind: `template:${b.template.kind}` }, request })
  return NextResponse.json({ piece: serializePiece(doc.toObject()) }, { status: 201 })
}
