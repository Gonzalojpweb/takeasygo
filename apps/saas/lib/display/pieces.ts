// ============================================================================
// Piezas de pantalla del comercio — validación (21/11/2026)
// ============================================================================
// Contenido propio del comercio para SUS pantallas: sin aprobación. Se guarda
// como AppStory con surfaces ['screen'] y owner del comercio (nunca story del
// menú, nunca de TakeasyGO). El archivo tiene que haberse subido por el flujo
// firmado a la carpeta de pantallas de ESTE comercio en la cuenta ads.
// ============================================================================

import { z } from 'zod'
import mongoose from 'mongoose'
import { adsAssetFromUrl, belongsTo } from '@/lib/media/ads'
import { orientationOf } from '@/lib/media/spec'
import { SCREEN_IMAGE_DEFAULT_MS, SCREEN_IMAGE_MAX_MS, SCREEN_IMAGE_MIN_MS } from '@/lib/display/constants'

const HM = /^([01]\d|2[0-3]):[0-5]\d$/
const OID = (v: string) => mongoose.Types.ObjectId.isValid(v)

export const daypartSchema = z.object({
  days: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  from: z.string().regex(HM).nullable().optional(),
  to: z.string().regex(HM).nullable().optional(),
}).refine((d) => (!d.from && !d.to) || (!!d.from && !!d.to), 'La franja necesita hora de inicio y de fin')

const mediaSchema = z.object({
  kind: z.enum(['image', 'video']),
  url: z.string().url().max(600),
  posterUrl: z.string().url().max(600).nullable().optional(),
  durationMs: z.number().int().min(0).max(120_000).nullable().optional(),
  publicId: z.string().min(1).max(200),
  width: z.number().int().min(1).max(20000),
  height: z.number().int().min(1).max(20000),
  bytes: z.number().int().min(0),
})

export const createPieceSchema = z.object({
  title: z.string().trim().min(1, 'Poné un nombre').max(80),
  media: mediaSchema,
  displayDurationMs: z.number().int().min(SCREEN_IMAGE_MIN_MS).max(SCREEN_IMAGE_MAX_MS).nullable().optional(),
  locationId: z.string().refine(OID, 'Sede inválida').nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  daypart: daypartSchema.nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
})

export const updatePieceSchema = createPieceSchema.partial()

export type CreatePieceInput = z.infer<typeof createPieceSchema>

/** El archivo es de la carpeta de pantallas de este comercio en la cuenta ads. */
export function mediaBelongsToTenant(media: { url: string; publicId: string }, tenantId: string): boolean {
  const asset = adsAssetFromUrl(media.url)
  if (!asset || asset.publicId !== media.publicId) return false
  return belongsTo(media.publicId, { kind: 'tenant', tenantId }, 'screen')
}

export function scheduleError(startsAt?: string | null, endsAt?: string | null): string | null {
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) return 'La fecha de fin tiene que ser posterior al inicio'
  return null
}

/** Campos de AppStory para una pieza de pantalla a partir del archivo verificado. */
export function pieceMediaFields(m: CreatePieceInput['media'], displayDurationMs?: number | null) {
  const orientation = orientationOf(m.width, m.height)
  const media = { publicId: m.publicId, width: m.width, height: m.height, bytes: m.bytes, orientation }
  if (m.kind === 'video') {
    const d = Math.min(Math.max(m.durationMs ?? 15_000, 5_000), 60_000)
    return { imageUrl: '', videoUrl: m.url, videoPosterUrl: m.posterUrl ?? '', videoDurationMs: d, displayDurationMs: null, media }
  }
  return { imageUrl: m.url, videoUrl: '', videoPosterUrl: '', videoDurationMs: null, displayDurationMs: displayDurationMs ?? SCREEN_IMAGE_DEFAULT_MS, media }
}
