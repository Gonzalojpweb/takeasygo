// ============================================================================
// Ingreso de métricas de piezas (stories y promociones) — 20/11/2026
// ============================================================================
// Recibe un lote anónimo del navegador, valida cada evento contra la base y
// suma contadores diarios en PlacementDailyStat. Lo que no cumple se descarta
// en silencio (no se le da información a quien manda basura).
//
// Aislamiento: el comercio de cada contador lo decide el SERVIDOR.
//  · Menú: el comercio del slug; la promo tiene que ser de ese comercio o una
//    global dirigida a él; la sede tiene que ser de ese comercio.
//  · Descubrí: el dueño de la promo (global → null = plataforma); el slug que
//    mande el cliente se ignora.
// Privacidad: la sesión solo se usa para el hash de PlacementSeen.
// ============================================================================

import { createHash } from 'node:crypto'
import mongoose from 'mongoose'
import { z } from 'zod'
import AppStory from '@/models/AppStory'
import Promotion from '@/models/Promotion'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import PlacementDailyStat, {
  PLACEMENTS, PIECE_KINDS, TAP_ACTIONS, EXIT_REASONS, STORY_PLACEMENTS, MENU_PLACEMENTS,
  type Placement, type PieceKind,
} from '@/models/PlacementDailyStat'
import PlacementSeen, { PLACEMENT_SEEN_TTL_MS } from '@/models/PlacementSeen'
import { effectiveOwner, effectiveSurfaces } from '@/lib/app-story-owner'

export const PLACEMENT_EVENT_TYPES = ['impression', 'entry_open', 'story_view', 'story_complete', 'cta_tap', 'exit'] as const
export type PlacementEventType = (typeof PLACEMENT_EVENT_TYPES)[number]

export const MAX_BATCH = 20

const OID = /^[a-f0-9]{24}$/i

export const placementEventSchema = z.object({
  type: z.enum(PLACEMENT_EVENT_TYPES),
  placement: z.enum(PLACEMENTS),
  kind: z.enum(PIECE_KINDS),
  pieceId: z.string().regex(OID).nullish(),
  tenantSlug: z.string().regex(/^[a-z0-9-]{1,80}$/).nullish(),
  locationId: z.string().regex(OID).nullish(),
  action: z.enum(TAP_ACTIONS).nullish(),
  reason: z.enum(EXIT_REASONS).nullish(),
  index: z.number().int().min(0).max(99).nullish(),
})
export type PlacementEventInput = z.infer<typeof placementEventSchema>

export const placementBatchSchema = z.object({
  sid: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  events: z.array(placementEventSchema).min(1).max(MAX_BATCH),
})

/** Día calendario en Argentina ('YYYY-MM-DD'). */
export function dayInArgentina(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(date)
}

function pepper(): string {
  return process.env.PLACEMENT_DEDUP_PEPPER || process.env.NEXTAUTH_SECRET || 'tgo-placements'
}

export function dedupKey(sid: string, pieceId: string, placement: string, event: string, day: string): string {
  return createHash('sha256').update(`${pepper()}|${sid}|${pieceId}|${placement}|${event}|${day}`).digest('hex')
}

/** ¿El tipo de evento tiene sentido en esa superficie y tipo de pieza? */
export function isCoherent(e: PlacementEventInput): boolean {
  const story = STORY_PLACEMENTS.includes(e.placement)
  if (e.kind === 'entry') {
    // El círculo de stories en sí: solo se ve y se toca, sin pieza.
    return story && !e.pieceId && (e.type === 'impression' || e.type === 'entry_open')
  }
  if (!e.pieceId) return false
  if (e.kind === 'app_story' && !['menu_story', 'app_story', 'home_banner'].includes(e.placement)) return false
  if (e.kind === 'promotion' && !['menu_promo_card', 'menu_promo_story', 'explore_promo_card'].includes(e.placement)) return false
  switch (e.type) {
    case 'impression': return !story || e.placement === 'home_banner'
    case 'story_view':
    case 'story_complete':
    case 'exit': return story
    case 'cta_tap': return true
    default: return false
  }
}

type Resolved = { kind: PieceKind; placement: Placement; pieceId: string | null; tenantId: string | null; locationId: string | null }

interface Lookups {
  tenantsBySlug: Map<string, string>
  /** Dueño y superficies efectivos de cada story (CP2). */
  stories: Map<string, { ownerTenantId: string | null; ownerLocationId: string | null; surfaces: string[] }>
  promos: Map<string, { scope: string; tenantId: string | null; targetTenants: string[] }>
  locations: Map<string, string> // locationId → tenantId
}

async function loadLookups(events: PlacementEventInput[]): Promise<Lookups> {
  const slugs = [...new Set(events.map((e) => e.tenantSlug).filter(Boolean) as string[])]
  const storyIds = [...new Set(events.filter((e) => e.kind === 'app_story' && e.pieceId).map((e) => e.pieceId!))]
  const promoIds = [...new Set(events.filter((e) => e.kind === 'promotion' && e.pieceId).map((e) => e.pieceId!))]
  const locIds = [...new Set(events.map((e) => e.locationId).filter(Boolean) as string[])]

  const [tenants, stories, promos, locs] = await Promise.all([
    slugs.length ? Tenant.find({ slug: { $in: slugs }, isActive: true }).select('_id slug').lean<Array<{ _id: unknown; slug: string }>>() : [],
    storyIds.length ? AppStory.find({ _id: { $in: storyIds } }).select('_id owner surfaces').lean<Array<{ _id: unknown; owner?: any; surfaces?: string[] }>>() : [],
    promoIds.length ? Promotion.find({ _id: { $in: promoIds } }).select('_id scope tenantId targetTenants').lean<Array<{ _id: unknown; scope?: string; tenantId?: unknown; targetTenants?: unknown[] }>>() : [],
    locIds.length ? Location.find({ _id: { $in: locIds } }).select('_id tenantId').lean<Array<{ _id: unknown; tenantId: unknown }>>() : [],
  ])
  return {
    tenantsBySlug: new Map<string, string>(tenants.map((t) => [t.slug, String(t._id)] as [string, string])),
    stories: new Map(stories.map((s) => {
      const o = effectiveOwner(s)
      return [String(s._id), { ownerTenantId: o.tenantId, ownerLocationId: o.locationId, surfaces: effectiveSurfaces(s) }] as [string, { ownerTenantId: string | null; ownerLocationId: string | null; surfaces: string[] }]
    })),
    promos: new Map(promos.map((p) => [String(p._id), {
      scope: p.scope ?? 'tenant',
      tenantId: p.tenantId ? String(p.tenantId) : null,
      targetTenants: (p.targetTenants ?? []).map(String),
    }] as [string, Lookups['promos'] extends Map<string, infer V> ? V : never])),
    locations: new Map<string, string>(locs.map((l) => [String(l._id), String(l.tenantId)] as [string, string])),
  }
}

/** Decide comercio y sede del contador, o null si el evento no es válido. */
export function resolveEvent(e: PlacementEventInput, lk: Lookups): Resolved | null {
  if (!isCoherent(e)) return null
  const inMenu = MENU_PLACEMENTS.includes(e.placement)

  let ctxTenant: string | null = null
  if (inMenu) {
    if (!e.tenantSlug) return null
    ctxTenant = lk.tenantsBySlug.get(e.tenantSlug) ?? null
    if (!ctxTenant) return null
  }

  let locationId: string | null = null
  if (e.locationId) {
    if (!inMenu) return null
    if (lk.locations.get(e.locationId) !== ctxTenant) return null
    locationId = e.locationId
  }

  if (e.kind === 'entry') {
    return { kind: 'entry', placement: e.placement, pieceId: null, tenantId: ctxTenant, locationId }
  }

  if (e.kind === 'app_story') {
    const st = lk.stories.get(e.pieceId!)
    if (!st) return null
    // La story tiene que estar publicada en esa superficie.
    if (!st.surfaces.includes(e.placement)) return null
    if (inMenu) {
      // Story de un comercio: solo cuenta en el menú de ese comercio (y de su sede, si tiene).
      if (st.ownerTenantId && st.ownerTenantId !== ctxTenant) return null
      if (st.ownerLocationId && locationId && st.ownerLocationId !== locationId) return null
      return { kind: 'app_story', placement: e.placement, pieceId: e.pieceId!, tenantId: ctxTenant, locationId }
    }
    // App / banner del inicio: el comercio es el dueño de la story (plataforma → null).
    return { kind: 'app_story', placement: e.placement, pieceId: e.pieceId!, tenantId: st.ownerTenantId, locationId: null }
  }

  const promo = lk.promos.get(e.pieceId!)
  if (!promo) return null
  if (inMenu) {
    const belongs = promo.scope === 'global'
      ? promo.targetTenants.length === 0 || promo.targetTenants.includes(ctxTenant!)
      : promo.tenantId === ctxTenant
    if (!belongs) return null
    return { kind: 'promotion', placement: e.placement, pieceId: e.pieceId!, tenantId: ctxTenant, locationId }
  }
  // Descubrí: el comercio sale de la promo, nunca del cliente.
  return { kind: 'promotion', placement: e.placement, pieceId: e.pieceId!, tenantId: promo.scope === 'global' ? null : promo.tenantId, locationId: null }
}

const UNIQUE_EVENTS = new Set<PlacementEventType>(['impression', 'story_view', 'story_complete', 'cta_tap'])

export interface IngestResult { accepted: number; rejected: number }

export async function ingestPlacementEvents(sid: string, events: PlacementEventInput[], now = new Date()): Promise<IngestResult> {
  const day = dayInArgentina(now)
  const lk = await loadLookups(events)

  const resolved: Array<{ e: PlacementEventInput; r: Resolved; key: string | null }> = []
  for (const e of events) {
    const r = resolveEvent(e, lk)
    if (!r) continue
    const key = UNIQUE_EVENTS.has(e.type) ? dedupKey(sid, r.pieceId ?? 'entry', r.placement, e.type, day) : null
    resolved.push({ e, r, key })
  }
  if (resolved.length === 0) return { accepted: 0, rejected: events.length }

  // Claves nuevas (primera vez en el día para esa sesión): upsert de PlacementSeen.
  const keys = [...new Set(resolved.map((x) => x.key).filter(Boolean) as string[])]
  const fresh = new Set<string>()
  if (keys.length) {
    const expiresAt = new Date(now.getTime() + PLACEMENT_SEEN_TTL_MS)
    const res = await PlacementSeen.bulkWrite(
      keys.map((k) => ({ updateOne: { filter: { _id: k }, update: { $setOnInsert: { expiresAt } }, upsert: true } })),
      { ordered: false },
    )
    for (const idx of Object.keys(res.upsertedIds ?? {})) fresh.add(keys[Number(idx)])
  }

  const seenInBatch = new Set<string>()
  const ops = resolved.flatMap(({ e, r, key }) => {
    const isNew = key ? fresh.has(key) && !seenInBatch.has(key) : false
    if (key && isNew) seenInBatch.add(key)
    const inc: Record<string, number> = {}
    switch (e.type) {
      case 'impression':
        inc['c.impressions'] = 1
        if (isNew) inc['c.impressionsUnique'] = 1
        break
      case 'entry_open':
        inc['c.opens'] = 1
        break
      case 'story_view':
        if (isNew) inc['c.views'] = 1
        break
      case 'story_complete':
        if (isNew) inc['c.completes'] = 1
        break
      case 'cta_tap':
        inc['c.ctaTaps'] = 1
        if (isNew) inc['c.ctaTapsUnique'] = 1
        if (e.action) inc[`c.taps.${e.action}`] = 1
        break
      case 'exit':
        if (e.reason) inc[`c.exits.${e.reason}`] = 1
        if (typeof e.index === 'number') inc[`c.exitsAt.${e.index}`] = 1
        break
    }
    if (Object.keys(inc).length === 0) return []
    const oid = (v: string | null) => (v ? new mongoose.Types.ObjectId(v) : null)
    return [{
      updateOne: {
        filter: { day, placement: r.placement, kind: r.kind, pieceId: oid(r.pieceId), tenantId: oid(r.tenantId), locationId: oid(r.locationId) },
        update: { $inc: inc },
        upsert: true,
      },
    }]
  })
  if (ops.length) {
    try {
      await PlacementDailyStat.bulkWrite(ops, { ordered: true })
    } catch (err) {
      // Dos pedidos creando el mismo contador a la vez (índice único): el
      // segundo reintenta una vez y ya encuentra el documento.
      // Con ordered:true lo anterior al error ya se aplicó: se reintenta desde ahí.
      const e = err as { code?: number; writeErrors?: Array<{ index: number; code?: number }> }
      const first = e.writeErrors?.[0]
      if ((first?.code ?? e.code) !== 11000) throw err
      await PlacementDailyStat.bulkWrite(ops.slice(first?.index ?? 0), { ordered: true })
    }
  }
  return { accepted: resolved.length, rejected: events.length - resolved.length }
}
