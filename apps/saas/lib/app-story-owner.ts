// ============================================================================
// AppStory: dueño y superficies (CP2, 20/11/2026)
// ============================================================================
// owner.kind 'platform' (TakeasyGO) o 'tenant' (una pieza de un comercio,
// opcionalmente de una sede). Las stories viejas no tienen estos campos y
// cuentan como plataforma + menu_story: no hay migración.
// Superficies de una story: menu_story, app_story, home_banner (lista abierta).
// Sin flujo de aprobación: solo el SuperAdmin crea y edita.
// ============================================================================

import mongoose from 'mongoose'

export const STORY_SURFACES = ['menu_story', 'app_story', 'home_banner'] as const
export type StorySurface = (typeof STORY_SURFACES)[number]
export const DEFAULT_STORY_SURFACES: StorySurface[] = ['menu_story']

export type StoryOwnerKind = 'platform' | 'tenant'
export interface StoryOwner {
  kind: StoryOwnerKind
  tenantId: mongoose.Types.ObjectId | null
  locationId: mongoose.Types.ObjectId | null
}
export const PLATFORM_OWNER: StoryOwner = { kind: 'platform', tenantId: null, locationId: null }

/** Dueño efectivo de una story (las viejas, sin campo, son de la plataforma). */
export function effectiveOwner(doc: { owner?: Partial<StoryOwner> | null }): { kind: StoryOwnerKind; tenantId: string | null; locationId: string | null } {
  const o = doc.owner
  if (o?.kind === 'tenant' && o.tenantId) {
    return { kind: 'tenant', tenantId: String(o.tenantId), locationId: o.locationId ? String(o.locationId) : null }
  }
  return { kind: 'platform', tenantId: null, locationId: null }
}

/** Superficies efectivas (las viejas, sin campo o vacías, son menu_story). */
export function effectiveSurfaces(doc: { surfaces?: string[] | null }): StorySurface[] {
  const list = (doc.surfaces ?? []).filter((s): s is StorySurface => (STORY_SURFACES as readonly string[]).includes(s))
  return list.length ? list : [...DEFAULT_STORY_SURFACES]
}

export function normalizeSurfaces(input: unknown): { ok: true; value: StorySurface[] } | { ok: false; error: string } {
  if (input === undefined || input === null) return { ok: true, value: [...DEFAULT_STORY_SURFACES] }
  if (!Array.isArray(input)) return { ok: false, error: 'Superficies inválidas' }
  const set = new Set<StorySurface>()
  for (const s of input) {
    if (typeof s !== 'string' || !(STORY_SURFACES as readonly string[]).includes(s)) return { ok: false, error: `Superficie desconocida: ${String(s)}` }
    set.add(s as StorySurface)
  }
  if (set.size === 0) return { ok: false, error: 'Elegí al menos una superficie' }
  return { ok: true, value: STORY_SURFACES.filter((s) => set.has(s)) }
}

const OID = /^[a-f0-9]{24}$/i

/**
 * Valida el dueño contra la base: comercio activo y sede de ese comercio.
 * `lookups` se inyecta para no acoplar a los modelos (y poder testear).
 */
export async function normalizeOwner(
  input: unknown,
  lookups: {
    tenantExists: (id: string) => Promise<boolean>
    locationTenant: (id: string) => Promise<string | null>
  },
): Promise<{ ok: true; value: StoryOwner } | { ok: false; error: string }> {
  if (input === undefined || input === null) return { ok: true, value: { ...PLATFORM_OWNER } }
  if (typeof input !== 'object') return { ok: false, error: 'Dueño inválido' }
  const o = input as { kind?: unknown; tenantId?: unknown; locationId?: unknown }
  if (o.kind === 'platform' || o.kind === undefined) return { ok: true, value: { ...PLATFORM_OWNER } }
  if (o.kind !== 'tenant') return { ok: false, error: 'Dueño inválido' }
  if (typeof o.tenantId !== 'string' || !OID.test(o.tenantId) || !(await lookups.tenantExists(o.tenantId))) {
    return { ok: false, error: 'Comercio no encontrado' }
  }
  let locationId: mongoose.Types.ObjectId | null = null
  if (o.locationId !== undefined && o.locationId !== null && o.locationId !== '') {
    if (typeof o.locationId !== 'string' || !OID.test(o.locationId) || (await lookups.locationTenant(o.locationId)) !== o.tenantId) {
      return { ok: false, error: 'Sede no encontrada para ese comercio' }
    }
    locationId = new mongoose.Types.ObjectId(o.locationId)
  }
  return { ok: true, value: { kind: 'tenant', tenantId: new mongoose.Types.ObjectId(o.tenantId), locationId } }
}

/** Lookups reales contra Tenant/Location. */
export async function dbOwnerLookups() {
  const Tenant = (await import('@/models/Tenant')).default
  const Location = (await import('@/models/Location')).default
  return {
    tenantExists: async (id: string) => Boolean(await Tenant.exists({ _id: id, isActive: true })),
    locationTenant: async (id: string) => {
      const l = await Location.findById(id).select('tenantId').lean<{ tenantId?: unknown }>()
      return l?.tenantId ? String(l.tenantId) : null
    },
  }
}

/**
 * Filtro Mongo de las stories visibles en una superficie. En el menú de un
 * comercio: las de la plataforma + las de ESE comercio (todas sus sedes o esa
 * sede). Sin comercio: solo las de la plataforma.
 */
export function storyVisibilityFilter(surface: StorySurface, ctx: { tenantId?: string | null; locationId?: string | null }) {
  const surfaceMatch = surface === 'menu_story'
    ? { $or: [{ surfaces: 'menu_story' }, { surfaces: { $exists: false } }, { surfaces: { $size: 0 } }] }
    : { surfaces: surface }
  const platform = { $or: [{ 'owner.kind': { $exists: false } }, { 'owner.kind': 'platform' }] }
  const ownerMatch = ctx.tenantId
    ? { $or: [platform, {
        'owner.kind': 'tenant',
        'owner.tenantId': new mongoose.Types.ObjectId(ctx.tenantId),
        $or: [{ 'owner.locationId': null }, ...(ctx.locationId ? [{ 'owner.locationId': new mongoose.Types.ObjectId(ctx.locationId) }] : [])],
      }] }
    : platform
  return { $and: [surfaceMatch, ownerMatch] }
}
