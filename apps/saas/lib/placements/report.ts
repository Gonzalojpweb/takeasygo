// ============================================================================
// Reporte de métricas de marketing (CP4, 21/11/2026)
// ============================================================================
// Lee PlacementDailyStat (contadores diarios, sin datos personales) y arma:
//  · totales por superficie,
//  · una fila por pieza (story o promo) con sus tasas,
//  · el círculo de stories (cuántos lo ven y cuántos lo abren),
//  · en qué story se va la gente (salidas por posición),
//  · la serie diaria.
// «Alcance» es la suma de alcances diarios (sesiones únicas por día): una
// persona que vuelve otro día cuenta de nuevo. El panel lo aclara.
// ============================================================================

import mongoose from 'mongoose'
import PlacementDailyStat, { TAP_ACTIONS, EXIT_REASONS, type Placement, type PieceKind } from '@/models/PlacementDailyStat'
import AppStory from '@/models/AppStory'
import Promotion from '@/models/Promotion'
import Tenant from '@/models/Tenant'

export const PLACEMENT_LABELS: Record<Placement, string> = {
  menu_story: 'Stories TGO del menú',
  app_story: 'Stories de la app',
  home_banner: 'Banner del inicio',
  menu_promo_card: 'Tarjetas de promo del menú',
  menu_promo_story: 'Stories de promos del menú',
  explore_promo_card: 'Promos en Descubrí',
}

export interface Counters {
  impressions: number
  reach: number
  opens: number
  views: number
  completes: number
  taps: number
  tapsUnique: number
  tapsBy: Record<string, number>
  exitsBy: Record<string, number>
}

export interface PieceRow extends Counters {
  placement: Placement
  placementLabel: string
  kind: PieceKind
  pieceId: string | null
  name: string
  /** Story: completadas / vistas. */
  completionRate: number | null
  /** Story: toques / vistas. Tarjeta: toques únicos / alcance. */
  ctr: number | null
}

export interface MarketingReport {
  range: { from: string; to: string }
  totals: Counters & { completionRate: number | null; ctr: number | null }
  byPlacement: Array<Counters & { placement: Placement; placementLabel: string }>
  pieces: PieceRow[]
  entries: Array<{ placement: Placement; placementLabel: string; impressions: number; reach: number; opens: number; openRate: number | null }>
  dropOff: Array<{ placement: Placement; placementLabel: string; byIndex: Array<{ index: number; exits: number }> }>
  daily: Array<{ day: string; impressions: number; views: number; taps: number }>
}

export interface ReportFilter {
  from: string
  to: string
  tenantId?: string | null
  /** Filtro de sede ya resuelto (alcance del usuario). */
  locationFilter?: { locationId?: unknown }
  placement?: Placement | null
}

const empty = (): Counters => ({ impressions: 0, reach: 0, opens: 0, views: 0, completes: 0, taps: 0, tapsUnique: 0, tapsBy: {}, exitsBy: {} })
const rate = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null)

type RawGroup = {
  _id: { placement: Placement; kind: PieceKind; pieceId: mongoose.Types.ObjectId | null }
  impressions: number; reach: number; opens: number; views: number; completes: number; taps: number; tapsUnique: number
} & Record<string, unknown>

export async function buildMarketingReport(f: ReportFilter): Promise<MarketingReport> {
  const match: Record<string, unknown> = { day: { $gte: f.from, $lte: f.to }, ...(f.locationFilter ?? {}) }
  if (f.tenantId) match.tenantId = new mongoose.Types.ObjectId(f.tenantId)
  if (f.placement) match.placement = f.placement

  const tapFields = Object.fromEntries(TAP_ACTIONS.map((a) => [`tap_${a}`, { $sum: { $ifNull: [`$c.taps.${a}`, 0] } }]))
  const exitFields = Object.fromEntries(EXIT_REASONS.map((r) => [`exit_${r}`, { $sum: { $ifNull: [`$c.exits.${r}`, 0] } }]))
  const sum = (path: string) => ({ $sum: { $ifNull: [`$c.${path}`, 0] } })

  const [groups, daily, exitsAt] = await Promise.all([
    PlacementDailyStat.aggregate<RawGroup>([
      { $match: match },
      { $group: {
        _id: { placement: '$placement', kind: '$kind', pieceId: '$pieceId' },
        impressions: sum('impressions'), reach: sum('impressionsUnique'), opens: sum('opens'),
        views: sum('views'), completes: sum('completes'), taps: sum('ctaTaps'), tapsUnique: sum('ctaTapsUnique'),
        ...tapFields, ...exitFields,
      } },
    ]),
    PlacementDailyStat.aggregate<{ _id: string; impressions: number; views: number; taps: number }>([
      { $match: match },
      { $group: { _id: '$day', impressions: sum('impressions'), views: sum('views'), taps: sum('ctaTaps') } },
      { $sort: { _id: 1 } },
    ]),
    PlacementDailyStat.aggregate<{ _id: { placement: Placement; index: string }; exits: number }>([
      { $match: { ...match, 'c.exitsAt': { $exists: true } } },
      { $project: { placement: 1, e: { $objectToArray: '$c.exitsAt' } } },
      { $unwind: '$e' },
      { $group: { _id: { placement: '$placement', index: '$e.k' }, exits: { $sum: '$e.v' } } },
    ]),
  ])

  // Nombres de las piezas (stories y promos) — solo título, nada personal.
  const storyIds = groups.filter((g) => g._id.kind === 'app_story' && g._id.pieceId).map((g) => g._id.pieceId!)
  const promoIds = groups.filter((g) => g._id.kind === 'promotion' && g._id.pieceId).map((g) => g._id.pieceId!)
  const [stories, promos] = await Promise.all([
    storyIds.length ? AppStory.find({ _id: { $in: storyIds } }).select('title').lean<Array<{ _id: unknown; title: string }>>() : [],
    promoIds.length ? Promotion.find({ _id: { $in: promoIds } }).select('title').lean<Array<{ _id: unknown; title: string }>>() : [],
  ])
  const names = new Map<string, string>([...stories, ...promos].map((d) => [String(d._id), d.title]))

  const toCounters = (g: RawGroup): Counters => ({
    impressions: g.impressions, reach: g.reach, opens: g.opens, views: g.views, completes: g.completes,
    taps: g.taps, tapsUnique: g.tapsUnique,
    tapsBy: Object.fromEntries(TAP_ACTIONS.map((a) => [a, Number(g[`tap_${a}`]) || 0]).filter(([, v]) => (v as number) > 0)),
    exitsBy: Object.fromEntries(EXIT_REASONS.map((r) => [r, Number(g[`exit_${r}`]) || 0]).filter(([, v]) => (v as number) > 0)),
  })
  const add = (a: Counters, b: Counters) => {
    for (const k of ['impressions', 'reach', 'opens', 'views', 'completes', 'taps', 'tapsUnique'] as const) a[k] += b[k]
    for (const [k, v] of Object.entries(b.tapsBy)) a.tapsBy[k] = (a.tapsBy[k] ?? 0) + v
    for (const [k, v] of Object.entries(b.exitsBy)) a.exitsBy[k] = (a.exitsBy[k] ?? 0) + v
  }

  const totals = empty()
  const byPlacementMap = new Map<Placement, Counters>()
  const pieces: PieceRow[] = []
  const entries: MarketingReport['entries'] = []

  for (const g of groups) {
    const c = toCounters(g)
    const placement = g._id.placement
    if (!byPlacementMap.has(placement)) byPlacementMap.set(placement, empty())
    add(byPlacementMap.get(placement)!, c)
    if (g._id.kind === 'entry') {
      entries.push({ placement, placementLabel: PLACEMENT_LABELS[placement], impressions: c.impressions, reach: c.reach, opens: c.opens, openRate: rate(c.opens, c.reach) })
      continue
    }
    add(totals, c)
    const isStory = c.views > 0 || placement === 'menu_story' || placement === 'app_story' || placement === 'menu_promo_story'
    const pid = g._id.pieceId ? String(g._id.pieceId) : null
    pieces.push({
      ...c, placement, placementLabel: PLACEMENT_LABELS[placement], kind: g._id.kind, pieceId: pid,
      name: (pid && names.get(pid)) || (g._id.kind === 'app_story' ? 'Story eliminada' : 'Promo eliminada'),
      completionRate: isStory ? rate(c.completes, c.views) : null,
      ctr: isStory ? rate(c.taps, c.views) : rate(c.tapsUnique, c.reach),
    })
  }
  pieces.sort((a, b) => (b.views + b.impressions) - (a.views + a.impressions))

  const dropMap = new Map<Placement, Array<{ index: number; exits: number }>>()
  for (const e of exitsAt) {
    const list = dropMap.get(e._id.placement) ?? []
    list.push({ index: Number(e._id.index), exits: e.exits })
    dropMap.set(e._id.placement, list)
  }

  return {
    range: { from: f.from, to: f.to },
    totals: { ...totals, completionRate: rate(totals.completes, totals.views), ctr: null },
    byPlacement: [...byPlacementMap.entries()].map(([placement, c]) => ({ ...c, placement, placementLabel: PLACEMENT_LABELS[placement] })),
    pieces,
    entries,
    dropOff: [...dropMap.entries()].map(([placement, list]) => ({
      placement, placementLabel: PLACEMENT_LABELS[placement], byIndex: list.sort((a, b) => a.index - b.index),
    })),
    daily: daily.map((d) => ({ day: d._id, impressions: d.impressions, views: d.views, taps: d.taps })),
  }
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** Rango de fechas del pedido (por defecto, últimos 30 días en hora de Argentina; máximo 366). */
export function parseRange(sp: URLSearchParams, today: string): { from: string; to: string } | null {
  const to = sp.get('to') && DAY.test(sp.get('to')!) ? sp.get('to')! : today
  const fallbackFrom = new Date(new Date(`${to}T12:00:00Z`).getTime() - 29 * 86_400_000).toISOString().slice(0, 10)
  const from = sp.get('from') && DAY.test(sp.get('from')!) ? sp.get('from')! : fallbackFrom
  if (from > to) return null
  const days = (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000
  if (days > 366) return null
  return { from, to }
}

export async function tenantNameOf(tenantId: string): Promise<string | null> {
  const t = await Tenant.findById(tenantId).select('name').lean<{ name?: string }>()
  return t?.name ?? null
}
