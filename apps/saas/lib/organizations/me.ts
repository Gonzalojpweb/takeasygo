/**
 * lib/organizations/me.ts — «mis organizaciones» (multi-marca PR 9b).
 *
 * Lo que ve la persona en /grupo y lo que exige el login de un `member`.
 * Todo se calcula en el servidor desde las membresías, con la misma función
 * pura que la proyección (effectiveGrant): la lista de marcas coincide con lo
 * que después la proyección deja operar.
 */
import { Types } from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import Organization from '@/models/Organization'
import OrgMembership, { type OrgRole } from '@/models/OrgMembership'
import Tenant from '@/models/Tenant'
import { effectiveGrant, type MembershipLite } from './projection'

const isId = (v: string) => /^[a-f0-9]{24}$/i.test(v)

/** ¿Tiene al menos una membresía activa en una organización activa? */
export async function hasUsableMembership(userId: string): Promise<boolean> {
  if (!isId(userId)) return false
  await connectDB()
  const orgIds = await OrgMembership.distinct('organizationId', { userId: new Types.ObjectId(userId), status: 'active' })
  if (!orgIds.length) return false
  return Boolean(await Organization.exists({ _id: { $in: orgIds }, status: 'active' }))
}

export interface MyBrand {
  tenantId: string
  slug: string
  name: string
  /** Rol efectivo en la marca (admin, manager, …). */
  role: string
  /** Sedes de la membresía en esa marca ([] = todas). */
  locationIds: string[]
}

export interface MyOrganization {
  organization: { id: string; name: string; slug: string }
  orgRole: OrgRole
  brands: MyBrand[]
}

export async function getMyOrganizations(userId: string): Promise<MyOrganization[]> {
  if (!isId(userId)) return []
  await connectDB()
  const memberships = await OrgMembership.find({ userId: new Types.ObjectId(userId), status: 'active' })
    .select('organizationId orgRole status tenantRole scope')
    .lean<{ _id: unknown; organizationId: Types.ObjectId; orgRole: OrgRole; status: string; tenantRole?: 'admin' | 'manager' | null; scope?: { allTenants?: boolean; tenantIds?: unknown[]; locations?: { tenantId: unknown; locationId: unknown }[] } }[]>()
  if (!memberships.length) return []

  const orgs = await Organization.find({ _id: { $in: memberships.map(m => m.organizationId) }, status: 'active' })
    .select('_id name slug').lean<{ _id: Types.ObjectId; name: string; slug: string }[]>()
  const orgById = new Map(orgs.map(o => [String(o._id), o]))
  const tenants = await Tenant.find({ organizationId: { $in: orgs.map(o => o._id) }, status: { $ne: 'deleted' } })
    .select('_id name slug organizationId').sort({ name: 1 })
    .lean<{ _id: Types.ObjectId; name: string; slug: string; organizationId: Types.ObjectId }[]>()

  const result: MyOrganization[] = []
  for (const m of memberships) {
    const org = orgById.get(String(m.organizationId))
    if (!org) continue
    const lite: MembershipLite = {
      id: String(m._id), orgRole: m.orgRole, status: m.status, tenantRole: m.tenantRole ?? null,
      scope: {
        allTenants: Boolean(m.scope?.allTenants),
        tenantIds: (m.scope?.tenantIds ?? []).map(String),
        locations: (m.scope?.locations ?? []).map(l => ({ tenantId: String(l.tenantId), locationId: String(l.locationId) })),
      },
    }
    const brands: MyBrand[] = []
    for (const t of tenants) {
      if (String(t.organizationId) !== String(org._id)) continue
      const g = effectiveGrant(lite, String(t._id))
      if (g) brands.push({ tenantId: String(t._id), slug: t.slug, name: t.name, role: g.role, locationIds: g.locationIds })
    }
    result.push({ organization: { id: String(org._id), name: org.name, slug: org.slug }, orgRole: m.orgRole, brands })
  }
  return result.sort((a, b) => a.organization.name.localeCompare(b.organization.name, 'es'))
}

// ── Última marca y selector de marca ────────────────────────────────────────

/**
 * Guarda la última marca en la que operó un miembro (multi-marca, diseño 1-c).
 * Lee antes de escribir: una escritura solo cuando cambia de marca.
 */
export async function rememberLastBrand(userId: string, slug: string): Promise<void> {
  if (!isId(userId) || !/^[a-z0-9-]{2,60}$/.test(slug)) return
  await connectDB()
  const UserPreferences = (await import('@/models/UserPreferences')).default
  const uid = new Types.ObjectId(userId)
  const cur = await UserPreferences.findOne({ userId: uid }).select('lastTenantSlug').lean<{ lastTenantSlug?: string | null }>()
  if (cur?.lastTenantSlug === slug) return
  await UserPreferences.updateOne({ userId: uid }, { $set: { lastTenantSlug: slug } }, { upsert: true })
}

/** Última marca guardada, solo si todavía es una de las suyas (si no, null). */
export async function lastBrandFor(userId: string, orgs: MyOrganization[]): Promise<string | null> {
  if (!isId(userId)) return null
  await connectDB()
  const UserPreferences = (await import('@/models/UserPreferences')).default
  const pref = await UserPreferences.findOne({ userId: new Types.ObjectId(userId) }).select('lastTenantSlug').lean<{ lastTenantSlug?: string | null }>()
  const slug = pref?.lastTenantSlug
  return slug && orgs.some(o => o.brands.some(b => b.slug === slug)) ? slug : null
}

export interface SwitcherBrand { slug: string; name: string; orgName: string }

/** Marcas a las que puede saltar desde el panel (todas sus organizaciones). */
export function switcherBrands(orgs: MyOrganization[]): SwitcherBrand[] {
  const seen = new Set<string>()
  const out: SwitcherBrand[] = []
  for (const o of orgs) {
    for (const b of o.brands) {
      if (seen.has(b.slug)) continue
      seen.add(b.slug)
      out.push({ slug: b.slug, name: b.name, orgName: o.organization.name })
    }
  }
  return out
}
