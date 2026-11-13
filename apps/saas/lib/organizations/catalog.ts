/**
 * lib/organizations/catalog.ts — carta central del grupo (F3): servicio.
 *
 * Permisos (siempre desde la membresía, nunca de lo que mande el cliente):
 *   · editar la carta central y armarla desde una sede → owner, org_admin;
 *   · enviar a las sedes y deshacer un envío → owner, org_admin y
 *     brand_manager, solo a las marcas y sedes que su membresía cubre;
 *   · el resto → no ve la carta central.
 *
 * El envío usa planPush (catalog-sync.ts, puro) y guarda la carta de cada
 * sede de forma condicional (updatedAt igual al leído: si alguien la cambió
 * en el medio, esa sede queda como conflicto y no se pisa). Cada sede
 * enviada deja un OrgCatalogPush con la carta de antes, para deshacer.
 */
import crypto from 'node:crypto'
import mongoose from 'mongoose'
import { z } from 'zod'
import { connectDB } from '@/lib/mongoose'
import { logAudit } from '@/lib/audit'
import Menu from '@/models/Menu'
import Location from '@/models/Location'
import OrgCatalog, { type IOrgCatalog, type IOrgCatalogItem } from '@/models/OrgCatalog'
import OrgCatalogPush, { type IOrgCatalogPush } from '@/models/OrgCatalogPush'
import type { OrgRole } from '@/models/OrgMembership'
import { isIvaRate } from '@takeasygo/business'
import { getMyOrganizations, type MyOrganization } from './me'
import { OrgError } from './service'
import {
  SYNC_FIELDS,
  catalogFromMenu,
  linkSourceItems,
  normName,
  planPush,
  summarizePlan,
  type CatalogLike,
  type ItemReport,
  type SyncField,
} from './catalog-sync'

export const CATALOG_EDIT_ROLES: ReadonlySet<OrgRole> = new Set<OrgRole>(['owner', 'org_admin'])
export const CATALOG_PUSH_ROLES: ReadonlySet<OrgRole> = new Set<OrgRole>(['owner', 'org_admin', 'brand_manager'])
const MAX_TARGETS = 60
const MAX_ITEMS = 1500

export interface CatalogTarget {
  tenantId: string
  tenantSlug: string
  tenantName: string
  locationId: string
  locationName: string
}

export interface CatalogContext {
  userId: string
  orgId: string
  orgName: string
  orgSlug: string
  orgRole: OrgRole
  canEdit: boolean
  canPush: boolean
  targets: CatalogTarget[]
}

const oid = (v: string) => new mongoose.Types.ObjectId(v)
const isId = (v: unknown): v is string => typeof v === 'string' && mongoose.Types.ObjectId.isValid(v)

/** Sedes a las que puede enviar: las de sus marcas, respetando las sedes de su membresía. */
async function targetsFor(mine: MyOrganization): Promise<CatalogTarget[]> {
  const out: CatalogTarget[] = []
  for (const b of mine.brands) {
    const filter: Record<string, unknown> = { tenantId: oid(b.tenantId), isActive: { $ne: false } }
    if (b.locationIds.length) filter._id = { $in: b.locationIds.filter(isId).map(oid) }
    const locs = await Location.find(filter).select('name').sort({ name: 1 }).lean<Array<{ _id: mongoose.Types.ObjectId; name?: string }>>()
    for (const l of locs) out.push({ tenantId: b.tenantId, tenantSlug: b.slug, tenantName: b.name, locationId: String(l._id), locationName: l.name ?? 'Sede' })
  }
  return out
}

export async function catalogContext(userId: string, orgSlug: string): Promise<CatalogContext> {
  const mine = (await getMyOrganizations(userId)).find((o) => o.organization.slug === orgSlug)
  if (!mine) throw new OrgError(404, 'not_found', 'No encontrado')
  if (!CATALOG_PUSH_ROLES.has(mine.orgRole)) throw new OrgError(403, 'forbidden_privilege', 'Tu rol no maneja la carta del grupo.')
  await connectDB()
  return {
    userId,
    orgId: mine.organization.id,
    orgName: mine.organization.name,
    orgSlug: mine.organization.slug,
    orgRole: mine.orgRole,
    canEdit: CATALOG_EDIT_ROLES.has(mine.orgRole),
    canPush: true,
    targets: await targetsFor(mine),
  }
}

function requireEdit(ctx: CatalogContext) {
  if (!ctx.canEdit) throw new OrgError(403, 'forbidden_privilege', 'La carta central la editan el propietario y el administrador general.')
}

function targetAllowed(ctx: CatalogContext, tenantId: string, locationId: string): CatalogTarget {
  const t = ctx.targets.find((x) => x.tenantId === tenantId && x.locationId === locationId)
  // 404: no se confirma que exista una sede que no es tuya.
  if (!t) throw new OrgError(404, 'not_found', 'Sede no encontrada')
  return t
}

async function loadCatalog(ctx: CatalogContext): Promise<IOrgCatalog | null> {
  return OrgCatalog.findOne({ organizationId: oid(ctx.orgId) }).lean<IOrgCatalog>()
}

function asCatalogLike(c: IOrgCatalog | null): CatalogLike {
  return { categories: c?.categories ?? [], items: (c?.items ?? []) as CatalogLike['items'] }
}

/** Guarda la carta central: crea si no existe; si existe, solo si nadie la cambió (409). */
async function saveCatalog(ctx: CatalogContext, current: IOrgCatalog | null, next: Pick<IOrgCatalog, 'categories' | 'items'>) {
  const set = { categories: next.categories, items: next.items, updatedBy: isId(ctx.userId) ? oid(ctx.userId) : null }
  if (!current) {
    try {
      return (await OrgCatalog.create({ organizationId: oid(ctx.orgId), ...set })).toObject() as IOrgCatalog
    } catch (err) {
      if ((err as { code?: number }).code === 11000) throw new OrgError(409, 'conflict', 'Alguien creó la carta al mismo tiempo. Actualizá la página.')
      throw err
    }
  }
  const saved = await OrgCatalog.findOneAndUpdate({ _id: current._id, updatedAt: current.updatedAt }, { $set: set }, { new: true, runValidators: true }).lean<IOrgCatalog>()
  if (!saved) throw new OrgError(409, 'conflict', 'Alguien cambió la carta central mientras editabas. Actualizá la página.')
  return saved
}

// ---------------------------------------------------------------------------
// Edición de la carta central
// ---------------------------------------------------------------------------

const cents = z.number().int().min(0).max(100_000_000)
const groupSchema: z.ZodType<unknown> = z.lazy(() =>
  z.object({
    name: z.string().trim().min(1).max(80),
    type: z.enum(['single', 'multiple', 'fixed']).optional(),
    fixedCount: z.number().int().min(1).max(50).nullish(),
    required: z.boolean().optional(),
    priceRule: z.enum(['sum', 'max', 'average']).optional(),
    options: z.array(z.object({
      name: z.string().trim().min(1).max(80),
      extraPrice: cents.optional(),
      imageUrl: z.string().max(600).optional(),
      subGroups: z.array(groupSchema).max(10).optional(),
    })).max(60),
  }),
)

export const catalogEditSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('upsertCategory'), key: z.string().max(64).optional(), name: z.string().trim().min(1).max(80), description: z.string().trim().max(300).optional() }),
  z.object({ action: z.literal('deleteCategory'), key: z.string().max(64) }),
  z.object({
    action: z.literal('upsertItem'),
    key: z.string().max(64).optional(),
    categoryKey: z.string().max(64),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(600).optional(),
    imageUrl: z.string().trim().max(600).optional(),
    price: cents,
    takeawayPrice: cents.nullish(),
    variants: z.array(z.object({ name: z.string().trim().min(1).max(60), price: cents, takeawayPrice: cents.nullish() })).max(30).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    ivaRate: z.number().nullish(),
    customizationGroups: z.array(groupSchema).max(30).optional(),
  }),
  z.object({ action: z.literal('archiveItem'), key: z.string().max(64), archived: z.boolean() }),
  z.object({ action: z.literal('importFromMenu'), tenantId: z.string(), locationId: z.string() }),
])

export async function editCatalog(ctx: CatalogContext, input: z.infer<typeof catalogEditSchema>) {
  requireEdit(ctx)
  const current = await loadCatalog(ctx)
  const categories = [...(current?.categories ?? [])].map((c) => ({ ...c }))
  const items = [...(current?.items ?? [])].map((i) => ({ ...i }))
  const extra: Record<string, unknown> = {}

  switch (input.action) {
    case 'upsertCategory': {
      const dup = categories.find((c) => normName(c.name) === normName(input.name) && c.key !== input.key)
      if (dup) throw new OrgError(409, 'conflict', 'Ya hay una categoría con ese nombre')
      if (input.key) {
        const c = categories.find((x) => x.key === input.key)
        if (!c) throw new OrgError(404, 'not_found', 'Categoría no encontrada')
        c.name = input.name
        c.description = input.description ?? c.description ?? ''
      } else {
        const key = crypto.randomUUID()
        categories.push({ key, name: input.name, description: input.description ?? '', sortOrder: categories.reduce((m, c) => Math.max(m, c.sortOrder), -1) + 1 })
        extra.key = key
      }
      break
    }
    case 'deleteCategory': {
      if (items.some((i) => i.categoryKey === input.key && !i.isArchived)) throw new OrgError(409, 'conflict', 'La categoría tiene platos: movelos o archivalos primero')
      const idx = categories.findIndex((c) => c.key === input.key)
      if (idx < 0) throw new OrgError(404, 'not_found', 'Categoría no encontrada')
      categories.splice(idx, 1)
      break
    }
    case 'upsertItem': {
      if (!categories.some((c) => c.key === input.categoryKey)) throw new OrgError(400, 'invalid', 'Elegí una categoría de la carta central')
      if (input.ivaRate !== undefined && input.ivaRate !== null && !isIvaRate(input.ivaRate)) throw new OrgError(400, 'invalid', 'Alícuota de IVA inválida')
      const variants = input.variants ?? []
      if (new Set(variants.map((v) => normName(v.name))).size !== variants.length) throw new OrgError(400, 'invalid', 'Hay variantes con el mismo nombre')
      const dup = items.find((i) => !i.isArchived && normName(i.name) === normName(input.name) && i.key !== input.key)
      if (dup) throw new OrgError(409, 'conflict', 'Ya hay un plato con ese nombre en la carta central')
      const data: Omit<IOrgCatalogItem, 'key' | 'isArchived'> = {
        categoryKey: input.categoryKey,
        name: input.name,
        description: input.description ?? '',
        imageUrl: input.imageUrl ?? '',
        price: input.price,
        takeawayPrice: input.takeawayPrice ?? null,
        variants: variants.map((v) => ({ name: v.name, price: v.price, takeawayPrice: v.takeawayPrice ?? null })),
        tags: input.tags ?? [],
        ivaRate: input.ivaRate ?? null,
        customizationGroups: (input.customizationGroups ?? []) as unknown[],
        updatedAt: new Date(),
      }
      if (input.key) {
        const i = items.find((x) => x.key === input.key)
        if (!i) throw new OrgError(404, 'not_found', 'Plato no encontrado')
        Object.assign(i, data)
      } else {
        if (items.length >= MAX_ITEMS) throw new OrgError(400, 'invalid', `La carta central admite hasta ${MAX_ITEMS} platos`)
        const key = crypto.randomUUID()
        items.push({ key, ...data, isArchived: false })
        extra.key = key
      }
      break
    }
    case 'archiveItem': {
      const i = items.find((x) => x.key === input.key)
      if (!i) throw new OrgError(404, 'not_found', 'Plato no encontrado')
      if (!input.archived && items.some((x) => x.key !== i.key && !x.isArchived && normName(x.name) === normName(i.name))) {
        throw new OrgError(409, 'conflict', 'Ya hay otro plato activo con ese nombre')
      }
      i.isArchived = input.archived
      i.updatedAt = new Date()
      break
    }
    case 'importFromMenu': {
      if (!isId(input.tenantId) || !isId(input.locationId)) throw new OrgError(404, 'not_found', 'Sede no encontrada')
      targetAllowed(ctx, input.tenantId, input.locationId)
      const menu = await Menu.findOne({ tenantId: oid(input.tenantId), locationId: oid(input.locationId) }).lean<{ _id: mongoose.Types.ObjectId; categories: Record<string, unknown>[]; updatedAt: Date }>()
      if (!menu || !menu.categories?.length) throw new OrgError(400, 'invalid', 'Esa sede no tiene carta cargada')
      const result = catalogFromMenu(menu.categories, { categories, items: items as CatalogLike['items'] }, () => crypto.randomUUID())
      if (items.length + result.items.length > MAX_ITEMS) throw new OrgError(400, 'invalid', `La carta central admite hasta ${MAX_ITEMS} platos`)
      categories.push(...result.categories.map((c) => ({ key: c.key, name: c.name, description: c.description ?? '', sortOrder: c.sortOrder ?? 0 })))
      items.push(...result.items.map((i) => ({ ...i, isArchived: false, updatedAt: new Date() }) as IOrgCatalogItem))
      const saved = await saveCatalog(ctx, current, { categories, items })
      // Vincula los platos de la sede de origen (sus precios quedan como «enviados»).
      if (result.links.length) {
        const linked = linkSourceItems(menu.categories, result.links, String(saved._id), new Date())
        const ok = await Menu.findOneAndUpdate({ _id: menu._id, updatedAt: menu.updatedAt }, { $set: { categories: linked } }, { runValidators: true })
        if (!ok) extra.sourceNotLinked = true
      }
      return { catalog: saved, imported: result.items.length, categoriesCreated: result.categories.length, skippedDuplicates: result.skippedDuplicates, ...extra }
    }
  }

  const saved = await saveCatalog(ctx, current, { categories, items })
  return { catalog: saved, ...extra }
}

// ---------------------------------------------------------------------------
// Envío a las sedes
// ---------------------------------------------------------------------------

export const pushSchema = z.object({
  itemKeys: z.array(z.string().max(64)).min(1).max(MAX_ITEMS),
  targets: z.array(z.object({ tenantId: z.string(), locationId: z.string() })).min(1).max(MAX_TARGETS),
  fields: z.array(z.enum(SYNC_FIELDS as [SyncField, ...SyncField[]])).min(1),
  linkByName: z.boolean().default(true),
  overrideLocalPrices: z.boolean().default(false),
  dryRun: z.boolean().default(true),
})

export interface TargetResult {
  tenantId: string
  locationId: string
  tenantName: string
  locationName: string
  status: 'preview' | 'applied' | 'unchanged' | 'conflict'
  newMenu: boolean
  summary: ReturnType<typeof summarizePlan>
  categoriesCreated: string[]
  items: ItemReport[]
}

export async function pushCatalog(ctx: CatalogContext, input: z.infer<typeof pushSchema>) {
  const catalog = await loadCatalog(ctx)
  if (!catalog) throw new OrgError(400, 'invalid', 'La carta central está vacía')
  const like = asCatalogLike(catalog)
  const known = new Set(like.items.filter((i) => !i.isArchived).map((i) => i.key))
  const itemKeys = [...new Set(input.itemKeys)].filter((k) => known.has(k))
  if (!itemKeys.length) throw new OrgError(400, 'invalid', 'Elegí al menos un plato activo de la carta central')
  const seen = new Set<string>()
  const targets = input.targets.filter((t) => {
    const k = `${t.tenantId}|${t.locationId}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  }).map((t) => {
    if (!isId(t.tenantId) || !isId(t.locationId)) throw new OrgError(404, 'not_found', 'Sede no encontrada')
    return targetAllowed(ctx, t.tenantId, t.locationId)
  })

  const pushId = crypto.randomUUID()
  const now = new Date()
  const results: TargetResult[] = []
  for (const t of targets) {
    const menu = await Menu.findOne({ tenantId: oid(t.tenantId), locationId: oid(t.locationId) }).lean<{ _id: mongoose.Types.ObjectId; categories: Record<string, unknown>[]; updatedAt: Date }>()
    const plan = planPush(menu?.categories ?? [], like, itemKeys, {
      catalogId: String(catalog._id), fields: input.fields, linkByName: input.linkByName, overrideLocalPrices: input.overrideLocalPrices, now,
    })
    const base = { tenantId: t.tenantId, locationId: t.locationId, tenantName: t.tenantName, locationName: t.locationName, newMenu: !menu, summary: summarizePlan(plan), categoriesCreated: plan.categoriesCreated, items: plan.items }
    if (input.dryRun) { results.push({ ...base, status: 'preview' }); continue }
    if (!plan.changed) { results.push({ ...base, status: 'unchanged' }); continue }

    let menuId: mongoose.Types.ObjectId
    let afterUpdatedAt: Date
    if (!menu) {
      const created = await Menu.create({ tenantId: oid(t.tenantId), locationId: oid(t.locationId), categories: plan.categories, isActive: true })
      menuId = created._id as mongoose.Types.ObjectId
      afterUpdatedAt = created.updatedAt
    } else {
      const saved = await Menu.findOneAndUpdate({ _id: menu._id, updatedAt: menu.updatedAt }, { $set: { categories: plan.categories } }, { new: true, runValidators: true }).lean<{ _id: mongoose.Types.ObjectId; updatedAt: Date }>()
      if (!saved) { results.push({ ...base, status: 'conflict' }); continue }
      menuId = saved._id
      afterUpdatedAt = saved.updatedAt
    }
    await OrgCatalogPush.create({
      organizationId: oid(ctx.orgId), pushId, tenantId: oid(t.tenantId), locationId: oid(t.locationId), menuId,
      fields: input.fields, itemKeys, summary: base.summary, before: menu?.categories ?? [], afterUpdatedAt,
      by: isId(ctx.userId) ? oid(ctx.userId) : null,
    })
    logAudit({
      tenantId: t.tenantId,
      action: 'menu.catalog.push',
      entity: 'menu',
      entityId: String(menuId),
      details: { organization: ctx.orgSlug, pushId, locationId: t.locationId, fields: input.fields, ...base.summary },
    })
    results.push({ ...base, status: 'applied' })
  }
  return { pushId: input.dryRun ? null : pushId, dryRun: input.dryRun, results }
}

export async function undoPush(ctx: CatalogContext, pushId: string, tenantId: string, locationId: string) {
  if (!/^[\w-]{8,64}$/.test(pushId) || !isId(tenantId) || !isId(locationId)) throw new OrgError(404, 'not_found', 'Envío no encontrado')
  targetAllowed(ctx, tenantId, locationId)
  const push = await OrgCatalogPush.findOne({ organizationId: oid(ctx.orgId), pushId, tenantId: oid(tenantId), locationId: oid(locationId) }).lean<IOrgCatalogPush>()
  if (!push) throw new OrgError(404, 'not_found', 'Envío no encontrado')
  if (push.undoneAt) throw new OrgError(409, 'conflict', 'Ese envío ya se deshizo')
  const menu = await Menu.findOne({ _id: push.menuId, tenantId: oid(tenantId), locationId: oid(locationId) }).select('updatedAt').lean<{ _id: mongoose.Types.ObjectId; updatedAt: Date }>()
  if (!menu) throw new OrgError(404, 'not_found', 'La carta ya no existe')
  if (new Date(menu.updatedAt).getTime() !== new Date(push.afterUpdatedAt).getTime()) {
    throw new OrgError(409, 'menu_changed', 'La carta de la sede cambió después del envío: no se puede deshacer sin pisar esos cambios.')
  }
  const restored = await Menu.findOneAndUpdate({ _id: menu._id, updatedAt: menu.updatedAt }, { $set: { categories: push.before } }, { new: true, runValidators: true })
  if (!restored) throw new OrgError(409, 'menu_changed', 'La carta de la sede cambió recién: no se pisó.')
  await OrgCatalogPush.updateOne({ _id: push._id, undoneAt: null }, { $set: { undoneAt: new Date(), undoneBy: isId(ctx.userId) ? oid(ctx.userId) : null } })
  logAudit({ tenantId, action: 'menu.catalog.undo', entity: 'menu', entityId: String(menu._id), details: { organization: ctx.orgSlug, pushId, locationId } })
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Vista
// ---------------------------------------------------------------------------

export async function catalogView(ctx: CatalogContext) {
  const catalog = await loadCatalog(ctx)
  const allowed = new Set(ctx.targets.map((t) => `${t.tenantId}|${t.locationId}`))
  const pushes = await OrgCatalogPush.find({ organizationId: oid(ctx.orgId) }).sort({ createdAt: -1 }).limit(60).select('-before').lean<Array<Omit<IOrgCatalogPush, 'before'>>>()
  const name = new Map(ctx.targets.map((t) => [`${t.tenantId}|${t.locationId}`, `${t.tenantName} · ${t.locationName}`]))
  return {
    organization: { name: ctx.orgName, slug: ctx.orgSlug },
    orgRole: ctx.orgRole,
    canEdit: ctx.canEdit,
    catalogId: catalog ? String(catalog._id) : null,
    categories: [...(catalog?.categories ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    items: (catalog?.items ?? []).map((i) => ({ ...i, updatedAt: new Date(i.updatedAt).toISOString() })),
    targets: ctx.targets,
    pushes: pushes
      .filter((p) => allowed.has(`${p.tenantId}|${p.locationId}`))
      .map((p) => ({
        pushId: p.pushId,
        tenantId: String(p.tenantId),
        locationId: String(p.locationId),
        target: name.get(`${p.tenantId}|${p.locationId}`) ?? 'Sede',
        fields: p.fields,
        summary: p.summary,
        at: new Date(p.createdAt).toISOString(),
        undone: Boolean(p.undoneAt),
      })),
  }
}
