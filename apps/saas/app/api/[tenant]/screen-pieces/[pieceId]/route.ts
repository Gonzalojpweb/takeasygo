/**
 * PATCH  /api/[tenant]/screen-pieces/[pieceId] — editar (nombre, archivo, sede, fechas, franja, activa, orden).
 * DELETE /api/[tenant]/screen-pieces/[pieceId] — borrar la pieza y su archivo de la cuenta ads.
 *
 * Solo piezas de pantalla de ESTE comercio; un usuario de sede solo las de sus sedes.
 */
import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import AppStory from '@/models/AppStory'
import { logAudit } from '@/lib/audit'
import { markSaved, cloudinaryAdsApi, adsAssetFromUrl } from '@/lib/media/ads'
import { screenPiecesFilter, screenUsage } from '@/lib/display/quota'
import { updatePieceSchema, mediaBelongsToTenant, pieceMediaFields, scheduleError } from '@/lib/display/pieces'
import { SCREEN_MAX_ACTIVE_PIECES, SCREEN_MAX_LIBRARY_BYTES } from '@/lib/display/constants'
import { screenPiecesContext, serializePiece, checkPieceLocation, type PiecesContext } from '@/lib/display/pieces-route'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ tenant: string; pieceId: string }> }

async function load(request: NextRequest, ctx: Ctx) {
  const { tenant, pieceId } = await ctx.params
  const c = await screenPiecesContext(request, Promise.resolve({ tenant }))
  if ('error' in c) return c
  if (!mongoose.Types.ObjectId.isValid(pieceId)) return { error: NextResponse.json({ error: 'Pieza no encontrada' }, { status: 404 }) }
  const piece = await AppStory.findOne({ _id: pieceId, ...screenPiecesFilter(c.tenantId) })
  if (!piece) return { error: NextResponse.json({ error: 'Pieza no encontrada' }, { status: 404 }) }
  const locId = piece.owner?.locationId ? String(piece.owner.locationId) : null
  if (c.scopedLocations && (!locId || !c.scopedLocations.includes(locId))) {
    return { error: NextResponse.json({ error: 'Pieza no encontrada' }, { status: 404 }) }
  }
  return { c: c as PiecesContext, piece }
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const r = await load(request, ctx)
  if ('error' in r) return r.error
  const parsed = updatePieceSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  const b = parsed.data
  const { piece, c } = r

  const startsAt = b.startsAt !== undefined ? b.startsAt : piece.scheduledStart?.toISOString() ?? null
  const endsAt = b.endsAt !== undefined ? b.endsAt : piece.scheduledEnd?.toISOString() ?? null
  const sched = scheduleError(startsAt, endsAt)
  if (sched) return NextResponse.json({ error: sched }, { status: 400 })
  if (b.locationId !== undefined) {
    const locErr = await checkPieceLocation(request, c, b.locationId)
    if (locErr) return locErr
  }

  const usage = await screenUsage(c.tenantId)
  const willBeActive = b.isActive ?? piece.isActive
  const wasCountedActive = piece.isActive && (!piece.scheduledEnd || piece.scheduledEnd > new Date())
  if (willBeActive && !wasCountedActive && usage.active >= SCREEN_MAX_ACTIVE_PIECES) {
    return NextResponse.json({ error: `Ya tenés ${usage.active} piezas activas (máximo ${SCREEN_MAX_ACTIVE_PIECES}). Pausá alguna.` }, { status: 409 })
  }

  const oldUrl = piece.videoUrl || piece.imageUrl
  if (b.media) {
    if (!mediaBelongsToTenant(b.media, c.tenantId)) return NextResponse.json({ error: 'El archivo no corresponde a este comercio. Subilo de nuevo.' }, { status: 400 })
    if (usage.bytes - (piece.media?.bytes ?? 0) + b.media.bytes > SCREEN_MAX_LIBRARY_BYTES) return NextResponse.json({ error: 'La biblioteca de pantallas superaría 1,5 GB.' }, { status: 409 })
    Object.assign(piece, pieceMediaFields(b.media, b.displayDurationMs ?? piece.displayDurationMs))
  } else if (b.displayDurationMs !== undefined && !piece.videoUrl) {
    piece.displayDurationMs = b.displayDurationMs
  }
  if (b.title !== undefined) piece.title = b.title
  if (b.locationId !== undefined) piece.set('owner.locationId', b.locationId ? new mongoose.Types.ObjectId(b.locationId) : null)
  if (b.startsAt !== undefined) piece.scheduledStart = b.startsAt ? new Date(b.startsAt) : undefined
  if (b.endsAt !== undefined) piece.scheduledEnd = b.endsAt ? new Date(b.endsAt) : undefined
  if (b.daypart !== undefined) piece.set('daypart', b.daypart)
  if (b.isActive !== undefined) piece.isActive = b.isActive
  if (b.sortOrder !== undefined) piece.sortOrder = b.sortOrder
  await piece.save()

  if (b.media) {
    await markSaved([b.media.url])
    const newUrl = b.media.url
    if (oldUrl && oldUrl !== newUrl) await destroyAsset(oldUrl)
  }
  logAudit({ tenantId: c.tenantId, action: 'screen_piece.updated', entity: 'appStory', details: { pieceId: String(piece._id), fields: Object.keys(b) }, request })
  return NextResponse.json({ piece: serializePiece(piece.toObject()) })
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const r = await load(request, ctx)
  if ('error' in r) return r.error
  const { piece, c } = r
  const url = piece.videoUrl || piece.imageUrl
  await AppStory.deleteOne({ _id: piece._id })
  if (url) await destroyAsset(url)
  logAudit({ tenantId: c.tenantId, action: 'screen_piece.deleted', entity: 'appStory', details: { pieceId: String(piece._id), title: piece.title }, request })
  return NextResponse.json({ ok: true })
}

/** Borra el archivo de la cuenta ads (libera la biblioteca). Si falla, lo limpia el cron. */
async function destroyAsset(url: string) {
  const a = adsAssetFromUrl(url)
  if (!a) return
  await cloudinaryAdsApi().destroy(a.publicId, a.kind).catch((e) => console.error('[screen-pieces] no se pudo borrar el archivo:', (e as Error)?.message))
}
