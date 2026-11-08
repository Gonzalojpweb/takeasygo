/**
 * Tracción de la red: clics en los CTA de la sección TakeasyGO del menú de
 * cada comercio («Descargá la App» y «Sumá tu comercio») y altas de comercios
 * que llegaron desde ese menú (/empezar?origen=menu-<slug>).
 */
import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import CustomerEvent from '@/models/CustomerEvent'
import Tenant from '@/models/Tenant'

export const TRACTION_PERIODS = [7, 30, 90] as const
export type TractionPeriod = (typeof TRACTION_PERIODS)[number]

export interface TenantTraction {
  tenantId: string
  name: string
  slug: string
  appClicks: number
  appPeople: number
  registerClicks: number
  registerPeople: number
  /** Comercios que se registraron desde el menú de este comercio. */
  signups: number
  /** De esas altas, cuántas verificaron el email y completaron el alta. */
  signupsCompleted: number
  total: number
}

export interface NetworkTraction {
  days: TractionPeriod
  since: Date
  totals: { appClicks: number; appPeople: number; registerClicks: number; registerPeople: number; signups: number; signupsCompleted: number }
  rows: TenantTraction[]
}

/** origen = menu-<slug> (cortado a 40 caracteres en el enlace). */
export function slugFromOrigen(origen: string | null | undefined): string | null {
  if (!origen || !origen.startsWith('menu-')) return null
  return origen.slice(5) || null
}

/** Compara el slug del origen (que puede venir cortado) con el del comercio. */
export function origenMatchesSlug(origenSlug: string, slug: string): boolean {
  return origenSlug === slug || (origenSlug.length === 35 && slug.startsWith(origenSlug))
}

export async function getNetworkTraction(days: TractionPeriod, now: Date = new Date()): Promise<NetworkTraction> {
  await connectDB()
  const since = new Date(now.getTime() - days * 24 * 60 * 60_000)

  const clicks = await CustomerEvent.aggregate<{ _id: { t: mongoose.Types.ObjectId; s: string }; clicks: number; people: number }>([
    { $match: { type: 'network_cta_click', createdAt: { $gte: since } } },
    { $group: { _id: { t: '$tenantId', s: '$data.source' }, clicks: { $sum: 1 }, sessions: { $addToSet: '$metadata.sessionId' } } },
    { $project: { clicks: 1, people: { $size: { $setDifference: ['$sessions', [null, '']] } } } },
  ])

  const signupTenants = await Tenant.find({ 'onboarding.origen': /^menu-/, createdAt: { $gte: since } })
    .select('onboarding.origen onboarding.status')
    .lean<{ onboarding?: { origen?: string; status?: string } }[]>()

  const byTenant = new Map<string, TenantTraction>()
  const row = (id: string): TenantTraction => {
    let r = byTenant.get(id)
    if (!r) {
      r = { tenantId: id, name: '', slug: '', appClicks: 0, appPeople: 0, registerClicks: 0, registerPeople: 0, signups: 0, signupsCompleted: 0, total: 0 }
      byTenant.set(id, r)
    }
    return r
  }
  for (const c of clicks) {
    const r = row(String(c._id.t))
    if (c._id.s === 'app') { r.appClicks += c.clicks; r.appPeople += c.people }
    if (c._id.s === 'register') { r.registerClicks += c.clicks; r.registerPeople += c.people }
  }

  // Nombres y slugs de los comercios con clics, más los referidos por origen.
  const origenSlugs = signupTenants.map(t => slugFromOrigen(t.onboarding?.origen)).filter((s): s is string => Boolean(s))
  const tenants = await Tenant.find({
    $or: [
      { _id: { $in: [...byTenant.keys()].map(id => new mongoose.Types.ObjectId(id)) } },
      { slug: { $in: origenSlugs } },
      // Slug cortado en el enlace (35 caracteres): se busca por prefijo con un rango.
      ...origenSlugs.filter(s => s.length === 35).map(s => ({ slug: { $gte: s, $lt: `${s}￿` } })),
    ],
  })
    .select('_id name slug')
    .lean<{ _id: mongoose.Types.ObjectId; name: string; slug: string }[]>()

  for (const t of tenants) {
    const r = row(String(t._id))
    r.name = t.name
    r.slug = t.slug
  }
  for (const s of signupTenants) {
    const origenSlug = slugFromOrigen(s.onboarding?.origen)
    if (!origenSlug) continue
    const owner = tenants.find(t => origenMatchesSlug(origenSlug, t.slug))
    if (!owner) continue
    const r = row(String(owner._id))
    r.signups += 1
    if (s.onboarding?.status === 'pending_review' || s.onboarding?.status === 'approved') r.signupsCompleted += 1
  }

  const rows = [...byTenant.values()]
    .filter(r => r.slug)
    .map(r => ({ ...r, total: r.appClicks + r.registerClicks }))
    .sort((a, b) => b.total - a.total || b.signups - a.signups || a.name.localeCompare(b.name))

  const totals = rows.reduce(
    (acc, r) => ({
      appClicks: acc.appClicks + r.appClicks,
      appPeople: acc.appPeople + r.appPeople,
      registerClicks: acc.registerClicks + r.registerClicks,
      registerPeople: acc.registerPeople + r.registerPeople,
      signups: acc.signups + r.signups,
      signupsCompleted: acc.signupsCompleted + r.signupsCompleted,
    }),
    { appClicks: 0, appPeople: 0, registerClicks: 0, registerPeople: 0, signups: 0, signupsCompleted: 0 },
  )

  return { days, since, totals, rows }
}
