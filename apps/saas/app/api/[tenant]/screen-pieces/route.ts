/**
 * GET  /api/[tenant]/screen-pieces — piezas de pantalla del comercio.
 * POST /api/[tenant]/screen-pieces — nueva pieza (sin aprobación: contenido propio).
 *
 * El archivo tiene que venir del flujo firmado (/api/[tenant]/media, superficie
 * screen) y estar en la carpeta de pantallas de ESTE comercio. Tope: 20 piezas
 * activas y 1,5 GB. Un usuario de sede solo crea piezas para sus sedes.
 */
import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import AppStory from '@/models/AppStory'
import { logAudit } from '@/lib/audit'
import { markSaved } from '@/lib/media/ads'
import { screenPiecesFilter, screenUsage } from '@/lib/display/quota'
import { createPieceSchema, mediaBelongsToTenant, pieceMediaFields, scheduleError } from '@/lib/display/pieces'
import { SCREEN_MAX_ACTIVE_PIECES, SCREEN_MAX_LIBRARY_BYTES } from '@/lib/display/constants'
import { screenPiecesContext, serializePiece, checkPieceLocation } from '@/lib/display/pieces-route'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const ctx = await screenPiecesContext(request, params)
  if ('error' in ctx) return ctx.error
  const filter: Record<string, unknown> = screenPiecesFilter(ctx.tenantId)
  if (ctx.scopedLocations) {
    filter.$or = [{ 'owner.locationId': null }, { 'owner.locationId': { $in: ctx.scopedLocations.map((id) => new mongoose.Types.ObjectId(id)) } }]
  }
  const docs = await AppStory.find(filter as never).sort({ sortOrder: 1, createdAt: -1 }).lean()
  const usage = await screenUsage(ctx.tenantId)
  return NextResponse.json({
    pieces: docs.map(serializePiece),
    usage: { ...usage, maxActive: SCREEN_MAX_ACTIVE_PIECES, maxBytes: SCREEN_MAX_LIBRARY_BYTES },
  })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    return await createPiece(request, params)
  } catch (e) {
    console.error('[screen-pieces POST]', (e as Error)?.message)
    return NextResponse.json({ error: 'No se pudo guardar la pieza. Probá de nuevo.' }, { status: 500 })
  }
}

async function createPiece(request: NextRequest, params: Promise<{ tenant: string }>) {
  const ctx = await screenPiecesContext(request, params)
  if ('error' in ctx) return ctx.error
  const parsed = createPieceSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  const b = parsed.data

  if (!mediaBelongsToTenant(b.media, ctx.tenantId)) return NextResponse.json({ error: 'El archivo no corresponde a este comercio. Subilo de nuevo.' }, { status: 400 })
  const sched = scheduleError(b.startsAt, b.endsAt)
  if (sched) return NextResponse.json({ error: sched }, { status: 400 })
  const locErr = await checkPieceLocation(request, ctx, b.locationId ?? null)
  if (locErr) return locErr

  const usage = await screenUsage(ctx.tenantId)
  const active = b.isActive !== false
  if (active && usage.active >= SCREEN_MAX_ACTIVE_PIECES) return NextResponse.json({ error: `Ya tenés ${usage.active} piezas activas (máximo ${SCREEN_MAX_ACTIVE_PIECES}). Pausá alguna.` }, { status: 409 })
  if (usage.bytes + b.media.bytes > SCREEN_MAX_LIBRARY_BYTES) return NextResponse.json({ error: 'La biblioteca de pantallas superaría 1,5 GB. Borrá piezas que no uses.' }, { status: 409 })

  const doc = await AppStory.create({
    title: b.title,
    type: 'promotion',
    surfaces: ['screen'],
    owner: { kind: 'tenant', tenantId: new mongoose.Types.ObjectId(ctx.tenantId), locationId: b.locationId ? new mongoose.Types.ObjectId(b.locationId) : null },
    ...pieceMediaFields(b.media, b.displayDurationMs),
    scheduledStart: b.startsAt ? new Date(b.startsAt) : null,
    scheduledEnd: b.endsAt ? new Date(b.endsAt) : null,
    daypart: b.daypart ?? null,
    isActive: active,
    sortOrder: b.sortOrder ?? 0,
  })
  await markSaved([b.media.url])
  logAudit({ tenantId: ctx.tenantId, action: 'screen_piece.created', entity: 'appStory', details: { pieceId: String(doc._id), title: doc.title, kind: b.media.kind }, request })
  return NextResponse.json({ piece: serializePiece(doc.toObject()) }, { status: 201 })
}
