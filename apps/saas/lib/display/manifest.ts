// ============================================================================
// Manifiesto de una pantalla (21/11/2026)
// ============================================================================
// Qué recibe una pantalla: SOLO piezas de pantalla de SU comercio
// (surfaces 'screen', owner.kind 'tenant', owner.tenantId del equipo), de
// todas las sedes o de la sede del equipo, activas, no vencidas y de la
// orientación del equipo. Incluye las que empiezan en los próximos 7 días
// para que, sin internet, la pantalla las active a su hora. Las stories del
// menú y las piezas de TakeasyGO nunca entran.
//
// ETag: hash de lo que se entrega + configuración del equipo (no cambia con
// cada latido). Con If-None-Match igual → 304.
// ============================================================================

import { createHash } from 'node:crypto'
import mongoose from 'mongoose'
import AppStory from '@/models/AppStory'
import Menu from '@/models/Menu'
import Tenant from '@/models/Tenant'
import type { DisplayOrientation } from '@/models/DisplayDevice'
import { screenUrls } from '@/lib/media/ads'
import { SCREEN_IMAGE_DEFAULT_MS } from '@/lib/display/constants'
import { buildMenuBoard, boardAssets, boardHash, estimateBoardMs, parseMenuConfig, buildPromoBoard, parsePromosConfig, promoAssets, type MenuBoard, type PromoBoard } from '@/lib/display/templates'
import Promotion from '@/models/Promotion'
import { buildFeaturedBoard, featuredAssets, sellableCombos, topItemIds, type FeaturedBoard } from '@/lib/display/featured'
import { parseFeaturedConfig } from '@/lib/display/templates'
import Location from '@/models/Location'
import { effectiveScheduleWindow, SCHEDULE_QUERY_SLACK_MS } from '@/lib/promo-schedule'

export const LOOKAHEAD_MS = 7 * 24 * 60 * 60 * 1000

export interface ManifestItem {
  id: string
  /** 'template' = pieza automática (carta…): sin archivo propio, datos en `template`. */
  kind: 'image' | 'video' | 'template'
  url1080: string
  url720: string
  posterUrl: string | null
  durationMs: number
  startsAt: string | null
  endsAt: string | null
  updatedAt: string
  bytes: number | null
  daypart: { days?: number[]; from?: string | null; to?: string | null } | null
  /** Solo plantillas: datos para dibujarla y archivos (fotos, logo) a guardar. */
  template?: MenuBoard | PromoBoard | FeaturedBoard
  assets?: string[]
}

export interface DeviceLike {
  tenantId: unknown
  locationId: unknown
  orientation: DisplayOrientation
  name: string
}

type PieceDoc = {
  _id: unknown; imageUrl?: string; videoUrl?: string; videoPosterUrl?: string; videoDurationMs?: number | null
  displayDurationMs?: number | null; scheduledStart?: Date | null; scheduledEnd?: Date | null; updatedAt: Date
  daypart?: { days?: number[]; from?: string | null; to?: string | null } | null
  media?: { publicId?: string; bytes?: number; orientation?: string } | null
  screenTemplate?: { kind: string; config?: unknown } | null
}

export function manifestQuery(device: DeviceLike, now = new Date()) {
  return {
    surfaces: 'screen',
    'owner.kind': 'tenant',
    'owner.tenantId': new mongoose.Types.ObjectId(String(device.tenantId)),
    isActive: true,
    $and: [
      { $or: [{ 'owner.locationId': null }, { 'owner.locationId': new mongoose.Types.ObjectId(String(device.locationId)) }] },
      { $or: [{ scheduledEnd: null }, { scheduledEnd: { $gt: now } }] },
      { $or: [{ scheduledStart: null }, { scheduledStart: { $lte: new Date(now.getTime() + LOOKAHEAD_MS) } }] },
      { $or: [{ 'media.orientation': device.orientation }, { 'media.orientation': { $exists: false } }, { media: null }] },
    ],
  }
}

/** Fotos de la carta por página según la orientación (la pantalla usa los mismos números). */
export const BOARD_PER_PAGE = { landscape: 8, portrait: 6 } as const

export interface TemplateCtx {
  menu: Record<string, any> | null
  tenant: Record<string, any> | null
  promos: Record<string, any>[]
  ranking: string[]
  combos: Record<string, any>[]
  timezone: string
  orientation: DisplayOrientation
}

/** Mayor % de una promo de descuento (para el cartel «hasta X% off»). */
function maxDiscountPercent(p: Record<string, any>): number | null {
  const targets: Array<{ percent?: number }> = Array.isArray(p.discountTargets) ? p.discountTargets : []
  const max = targets.reduce((m, t) => Math.max(m, Number(t?.percent) || 0), 0)
  return max > 0 ? Math.round(max) : null
}

/** Pieza automática → ítem del manifiesto (datos resueltos con la sede del equipo). */
export function toTemplateItem(p: PieceDoc, ctx: TemplateCtx): ManifestItem | null {
  if (!ctx.tenant) return null
  let board: MenuBoard | PromoBoard | FeaturedBoard
  let assets: string[]
  let durationMs: number
  if (p.screenTemplate?.kind === 'menu') {
    const b = buildMenuBoard(ctx.menu, ctx.tenant, parseMenuConfig(p.screenTemplate.config))
    if (!b.sections.length) return null
    board = b; assets = boardAssets(b); durationMs = estimateBoardMs(b, BOARD_PER_PAGE[ctx.orientation])
  } else if (p.screenTemplate?.kind === 'promos') {
    const b = buildPromoBoard(ctx.promos, ctx.tenant, parsePromosConfig(p.screenTemplate.config), (s, e) => effectiveScheduleWindow(s as Date, e as Date, ctx.timezone), maxDiscountPercent)
    if (!b.promos.length) return null
    board = b; assets = promoAssets(b); durationMs = Math.min(b.promos.length, b.maxItems) * b.pageMs
  } else if (p.screenTemplate?.kind === 'featured') {
    const b = buildFeaturedBoard(ctx.menu, ctx.tenant, parseFeaturedConfig(p.screenTemplate.config), ctx.ranking, ctx.combos)
    if (!b.products.length && !b.combos.length) return null
    board = b; assets = featuredAssets(b); durationMs = (b.combos.length ? 2 : 1) * b.pageMs
  } else {
    return null
  }
  return {
    id: String(p._id),
    kind: 'template',
    url1080: '',
    url720: '',
    posterUrl: null,
    durationMs,
    startsAt: p.scheduledStart ? new Date(p.scheduledStart).toISOString() : null,
    endsAt: p.scheduledEnd ? new Date(p.scheduledEnd).toISOString() : null,
    updatedAt: new Date(p.updatedAt).toISOString(),
    bytes: null,
    daypart: p.daypart && (p.daypart.days?.length || (p.daypart.from && p.daypart.to))
      ? { days: p.daypart.days ?? [], from: p.daypart.from ?? null, to: p.daypart.to ?? null }
      : null,
    template: board,
    assets,
  }
}

/** Pieza → ítem del manifiesto (URLs 1080p/720p desde el public_id). */
export function toManifestItem(p: PieceDoc): ManifestItem | null {
  const kind: 'image' | 'video' = p.videoUrl ? 'video' : 'image'
  const src = kind === 'video' ? p.videoUrl : p.imageUrl
  if (!src) return null
  let urls: { url: string; url720: string; posterUrl: string | null } = { url: src, url720: src, posterUrl: p.videoPosterUrl || null }
  if (p.media?.publicId) {
    try { urls = screenUrls(p.media.publicId, kind) } catch { /* sin credenciales: se usan las guardadas */ }
  }
  return {
    id: String(p._id),
    kind,
    url1080: urls.url,
    url720: urls.url720,
    posterUrl: urls.posterUrl,
    durationMs: kind === 'video' ? (p.videoDurationMs || 15_000) : (p.displayDurationMs || SCREEN_IMAGE_DEFAULT_MS),
    startsAt: p.scheduledStart ? new Date(p.scheduledStart).toISOString() : null,
    endsAt: p.scheduledEnd ? new Date(p.scheduledEnd).toISOString() : null,
    updatedAt: new Date(p.updatedAt).toISOString(),
    bytes: p.media?.bytes ?? null,
    daypart: p.daypart && (p.daypart.days?.length || (p.daypart.from && p.daypart.to))
      ? { days: p.daypart.days ?? [], from: p.daypart.from ?? null, to: p.daypart.to ?? null }
      : null,
  }
}

export function manifestEtag(items: ManifestItem[], device: DeviceLike): string {
  const h = createHash('sha1')
    .update(JSON.stringify({ o: device.orientation, l: String(device.locationId), n: device.name, i: items.map((x) => [x.id, x.updatedAt, x.startsAt, x.endsAt, x.daypart, x.template ? boardHash(x.template) : null]) }))
    .digest('hex')
    .slice(0, 24)
  return `W/"${h}"`
}

export async function buildManifest(device: DeviceLike, now = new Date()) {
  const docs = await AppStory.find(manifestQuery(device, now))
    .select('imageUrl videoUrl videoPosterUrl videoDurationMs displayDurationMs daypart scheduledStart scheduledEnd updatedAt media sortOrder createdAt screenTemplate')
    .sort({ sortOrder: 1, createdAt: 1 })
    .limit(50)
    .lean<PieceDoc[]>()
  // Plantillas: la carta de la sede del equipo y la marca del comercio, una sola vez.
  let tctx: TemplateCtx | null = null
  if (docs.some((d) => d.screenTemplate)) {
    const kinds = new Set(docs.map((d) => d.screenTemplate?.kind).filter(Boolean))
    const tenantId = new mongoose.Types.ObjectId(String(device.tenantId))
    const locationId = device.locationId ? new mongoose.Types.ObjectId(String(device.locationId)) : null
    const [menu, tenant, loc, promos] = await Promise.all([
      (kinds.has('menu') || kinds.has('featured')) && locationId
        ? Menu.findOne({ tenantId, locationId, isActive: true }).select('categories').lean<Record<string, any>>()
        : null,
      Tenant.findById(String(device.tenantId)).select('name branding.logoUrl branding.primaryColor branding.backgroundColor branding.textColor').lean<Record<string, any>>(),
      locationId ? Location.findById(locationId).select('timezone').lean<{ timezone?: string }>() : null,
      kinds.has('promos')
        ? Promotion.find({
          tenantId,
          scope: { $ne: 'global' },
          isActive: true,
          $and: [
            { $or: [{ locationId: null }, { locationId: { $exists: false } }, ...(locationId ? [{ locationId }] : [])] },
            { $or: [{ scheduledEnd: null }, { scheduledEnd: { $exists: false } }, { scheduledEnd: { $gte: new Date(now.getTime() - SCHEDULE_QUERY_SLACK_MS) } }] },
            { $or: [{ scheduledStart: null }, { scheduledStart: { $exists: false } }, { scheduledStart: { $lte: new Date(now.getTime() + LOOKAHEAD_MS) } }] },
          ],
        })
          .select('type title shortDescription description imageUrl price originalPrice scheduledStart scheduledEnd activeDays activeTimeStart activeTimeEnd channels maxRedemptions redemptionsCount discountTargets isActive sortOrder isFeatured')
          .sort({ isFeatured: -1, sortOrder: 1, createdAt: -1 })
          .limit(60)
          .lean<Record<string, any>[]>()
        : [],
    ])
    const timezone = loc?.timezone || 'America/Argentina/Buenos_Aires'
    const wantsFeatured = kinds.has('featured') && !!locationId
    const [ranking, combos] = wantsFeatured
      ? await Promise.all([topItemIds(tenantId, locationId), sellableCombos(tenantId, locationId, menu ?? null, timezone)])
      : [[], []]
    tctx = { menu: menu ?? null, tenant: tenant ?? null, promos, ranking, combos, timezone, orientation: device.orientation }
  }
  const items = docs
    .map((d) => (d.screenTemplate ? (tctx ? toTemplateItem(d, tctx) : null) : toManifestItem(d)))
    .filter((x): x is ManifestItem => x !== null)
  return { items, etag: manifestEtag(items, device) }
}
