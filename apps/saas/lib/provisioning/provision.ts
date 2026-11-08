/**
 * Alta rápida de comercios (Superadmin) — una sola función que crea todo junto:
 * comercio (nace aprobado), sedes, menú, identidad, dueño invitado y, si se
 * pide, organización multimarca. Se usa desde POST /api/superadmin/tenants/provision
 * y sirve de base para un CLI o un asistente en el futuro.
 *
 * Atomicidad: los tests (y algunos entornos) no tienen replica set, así que no
 * hay transacción de Mongo. Es una secuencia con deshacer: cada paso registra lo
 * que creó y, si uno falla, se borra todo en orden inverso. El email se manda
 * después de crear todo; si falla, no se deshace el alta (se reenvía la invitación).
 *
 * Idempotencia: cada envío trae una clave. Si la misma clave llega dos veces
 * (doble toque, reintento con mala señal) se devuelve el comercio ya creado.
 *
 * Seguridad: nunca se escribe una contraseña ajena. El dueño recibe un link de un
 * solo uso (token aleatorio, guardado con hash, vence a los 7 días). Al clonar
 * desde otro comercio solo se copia una lista cerrada de campos (nunca tokens de
 * MercadoPago, PIN del POS, agente de impresión, usuarios, clientes ni pedidos).
 */
import crypto from 'crypto'
import mongoose from 'mongoose'
import { z } from 'zod'
import Tenant from '@/models/Tenant'
import User from '@/models/User'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import Organization from '@/models/Organization'
import OrgMembership from '@/models/OrgMembership'
import { slugifyOrFallback } from '@/lib/slugify'
import { isReservedSlug } from '@/lib/reserved-slugs'
import { NEW_TENANT_WHATSAPP_ORDER_LINK } from '@/lib/whatsapp-order-link'
import { logAudit } from '@/lib/audit'
import { getRubroTemplate, templateCategories } from './templates'
import { parseMenuJson, menuJsonToCategories } from './menu-json'

export const INVITE_TTL_MS = 7 * 24 * 60 * 60_000
const PLANS = ['trial', 'anfitrion', 'try', 'buy', 'full', 'high'] as const
const HEX = /^#[0-9a-f]{6}$/i
const objectId = z.string().refine(v => mongoose.Types.ObjectId.isValid(v), 'Identificador inválido')

export const provisionSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(100),
  name: z.string().trim().min(2, 'Ingresá el nombre del comercio').max(100),
  slug: z.string().trim().max(60).optional().default(''),
  plan: z.enum(PLANS).default('trial'),
  rubro: z.string().trim().max(40).default('restaurante'),
  owner: z.object({
    name: z.string().trim().max(100).optional().default(''),
    email: z.string().trim().toLowerCase().email('Email del dueño inválido').max(200),
    phone: z.string().trim().max(30).optional().default(''),
  }),
  locations: z
    .array(z.object({
      name: z.string().trim().max(80).optional().default(''),
      address: z.string().trim().min(5, 'Ingresá la dirección de la sede').max(200),
      phone: z.string().trim().max(30).optional().default(''),
    }))
    .min(1, 'Agregá al menos una sede')
    .max(10, 'Máximo 10 sedes por alta'),
  branding: z.object({
    primaryColor: z.string().regex(HEX, 'Color inválido').optional(),
    logoUrl: z.string().url().max(500).optional(),
  }).optional().default({}),
  menu: z.discriminatedUnion('source', [
    z.object({ source: z.literal('template') }),
    z.object({ source: z.literal('empty') }),
    z.object({ source: z.literal('json'), json: z.unknown() }),
    z.object({ source: z.literal('clone') }),
  ]).default({ source: 'template' }),
  /** Copiar desde otro comercio. `menu`: con precios, sin precios (pausado) o nada. */
  clone: z.object({
    tenantId: objectId,
    locationId: objectId.optional(),
    menu: z.enum(['with_prices', 'without_prices', 'none']).default('with_prices'),
    schedules: z.boolean().default(true),
    orderModes: z.boolean().default(true),
  }).optional(),
  organization: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('none') }),
    z.object({ mode: z.literal('existing'), orgId: objectId }),
    z.object({ mode: z.literal('new'), name: z.string().trim().min(2).max(100), slug: z.string().trim().max(60).optional().default('') }),
  ]).default({ mode: 'none' }),
  sendEmail: z.boolean().default(true),
}).superRefine((v, ctx) => {
  if (v.menu.source === 'clone' && !v.clone) ctx.addIssue({ code: 'custom', path: ['clone'], message: 'Elegí el comercio a copiar' })
})

export type ProvisionInput = z.input<typeof provisionSchema>

export class ProvisionError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
  }
}

export interface ProvisionActor { userId: string | null; name: string; email?: string | null }

export interface ProvisionResult {
  reused: boolean
  tenant: { id: string; name: string; slug: string; plan: string }
  locations: Array<{ id: string; name: string; slug: string }>
  owner: { id: string | null; email: string; existingAccount: boolean }
  invite: { url: string; expiresAt: string; whatsappUrl: string } | null
  emailSent: boolean
  menuItems: number
  warnings: string[]
}

interface Deps {
  /** Geolocaliza la dirección (por defecto Nominatim con 4 s de tope). null = sin coordenadas. */
  geocode?: (address: string) => Promise<{ lat: number; lng: number } | null>
  sendInvite?: (to: string, tenantName: string, url: string) => Promise<void>
  appUrl?: string
  now?: () => Date
}

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex')

async function defaultGeocode(address: string) {
  const { geocodeText } = await import('@/lib/geocode')
  return Promise.race([
    geocodeText(address).catch(() => null),
    new Promise<null>(resolve => setTimeout(() => resolve(null), 4000)),
  ])
}

async function defaultSendInvite(to: string, tenantName: string, url: string) {
  const { sendTenantInviteEmail } = await import('@/lib/email')
  await sendTenantInviteEmail(to, tenantName, url)
}

/** Slug libre: el pedido si está libre (error si lo pidió explícito y no lo está); si no, nombre, nombre-2, … */
async function resolveTenantSlug(name: string, requested: string): Promise<string> {
  const explicit = requested.trim() !== ''
  const base = slugifyOrFallback(name, requested).slice(0, 50).replace(/-+$/, '') || 'comercio'
  if (explicit) {
    if (isReservedSlug(base)) throw new ProvisionError(400, 'slug_reserved', `El enlace «${base}» está reservado. Probá con otro.`)
    if (await Tenant.exists({ slug: base })) throw new ProvisionError(409, 'slug_taken', `El enlace «${base}» ya está en uso.`)
    return base
  }
  for (let n = 1; n <= 30; n++) {
    const candidate = n === 1 ? base : `${base.slice(0, 46)}-${n}`
    if (isReservedSlug(candidate)) continue
    if (!(await Tenant.exists({ slug: candidate }))) return candidate
  }
  throw new ProvisionError(409, 'slug_taken', 'No encontramos un enlace libre para ese nombre. Indicá uno.')
}

function uniqueLocationSlugs(locations: Array<{ name: string }>): string[] {
  const used = new Set<string>()
  return locations.map((l, i) => {
    const base = slugifyOrFallback(l.name || (i === 0 ? 'Sede Principal' : `Sede ${i + 1}`), '').slice(0, 40) || `sede-${i + 1}`
    let slug = base
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`
    used.add(slug)
    return slug
  })
}

type Category = Record<string, unknown>

/** Menú de una sede de OTRO comercio, saneado: ids nuevos, sin likes, sin pausas por stock ni premios del club. */
async function cloneCategories(sourceTenantId: string, sourceLocationId: string | undefined, withPrices: boolean): Promise<Category[]> {
  const filter: Record<string, unknown> = { tenantId: sourceTenantId }
  if (sourceLocationId) filter.locationId = sourceLocationId
  const source = await Menu.findOne(filter).sort({ createdAt: 1 }).select('categories').lean<{ categories?: Category[] }>()
  if (!source) throw new ProvisionError(404, 'clone_menu_not_found', 'El comercio a copiar no tiene carta.')
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(strip)
    if (v && typeof v === 'object' && !(v instanceof Date) && !(v instanceof mongoose.Types.ObjectId)) {
      const out: Record<string, unknown> = {}
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (k === '_id' || k === 'id') continue
        out[k] = strip(val)
      }
      return out
    }
    return v
  }
  const cleanItem = (it: Record<string, unknown>) => {
    const item: Record<string, unknown> = { ...it, likesCount: 0, pausedReason: null, pausedAt: null, pausedBy: null, stockPortions: null }
    delete item.hiddenReward
    if (!withPrices) {
      // Sin precios: queda pausado en $0 hasta que el dueño cargue el precio.
      for (const k of ['price', 'takeawayPrice', 'businessPrice', 'halfPrice', 'originalPrice', 'takeawayOriginalPrice']) if (k in item) item[k] = k === 'price' ? 0 : undefined
      item.isAvailable = false
      if (Array.isArray(item.variants)) item.variants = (item.variants as Record<string, unknown>[]).map(v => ({ ...v, price: 0 }))
    }
    return item
  }
  return (strip(source.categories ?? []) as Category[]).map(cat => ({
    ...cat,
    items: ((cat.items as Record<string, unknown>[] | undefined) ?? []).map(cleanItem),
    ...(Array.isArray(cat.subcategories)
      ? { subcategories: (cat.subcategories as Category[]).map(sub => ({ ...sub, items: ((sub.items as Record<string, unknown>[] | undefined) ?? []).map(cleanItem) })) }
      : {}),
  }))
}

const countItems = (cats: Category[]) =>
  cats.reduce((n, c) => n + ((c.items as unknown[] | undefined)?.length ?? 0) + ((c.subcategories as Category[] | undefined) ?? []).reduce((m, s) => m + ((s.items as unknown[] | undefined)?.length ?? 0), 0), 0)

function inviteLinks(appUrl: string, rawToken: string, tenantName: string, ownerPhone: string) {
  const url = `${appUrl.replace(/\/$/, '')}/reset-password?token=${rawToken}&bienvenida=1`
  const text = `¡Hola! Ya creamos ${tenantName} en TakeasyGO. Activá tu cuenta y entrá a tu panel con este link (vale 7 días, una sola vez): ${url}`
  const digits = ownerPhone.replace(/\D/g, '')
  const phone = digits ? (digits.startsWith('54') ? digits : `54${digits.replace(/^0/, '')}`) : ''
  return { url, whatsappUrl: `https://wa.me/${phone}?text=${encodeURIComponent(text)}` }
}

async function summarize(tenantIdRaw: unknown, ownerEmail: string): Promise<ProvisionResult> {
  const tenantId = new mongoose.Types.ObjectId(String(tenantIdRaw))
  const tenant = await Tenant.findById(tenantId).select('name slug plan').lean<{ _id: unknown; name: string; slug: string; plan: string }>()
  const locations = await Location.find({ tenantId }).select('name slug').lean<{ _id: unknown; name: string; slug: string }[]>()
  const owner = await User.findOne({ email: ownerEmail }).select('_id').lean<{ _id: unknown }>()
  return {
    reused: true,
    tenant: { id: String(tenant?._id), name: tenant?.name ?? '', slug: tenant?.slug ?? '', plan: tenant?.plan ?? 'trial' },
    locations: locations.map(l => ({ id: String(l._id), name: l.name, slug: l.slug })),
    owner: { id: owner ? String(owner._id) : null, email: ownerEmail, existingAccount: false },
    invite: null,
    emailSent: false,
    menuItems: 0,
    warnings: ['Este alta ya se había hecho con este mismo envío: se muestra el comercio creado. Para un link nuevo, reenviá la invitación.'],
  }
}

export async function provisionTenant(rawInput: unknown, actor: ProvisionActor, deps: Deps = {}): Promise<ProvisionResult> {
  const parsed = provisionSchema.safeParse(rawInput)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new ProvisionError(400, 'invalid_input', issue.message)
  }
  const input = parsed.data
  const now = deps.now?.() ?? new Date()
  const geocode = deps.geocode ?? defaultGeocode
  const sendInvite = deps.sendInvite ?? defaultSendInvite
  const appUrl = deps.appUrl ?? process.env.APP_URL ?? 'http://localhost:3000'
  const warnings: string[] = []

  // ── Idempotencia ──────────────────────────────────────────────────────────
  const already = await Tenant.findOne({ 'provisioning.idempotencyKey': input.idempotencyKey }).select('_id').lean<{ _id: unknown }>()
  if (already) return summarize(already._id, input.owner.email)

  // ── Validaciones previas (antes de crear nada) ───────────────────────────
  const template = getRubroTemplate(input.rubro)
  const existingOwner = await User.findOne({ email: input.owner.email }).select('_id role isActive name').lean<{ _id: mongoose.Types.ObjectId; role: string; isActive?: boolean }>()
  if (existingOwner?.role === 'superadmin') throw new ProvisionError(400, 'owner_superadmin', 'Ese email es de un superadmin: usá el email del dueño.')
  if (existingOwner && input.organization.mode === 'none') {
    throw new ProvisionError(409, 'owner_exists', 'Ese email ya tiene una cuenta en TakeasyGO. Para sumarle esta marca, elegí o creá una organización (multimarca).')
  }

  let menuCategories: Category[] = []
  let menuSource: string = input.menu.source
  if (input.menu.source === 'json') {
    const menu = parseMenuJson(input.menu.json)
    if (!menu.ok) throw new ProvisionError(400, 'invalid_menu_json', `Carta (JSON): ${menu.error}`)
    menuCategories = menuJsonToCategories(menu.menu)
  } else if (input.menu.source === 'template') {
    menuCategories = templateCategories(template)
  }

  let cloneConfig: Record<string, unknown> = {}
  let cloneSourceTenant: { _id: mongoose.Types.ObjectId; cuisineTypes?: string[] } | null = null
  if (input.clone) {
    cloneSourceTenant = await Tenant.findById(input.clone.tenantId).select('_id cuisineTypes').lean()
    if (!cloneSourceTenant) throw new ProvisionError(404, 'clone_not_found', 'No encontramos el comercio a copiar.')
    const srcLoc = await Location.findOne({ tenantId: input.clone.tenantId, ...(input.clone.locationId ? { _id: input.clone.locationId } : {}) })
      .sort({ createdAt: 1 })
      .select('hours serviceHours timezone scheduledOrdersConfig settings deliveryConfig reservationConfig spaces')
      .lean<Record<string, unknown>>()
    if (!srcLoc && (input.clone.schedules || input.clone.orderModes)) throw new ProvisionError(404, 'clone_location_not_found', 'El comercio a copiar no tiene sedes.')
    const pick = (keys: string[]) => Object.fromEntries(keys.filter(k => srcLoc?.[k] !== undefined).map(k => [k, JSON.parse(JSON.stringify(srcLoc![k]))]))
    if (input.clone.schedules) Object.assign(cloneConfig, pick(['hours', 'serviceHours', 'timezone', 'scheduledOrdersConfig']))
    if (input.clone.orderModes) {
      Object.assign(cloneConfig, pick(['settings', 'deliveryConfig', 'reservationConfig', 'spaces']))
      const settings = cloneConfig.settings as Record<string, unknown> | undefined
      if (settings) delete settings.delayAnnouncement
    }
    cloneConfig = JSON.parse(JSON.stringify(cloneConfig, (k, v) => (k === '_id' ? undefined : v)))
    if (input.menu.source === 'clone') {
      if (input.clone.menu === 'none') menuCategories = []
      else menuCategories = await cloneCategories(input.clone.tenantId, input.clone.locationId, input.clone.menu === 'with_prices')
      menuSource = `clone:${input.clone.menu}`
    }
  }

  let existingOrg: { _id: mongoose.Types.ObjectId; name: string } | null = null
  if (input.organization.mode === 'existing') {
    existingOrg = await Organization.findOne({ _id: input.organization.orgId, status: 'active' }).select('_id name').lean()
    if (!existingOrg) throw new ProvisionError(404, 'org_not_found', 'No encontramos la organización.')
  }

  const slug = await resolveTenantSlug(input.name, input.slug)

  // ── Creación con deshacer ─────────────────────────────────────────────────
  const created: { tenantId?: mongoose.Types.ObjectId; userId?: mongoose.Types.ObjectId; locationIds: mongoose.Types.ObjectId[]; orgId?: mongoose.Types.ObjectId; membershipIds: mongoose.Types.ObjectId[] } = { locationIds: [], membershipIds: [] }
  let rawToken: string | null = null
  let menuItems = 0
  const locationsOut: ProvisionResult['locations'] = []

  try {
    const tenant = await Tenant.create({
      name: input.name,
      slug,
      plan: input.plan,
      isActive: true,
      status: 'active',
      isOperational: true,
      // Nace aprobado: no pasa por la revisión de /empezar.
      onboarding: { status: 'none', step: 1 },
      cuisineTypes: cloneSourceTenant?.cuisineTypes?.length ? cloneSourceTenant.cuisineTypes : template.cuisineTypes,
      branding: {
        primaryColor: input.branding.primaryColor ?? template.primaryColor,
        ...(input.branding.logoUrl ? { logoUrl: input.branding.logoUrl } : {}),
      },
      features: { ...NEW_TENANT_WHATSAPP_ORDER_LINK },
      provisioning: {
        idempotencyKey: input.idempotencyKey,
        by: actor.email || actor.name,
        at: now,
        rubro: template.id,
        menuSource,
        clonedFromTenantId: cloneSourceTenant?._id ?? null,
      },
    })
    created.tenantId = tenant._id

    // Dueño: cuenta nueva invitada (sin contraseña) o cuenta existente vía organización.
    if (!existingOwner) {
      rawToken = crypto.randomBytes(32).toString('hex')
      const user = await User.create({
        name: input.owner.name || input.name,
        email: input.owner.email,
        role: 'admin',
        tenantId: tenant._id,
        isActive: true,
        emailVerified: null,
        resetToken: sha256(rawToken),
        resetTokenExpiry: new Date(now.getTime() + INVITE_TTL_MS),
      })
      created.userId = user._id
    }

    // Sedes + menú de cada una.
    const slugs = uniqueLocationSlugs(input.locations)
    for (let i = 0; i < input.locations.length; i++) {
      const l = input.locations[i]
      const geo = await geocode(l.address).catch(() => null)
      if (!geo) warnings.push(`No pudimos ubicar en el mapa la dirección de «${l.name || slugs[i]}». Se guardó igual; corregila desde Configuración › Sedes.`)
      const location = await Location.create({
        ...(input.clone ? cloneConfig : { hours: template.hoursText, serviceHours: template.serviceHours }),
        tenantId: tenant._id,
        name: l.name || (i === 0 ? 'Sede Principal' : `Sede ${i + 1}`),
        slug: slugs[i],
        address: l.address,
        phone: l.phone || input.owner.phone || '',
        isActive: true,
        timezone: (cloneConfig.timezone as string | undefined) || 'America/Argentina/Buenos_Aires',
        ...(geo ? { geo: { type: 'Point', coordinates: [geo.lng, geo.lat] } } : {}),
      })
      created.locationIds.push(location._id)
      locationsOut.push({ id: String(location._id), name: location.name, slug: location.slug })
      await Menu.create({ tenantId: tenant._id, locationId: location._id, categories: menuCategories, isActive: true })
      if (i === 0) menuItems = countItems(menuCategories)
    }

    // Organización multimarca.
    if (input.organization.mode !== 'none') {
      let orgId: mongoose.Types.ObjectId
      if (input.organization.mode === 'new') {
        const orgSlug = await (async () => {
          const base = slugifyOrFallback(input.organization.mode === 'new' ? input.organization.name : '', input.organization.mode === 'new' ? input.organization.slug : '').slice(0, 50) || 'grupo'
          for (let n = 1; n <= 30; n++) {
            const c = n === 1 ? base : `${base.slice(0, 46)}-${n}`
            if (!(await Organization.exists({ slug: c }))) return c
          }
          throw new ProvisionError(409, 'org_slug_taken', 'No encontramos un enlace libre para la organización.')
        })()
        const org = await Organization.create({ name: input.organization.name, slug: orgSlug, createdBy: actor.userId && mongoose.Types.ObjectId.isValid(actor.userId) ? actor.userId : null })
        created.orgId = org._id
        orgId = org._id
      } else {
        orgId = existingOrg!._id
      }
      await Tenant.updateOne({ _id: tenant._id }, { $set: { organizationId: orgId } })

      if (existingOwner) {
        // El dueño ya tiene cuenta: se le da acceso a esta marca dentro de la organización.
        const isNewOrg = input.organization.mode === 'new'
        const membership = await OrgMembership.findOne({ organizationId: orgId, userId: existingOwner._id })
        if (membership && membership.status === 'active') {
          const scope = membership.scope as { allTenants?: boolean; tenantIds?: mongoose.Types.ObjectId[] } | undefined
          if (!scope?.allTenants) {
            await OrgMembership.updateOne({ _id: membership._id }, { $addToSet: { 'scope.tenantIds': tenant._id } })
            warnings.push('El dueño ya era miembro de la organización: se le sumó esta marca a su alcance.')
          }
        } else {
          const doc = await OrgMembership.create({
            organizationId: orgId,
            userId: existingOwner._id,
            orgRole: isNewOrg ? 'owner' : 'brand_manager',
            scope: isNewOrg ? { allTenants: true, tenantIds: [], locations: [] } : { allTenants: false, tenantIds: [tenant._id], locations: [] },
            tenantRole: 'admin',
            status: 'active',
            grantedBy: actor.userId && mongoose.Types.ObjectId.isValid(actor.userId) ? actor.userId : null,
            grantedAt: now,
          })
          created.membershipIds.push(doc._id)
        }
        if (isNewOrg) await Organization.updateOne({ _id: orgId }, { $set: { ownerUserId: existingOwner._id } }).catch(() => {})
      } else if (input.organization.mode === 'new') {
        warnings.push('Cuando el dueño active su cuenta, sumalo como dueño de la organización desde Superadmin › Organizaciones.')
      }
    }
  } catch (err) {
    // Deshacer en orden inverso. Cada borrado es independiente: si uno falla se sigue.
    const undo = async (fn: () => Promise<unknown>) => { try { await fn() } catch (e) { console.error('[provision] rollback step failed', e) } }
    if (created.membershipIds.length) await undo(() => OrgMembership.deleteMany({ _id: { $in: created.membershipIds } }))
    if (created.orgId) await undo(() => Organization.deleteOne({ _id: created.orgId }))
    if (created.locationIds.length) {
      await undo(() => Menu.deleteMany({ locationId: { $in: created.locationIds } }))
      await undo(() => Location.deleteMany({ _id: { $in: created.locationIds } }))
    }
    if (created.userId) await undo(() => User.deleteOne({ _id: created.userId }))
    if (created.tenantId) await undo(() => Tenant.deleteOne({ _id: created.tenantId }))
    if (err instanceof ProvisionError) throw err
    if ((err as { code?: number })?.code === 11000) {
      // Carrera con la misma clave: el otro envío ganó.
      const winner = await Tenant.findOne({ 'provisioning.idempotencyKey': input.idempotencyKey }).select('_id').lean<{ _id: unknown }>()
      if (winner) return summarize(winner._id, input.owner.email)
      throw new ProvisionError(409, 'conflict', 'Ya existe un dato con esos valores (enlace o email). Revisalos y probá de nuevo.')
    }
    console.error('[provision] error', err)
    throw new ProvisionError(500, 'provision_failed', 'No se pudo crear el comercio. No quedó nada a medias: podés intentarlo de nuevo.')
  }

  // ── Después de crear: invitación y auditoría (no deshacen el alta) ────────
  let invite: ProvisionResult['invite'] = null
  let emailSent = false
  if (rawToken) {
    const links = inviteLinks(appUrl, rawToken, input.name, input.owner.phone)
    invite = { ...links, expiresAt: new Date(now.getTime() + INVITE_TTL_MS).toISOString() }
    if (input.sendEmail) {
      try {
        await sendInvite(input.owner.email, input.name, links.url)
        emailSent = true
      } catch (e) {
        console.error('[provision] invite email failed', e)
        warnings.push('No se pudo enviar el email de invitación. Compartí el link por WhatsApp o reenvialo desde la ficha del comercio.')
      }
    }
  }

  await logAudit({
    tenantId: String(created.tenantId),
    action: 'tenant.provisioned',
    entity: 'tenant',
    entityId: String(created.tenantId),
    userId: actor.userId,
    userName: actor.name,
    userRole: 'superadmin',
    details: {
      slug, plan: input.plan, rubro: template.id, menuSource, menuItems,
      locations: locationsOut.length, organization: input.organization.mode,
      clonedFrom: cloneSourceTenant ? String(cloneSourceTenant._id) : null,
      ownerExistingAccount: Boolean(existingOwner), emailSent,
    },
  })

  return {
    reused: false,
    tenant: { id: String(created.tenantId), name: input.name, slug, plan: input.plan },
    locations: locationsOut,
    owner: { id: created.userId ? String(created.userId) : existingOwner ? String(existingOwner._id) : null, email: input.owner.email, existingAccount: Boolean(existingOwner) },
    invite,
    emailSent,
    menuItems,
    warnings,
  }
}

/**
 * Nuevo link de invitación para el dueño (el anterior deja de servir).
 * Solo si todavía no definió su contraseña.
 */
export async function regenerateInvite(tenantId: string, deps: Deps & { sendEmail?: boolean } = {}): Promise<{ url: string; whatsappUrl: string; expiresAt: string; emailSent: boolean; email: string }> {
  const now = deps.now?.() ?? new Date()
  const tenant = await Tenant.findById(tenantId).select('name').lean<{ name: string }>()
  if (!tenant) throw new ProvisionError(404, 'not_found', 'Comercio no encontrado.')
  const owner = await User.findOne({ tenantId, role: 'admin', isActive: true }).sort({ createdAt: 1 }).select('+password +resetToken +resetTokenExpiry')
  if (!owner) throw new ProvisionError(404, 'no_owner', 'El comercio no tiene un administrador para invitar.')
  if (owner.password) throw new ProvisionError(409, 'already_active', 'El dueño ya activó su cuenta. Si no puede entrar, que use «Olvidé mi contraseña».')
  const raw = crypto.randomBytes(32).toString('hex')
  owner.resetToken = sha256(raw)
  owner.resetTokenExpiry = new Date(now.getTime() + INVITE_TTL_MS)
  await owner.save()
  const links = inviteLinks(deps.appUrl ?? process.env.APP_URL ?? 'http://localhost:3000', raw, tenant.name, (owner as { phone?: string }).phone ?? '')
  let emailSent = false
  if (deps.sendEmail !== false) {
    try {
      await (deps.sendInvite ?? defaultSendInvite)(owner.email, tenant.name, links.url)
      emailSent = true
    } catch (e) {
      console.error('[provision] resend invite failed', e)
    }
  }
  return { ...links, expiresAt: new Date(now.getTime() + INVITE_TTL_MS).toISOString(), emailSent, email: owner.email }
}
