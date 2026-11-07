/**
 * lib/fiscal/pos-claims.ts — CUIT + punto de venta únicos entre comercios
 * (multi-marca PR 6).
 *
 * Interruptores (PlatformConfig, o variable de entorno que manda):
 *   · fiscal.posClaims  (FISCAL_POS_CLAIMS_MODE: off | enforce)
 *       off     → el guardado del perfil fiscal es idéntico a hoy.
 *       enforce → guardar toma los puntos de venta del CUIT; si otro
 *                 comercio ya usa uno, 409 y no se guarda nada.
 *     Antes de pasar a enforce hay que correr el backfill
 *     (scripts/fiscal-pos-claims-backfill.ts) para registrar los actuales.
 *   · fiscal.csrAliasShared (FISCAL_CSR_ALIAS_SHARED: off | on)
 *       on → si otro comercio ya tiene el mismo CUIT, el pedido de
 *            certificado usa CN=takeasygo-{CUIT}-{slug} (S6). Validar en
 *            homologación con dos marcas antes de prenderlo.
 * Ambos apagados por defecto. Caché de 15 s; sin base: apagado, sin guardar.
 *
 * Sin transacciones (mismo criterio que organizaciones): se insertan los
 * claims nuevos uno por uno contra el índice único; ante un choque se
 * devuelven los recién tomados y se informa. Los que el comercio ya no usa
 * se sueltan recién después de tomar todos los nuevos.
 */
import mongoose from 'mongoose'
import FiscalPosClaim, { type PosClaimKind } from '@/models/FiscalPosClaim'

const TTL_MS = 15_000

export type PosClaimsMode = 'off' | 'enforce'
export type CsrAliasMode = 'off' | 'on'

const cache: { claims?: { at: number; v: PosClaimsMode }; alias?: { at: number; v: CsrAliasMode } } = {}

export function clearFiscalFlagsCache(): void {
  delete cache.claims
  delete cache.alias
}

async function readFlag<T extends string>(field: 'fiscalPosClaims' | 'fiscalCsrAliasShared', allowed: readonly T[], fallback: T): Promise<{ v: T; cacheable: boolean }> {
  try {
    if (mongoose.connection.readyState !== 1) return { v: fallback, cacheable: false }
    const PlatformConfig = (await import('@/models/PlatformConfig')).default
    const doc = await PlatformConfig.findById('platform').select(field).lean<Record<string, unknown>>()
    const raw = doc?.[field]
    return { v: (allowed as readonly unknown[]).includes(raw) ? (raw as T) : fallback, cacheable: true }
  } catch {
    return { v: fallback, cacheable: false }
  }
}

export async function getPosClaimsMode(): Promise<PosClaimsMode> {
  const env = process.env.FISCAL_POS_CLAIMS_MODE?.trim().toLowerCase()
  if (env === 'off' || env === 'enforce') return env
  if (cache.claims && Date.now() - cache.claims.at < TTL_MS) return cache.claims.v
  const { v, cacheable } = await readFlag('fiscalPosClaims', ['off', 'enforce'] as const, 'off')
  if (cacheable) cache.claims = { at: Date.now(), v }
  return v
}

export async function getCsrAliasMode(): Promise<CsrAliasMode> {
  const env = process.env.FISCAL_CSR_ALIAS_SHARED?.trim().toLowerCase()
  if (env === 'off' || env === 'on') return env
  if (cache.alias && Date.now() - cache.alias.at < TTL_MS) return cache.alias.v
  const { v, cacheable } = await readFlag('fiscalCsrAliasShared', ['off', 'on'] as const, 'off')
  if (cacheable) cache.alias = { at: Date.now(), v }
  return v
}

export interface WantedPos {
  pointOfSale: number
  kind: PosClaimKind
  locationId: string
}

export interface PosClaimInput {
  tenantId: string
  cuit: string
  environment: 'homologation' | 'production'
  regular: { number: number; locationId: string }[]
  contingency: { number: number; locationId: string }[]
}

export type SyncResult =
  | { ok: true; taken: number; released: number }
  | { ok: false; pointOfSale: number; otherTenantId: string }

/** Puntos de venta que el comercio quiere tener con este CUIT y ambiente. Puro. */
export function wantedPos(input: Pick<PosClaimInput, 'regular' | 'contingency'>): WantedPos[] {
  const byNumber = new Map<number, WantedPos>()
  for (const p of input.regular) byNumber.set(p.number, { pointOfSale: p.number, kind: 'regular', locationId: p.locationId })
  for (const p of input.contingency) if (!byNumber.has(p.number)) byNumber.set(p.number, { pointOfSale: p.number, kind: 'contingency', locationId: p.locationId })
  return [...byNumber.values()]
}

const isDup = (err: unknown) => (err as { code?: number })?.code === 11000

/**
 * Deja los claims del comercio iguales a su perfil. Con CUIT vacío suelta
 * todo. Un cambio de CUIT o de ambiente suelta los del valor anterior.
 */
export async function syncPosClaims(input: PosClaimInput): Promise<SyncResult> {
  const tenantId = new mongoose.Types.ObjectId(input.tenantId)
  const cuit = input.cuit.trim()
  const wanted = cuit ? wantedPos(input) : []
  const mine = await FiscalPosClaim.find({ tenantId }).lean<{ _id: mongoose.Types.ObjectId; cuit: string; environment: string; pointOfSale: number }[]>()
  const key = (c: { cuit: string; environment: string; pointOfSale: number }) => `${c.cuit}|${c.environment}|${c.pointOfSale}`
  const mineKeys = new Set(mine.map(key))

  const takenNow: mongoose.Types.ObjectId[] = []
  for (const w of wanted) {
    const k = key({ cuit, environment: input.environment, pointOfSale: w.pointOfSale })
    if (mineKeys.has(k)) {
      await FiscalPosClaim.updateOne(
        { tenantId, cuit, environment: input.environment, pointOfSale: w.pointOfSale },
        { $set: { kind: w.kind, locationId: new mongoose.Types.ObjectId(w.locationId) } },
      )
      continue
    }
    try {
      const doc = await FiscalPosClaim.create({
        cuit, environment: input.environment, pointOfSale: w.pointOfSale, kind: w.kind,
        tenantId, locationId: new mongoose.Types.ObjectId(w.locationId),
      })
      takenNow.push(doc._id as mongoose.Types.ObjectId)
    } catch (err) {
      if (!isDup(err)) throw err
      if (takenNow.length) await FiscalPosClaim.deleteMany({ _id: { $in: takenNow } })
      const other = await FiscalPosClaim.findOne({ cuit, environment: input.environment, pointOfSale: w.pointOfSale })
        .select('tenantId').lean<{ tenantId: unknown }>()
      return { ok: false, pointOfSale: w.pointOfSale, otherTenantId: String(other?.tenantId ?? '') }
    }
  }

  const wantedKeys = new Set(wanted.map(w => key({ cuit, environment: input.environment, pointOfSale: w.pointOfSale })))
  const release = mine.filter(c => !wantedKeys.has(key(c))).map(c => c._id)
  if (release.length) await FiscalPosClaim.deleteMany({ _id: { $in: release }, tenantId })
  return { ok: true, taken: takenNow.length, released: release.length }
}

/** ¿Otro comercio ya tiene este CUIT? (alias de CSR, S6). */
export async function cuitSharedWithOtherTenant(tenantId: string, cuit: string): Promise<boolean> {
  if (!cuit) return false
  const FiscalProfile = (await import('@/models/FiscalProfile')).default
  return Boolean(await FiscalProfile.exists({ cuit, tenantId: { $ne: new mongoose.Types.ObjectId(tenantId) } }))
}

/** CN del pedido de certificado: con alias por marca solo si el CUIT es compartido. */
export function csrAlias(cuit: string, slug: string, shared: boolean): string | undefined {
  if (!shared) return undefined
  return `takeasygo-${cuit}-${slug}`.slice(0, 60)
}
