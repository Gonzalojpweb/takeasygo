/**
 * lib/organizations/group-crm.ts — CRM del grupo (F7 nivel 1). Solo lectura.
 *
 * Cruza los perfiles de cliente de cada marca (CustomerProfile, uno por
 * phoneHash y marca) de las marcas que la membresía cubre. No cambia puntos
 * ni membresías del club: cada marca sigue con su club.
 *
 * Quién ve qué (decisión del dueño, 13/11/2026):
 *   · números agregados → los roles de la vista 360 (DASHBOARD_ROLES);
 *   · lista de clientes con NOMBRE y últimos 4 dígitos del teléfono → solo
 *     propietario y administrador general. El teléfono completo, el email y
 *     el phoneHash nunca salen del servidor.
 */
import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import CustomerProfile from '@/models/CustomerProfile'
import Consumer from '@/models/Consumer'
import type { OrgRole } from '@/models/OrgMembership'
import { getMyOrganizations } from './me'
import { DASHBOARD_ROLES, resolveCoverage } from './dashboard'
import {
  EMPTY_FILTER,
  computeCrmStats,
  lastOrderOf,
  maskPhone,
  matchesFilter,
  normalizeCustomer,
  totalsOf,
  type CrmFilter,
  type CrmStats,
  type GroupCustomer,
} from './group-crm-stats'

export const CRM_LIST_ROLES: ReadonlySet<OrgRole> = new Set<OrgRole>(['owner', 'org_admin'])
const LIST_LIMIT = 100

export interface CrmListRow {
  name: string
  phone: string | null
  brands: { slug: string; name: string; orders: number; spent: number }[]
  orders: number
  spent: number
  lastOrderAt: string | null
}

export interface GroupCrm {
  organization: { name: string; slug: string }
  orgRole: OrgRole
  brands: { tenantId: string; slug: string; name: string }[]
  stats: CrmStats
  filter: CrmFilter
  /** null = tu rol no ve la lista con nombres. */
  list: CrmListRow[] | null
  listTruncated: boolean
}

export type GroupCrmResult = { ok: true; data: GroupCrm } | { ok: false; reason: 'not_member' | 'role_not_allowed' }

/** Un registro por cliente con lo que compró en cada marca cubierta. */
export async function loadGroupCustomers(tenantIds: string[]): Promise<GroupCustomer[]> {
  if (tenantIds.length === 0) return []
  const rows = await CustomerProfile.aggregate<{
    _id: string
    consumerId: unknown
    brands: { tenantId: unknown; orders: number; spent: number; lastOrderAt: Date | null }[]
  }>([
    { $match: { tenantId: { $in: tenantIds.map((id) => new mongoose.Types.ObjectId(id)) }, phoneHash: { $nin: [null, ''] }, orderCount: { $gt: 0 } } },
    {
      $group: {
        _id: '$phoneHash',
        consumerId: { $first: '$consumerId' },
        brands: { $push: { tenantId: '$tenantId', orders: '$orderCount', spent: '$totalSpent', lastOrderAt: '$lastOrderAt' } },
      },
    },
  ]).allowDiskUse(true)
  return rows.map((r) => ({
    key: r._id,
    consumerId: r.consumerId ? String(r.consumerId) : null,
    brands: r.brands.map((b) => ({ tenantId: String(b.tenantId), orders: b.orders ?? 0, spent: b.spent ?? 0, lastOrderAt: b.lastOrderAt ? new Date(b.lastOrderAt) : null })),
  }))
}

/** Filtro desde la dirección: m_<slug>=si|no, minimo=1|2|3, dias=30|60|90|180|365. */
export function filterFromQuery(get: (k: string) => string | null | undefined, brands: { tenantId: string; slug: string }[]): CrmFilter {
  const went: string[] = []
  const notWent: string[] = []
  for (const b of brands) {
    const v = get(`m_${b.slug}`)
    if (v === 'si') went.push(b.tenantId)
    else if (v === 'no') notWent.push(b.tenantId)
  }
  const min = Number(get('minimo'))
  const days = Number(get('dias'))
  return {
    went,
    notWent,
    minBrands: [1, 2, 3].includes(min) ? min : EMPTY_FILTER.minBrands,
    activeDays: [30, 60, 90, 180, 365].includes(days) ? days : null,
  }
}

export async function loadGroupCrm(userId: string, orgSlug: string, get: (k: string) => string | null | undefined, now: Date = new Date()): Promise<GroupCrmResult> {
  const mine = (await getMyOrganizations(userId)).find((o) => o.organization.slug === orgSlug)
  if (!mine) return { ok: false, reason: 'not_member' }
  if (!DASHBOARD_ROLES.has(mine.orgRole)) return { ok: false, reason: 'role_not_allowed' }
  await connectDB()

  // Las marcas que la membresía cubre (los filtros de sede no aplican: el perfil es por marca).
  const { covered } = await resolveCoverage(mine, {})
  const brands = covered.map((c) => ({ tenantId: c.brand.tenantId, slug: c.brand.slug, name: c.brand.name }))
  const ids = brands.map((b) => b.tenantId)
  const filter = filterFromQuery(get, brands)

  const customers = await loadGroupCustomers(ids)
  const stats = computeCrmStats(customers, ids, filter, now)

  let list: CrmListRow[] | null = null
  let listTruncated = false
  if (CRM_LIST_ROLES.has(mine.orgRole)) {
    const idSet = new Set(ids)
    const matching = customers
      .map((c) => normalizeCustomer({ ...c, brands: c.brands.filter((b) => idSet.has(b.tenantId) && b.orders > 0) }))
      .filter((c) => c.brands.length > 0 && matchesFilter(c, filter, now))
      .sort((a, b) => totalsOf(b).spent - totalsOf(a).spent)
    listTruncated = matching.length > LIST_LIMIT
    const top = matching.slice(0, LIST_LIMIT)
    const consumerIds = top.map((c) => c.consumerId).filter((id): id is string => !!id && mongoose.Types.ObjectId.isValid(id))
    const consumers = consumerIds.length
      ? await Consumer.find({ _id: { $in: consumerIds } }).select('name phone').lean<{ _id: unknown; name?: string; phone?: string }[]>()
      : []
    const byId = new Map(consumers.map((c) => [String(c._id), c]))
    const brandById = new Map(brands.map((b) => [b.tenantId, b]))
    list = top.map((c) => {
      const person = c.consumerId ? byId.get(c.consumerId) : undefined
      const t = totalsOf(c)
      const last = lastOrderOf(c)
      return {
        name: person?.name?.trim() || 'Cliente sin nombre',
        phone: maskPhone(person?.phone),
        brands: c.brands
          .map((b) => ({ slug: brandById.get(b.tenantId)!.slug, name: brandById.get(b.tenantId)!.name, orders: b.orders, spent: b.spent }))
          .sort((x, y) => y.spent - x.spent),
        orders: t.orders,
        spent: t.spent,
        lastOrderAt: last ? last.toISOString() : null,
      }
    })
  }

  return {
    ok: true,
    data: {
      organization: { name: mine.organization.name, slug: mine.organization.slug },
      orgRole: mine.orgRole,
      brands,
      stats,
      filter,
      list,
      listTruncated,
    },
  }
}
