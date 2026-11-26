// ============================================================================
// Estadísticas de pantalla — validación de valores imposibles e ingreso
// ============================================================================
// Lote cada ~15 min: { batchId, windowStart, windowEnd, items: [{ pieceId,
// plays, playMs, errors }] }. Se descarta ENTERO si:
//  · la ventana dura más de 1 h, está en el futuro o es de hace más de 48 h;
//  · la suma de playMs supera 1,05 × la duración de la ventana;
//  · alguna pieza tiene más reproducciones que segundos en pantalla (+1);
//  · alguna pieza no es una pieza de pantalla del comercio del equipo (o de
//    otra sede).
// Lotes repetidos (mismo batchId del mismo equipo): se ignoran (PlacementSeen).
// Proof of play (Proximo_Nivel §5): el lote puede traer `proofs` (inicio y fin
// de cada vez que una pieza o un paso de secuencia estuvo en pantalla). Tienen
// que caer dentro de la ventana (con 2 min de tolerancia), durar como mucho
// 10 min y ser de piezas del lote; si no, se descarta el lote entero.
// Destino: PlacementDailyStat, superficie 'screen', día de Argentina del fin
// de la ventana, comercio y sede del EQUIPO (nunca del cliente).
// ============================================================================

import { createHash } from 'node:crypto'
import mongoose from 'mongoose'
import { z } from 'zod'
import AppStory from '@/models/AppStory'
import PlacementDailyStat from '@/models/PlacementDailyStat'
import PlacementSeen, { PLACEMENT_SEEN_TTL_MS } from '@/models/PlacementSeen'
import { dayInArgentina } from '@/lib/placements/ingest'
import { pepper } from '@/lib/display/auth'
import DisplayPlayLog, { PLAY_LOG_TTL_MS } from '@/models/DisplayPlayLog'

const OID = /^[a-f0-9]{24}$/i
export const MAX_WINDOW_MS = 60 * 60 * 1000
export const MAX_AGE_MS = 48 * 60 * 60 * 1000
export const FUTURE_TOLERANCE_MS = 2 * 60 * 1000

export const statsBatchSchema = z.object({
  batchId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  windowStart: z.string().datetime(),
  windowEnd: z.string().datetime(),
  items: z.array(z.object({
    pieceId: z.string().regex(OID),
    plays: z.number().int().min(0).max(100_000),
    playMs: z.number().int().min(0).max(MAX_WINDOW_MS * 2),
    errors: z.number().int().min(0).max(10_000),
  })).max(100),
  proofs: z.array(z.object({
    pieceId: z.string().regex(OID),
    step: z.number().int().min(0).max(9).nullable().default(null),
    startedAt: z.string().datetime(),
    endedAt: z.string().datetime(),
  })).max(400).default([]),
})
export type StatsBatch = z.infer<typeof statsBatchSchema>

/** null si el lote es físicamente posible; si no, el motivo. */
export function impossibleReason(b: StatsBatch, now = Date.now()): string | null {
  const start = Date.parse(b.windowStart)
  const end = Date.parse(b.windowEnd)
  const len = end - start
  if (!(len > 0)) return 'ventana vacía o invertida'
  if (len > MAX_WINDOW_MS) return 'ventana de más de 1 h'
  if (end > now + FUTURE_TOLERANCE_MS) return 'ventana en el futuro'
  if (start < now - MAX_AGE_MS) return 'ventana de hace más de 48 h'
  const totalMs = b.items.reduce((s, i) => s + i.playMs, 0)
  if (totalMs > len * 1.05) return 'más tiempo en pantalla que la duración de la ventana'
  for (const i of b.items) {
    if (i.plays > Math.floor(i.playMs / 1000) + 1) return `pieza ${i.pieceId}: más reproducciones que segundos en pantalla`
  }
  const ids = new Set(b.items.map((i) => i.pieceId))
  if (ids.size !== b.items.length) return 'pieza repetida en el lote'
  for (const pr of b.proofs ?? []) {
    const s0 = Date.parse(pr.startedAt)
    const e0 = Date.parse(pr.endedAt)
    if (!(e0 >= s0)) return 'reproducción con fin antes del inicio'
    if (e0 - s0 > 10 * 60 * 1000) return 'reproducción de más de 10 min'
    if (s0 < start - FUTURE_TOLERANCE_MS || e0 > end + FUTURE_TOLERANCE_MS) return 'reproducción fuera de la ventana'
    if (!ids.has(pr.pieceId)) return 'reproducción de una pieza que no está en el lote'
  }
  return null
}

export interface DeviceForStats { _id: unknown; tenantId: unknown; locationId: unknown }

export type IngestStatsResult = { ok: true; duplicate: boolean; accepted: number } | { ok: false; reason: string }

export async function ingestScreenStats(device: DeviceForStats, b: StatsBatch, now = Date.now()): Promise<IngestStatsResult> {
  const reason = impossibleReason(b, now)
  if (reason) return { ok: false, reason }

  const tenantId = new mongoose.Types.ObjectId(String(device.tenantId))
  const locationId = device.locationId ? new mongoose.Types.ObjectId(String(device.locationId)) : null
  const pieceIds = b.items.map((i) => new mongoose.Types.ObjectId(i.pieceId))
  if (pieceIds.length) {
    const valid = await AppStory.countDocuments({
      _id: { $in: pieceIds },
      surfaces: 'screen',
      'owner.kind': 'tenant',
      'owner.tenantId': tenantId,
      $or: [{ 'owner.locationId': null }, ...(locationId ? [{ 'owner.locationId': locationId }] : [])],
    })
    if (valid !== pieceIds.length) return { ok: false, reason: 'pieza que no es de esta pantalla' }
  }

  // Lote repetido del mismo equipo → se ignora (sin error, para que no reintente).
  const key = createHash('sha256').update(`${pepper()}|screen-batch|${String(device._id)}|${b.batchId}`).digest('hex')
  const seen = await PlacementSeen.updateOne({ _id: key }, { $setOnInsert: { expiresAt: new Date(now + PLACEMENT_SEEN_TTL_MS) } }, { upsert: true })
  if (!seen.upsertedCount) return { ok: true, duplicate: true, accepted: 0 }

  const day = dayInArgentina(new Date(Date.parse(b.windowEnd)))
  const ops = b.items.filter((i) => i.plays || i.playMs || i.errors).map((i) => ({
    updateOne: {
      filter: { day, placement: 'screen', kind: 'app_story', pieceId: new mongoose.Types.ObjectId(i.pieceId), tenantId, locationId },
      update: { $inc: { 'c.plays': i.plays, 'c.playMs': i.playMs, 'c.errors': i.errors } },
      upsert: true,
    },
  }))
  if (ops.length) await PlacementDailyStat.bulkWrite(ops as never, { ordered: false })
  const proofs = b.proofs ?? []
  if (proofs.length) {
    const expiresAt = new Date(now + PLAY_LOG_TTL_MS)
    await DisplayPlayLog.insertMany(proofs.map((pr) => ({
      deviceId: new mongoose.Types.ObjectId(String(device._id)), tenantId, locationId,
      pieceId: new mongoose.Types.ObjectId(pr.pieceId), step: pr.step ?? null,
      startedAt: new Date(pr.startedAt), endedAt: new Date(pr.endedAt), expiresAt,
    })), { ordered: false })
  }
  return { ok: true, duplicate: false, accepted: ops.length }
}
