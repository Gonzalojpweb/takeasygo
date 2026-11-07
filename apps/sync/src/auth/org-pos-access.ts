import mongoose from "mongoose"
import { effectiveGrant, type OrgGrant, type OrgGrantRole } from "@takeasygo/business"

// ============================================================================
// POS multimarca (D6): ¿esta persona puede operar el POS de esta marca por
// su membresía de organización?
// ============================================================================
// Se usa en el login por PIN y en la renovación del token del hub, solo para
// los PIN de miembro (pos_credentials). Los empleados de la marca siguen por
// su User como siempre.
//
// Interruptores (falla cerrado: sin base o ante un error, apagado):
//   · pos.multiBrand — POS_MULTIBRAND_MODE (on|off, manda) o
//                      PlatformConfig.posMultiBrand. Apagado por defecto.
//   · org.access     — ORG_ACCESS_MODE o PlatformConfig.orgAccess; tiene que
//                      estar en enforce (es el que da acceso por membresía).
// La regla rol→marca es la misma del SaaS (@takeasygo/business → org-grant).
// Lee las colecciones del SaaS directamente (organizations, org_memberships,
// tenants, platformconfigs): el Sync no define esos modelos.
// ============================================================================

const TTL_MS = 15_000
let cached: { at: number; on: boolean } | null = null

export function __resetOrgPosCacheForTests(): void {
  cached = null
}

/** ¿Están prendidos pos.multiBrand y org.access = enforce? */
export async function posMultiBrandEnabled(): Promise<boolean> {
  const envPos = process.env.POS_MULTIBRAND_MODE?.trim().toLowerCase()
  const envOrg = process.env.ORG_ACCESS_MODE?.trim().toLowerCase()
  if (envPos === "off" || (envOrg && envOrg !== "enforce")) return false
  if (envPos === "on" && envOrg === "enforce") return true
  if (cached && Date.now() - cached.at < TTL_MS) return cached.on
  try {
    if (mongoose.connection.readyState !== 1) return false
    const doc = await mongoose.connection
      .collection("platformconfigs")
      .findOne({ _id: "platform" as unknown as mongoose.Types.ObjectId }, { projection: { posMultiBrand: 1, orgAccess: 1 } })
    const posOn = envPos === "on" || doc?.posMultiBrand === "on"
    const orgOn = envOrg === "enforce" || doc?.orgAccess === "enforce"
    const on = posOn && orgOn
    cached = { at: Date.now(), on }
    return on
  } catch {
    return false
  }
}

const OID = /^[a-f0-9]{24}$/i

/**
 * Lo que da la membresía de `userId` en la marca `tenantId`, o null:
 * marca sin organización o dada de baja, organización no activa, sin
 * membresía activa o fuera de su alcance.
 */
export async function membershipGrant(userId: string, tenantId: string): Promise<OrgGrant | null> {
  if (!OID.test(userId) || !OID.test(tenantId)) return null
  const db = mongoose.connection
  const tenant = await db.collection("tenants").findOne(
    { _id: new mongoose.Types.ObjectId(tenantId) },
    { projection: { organizationId: 1, status: 1, isActive: 1 } }
  )
  if (!tenant?.organizationId || tenant.status === "deleted" || tenant.isActive === false) return null
  const org = await db.collection("organizations").findOne(
    { _id: tenant.organizationId, status: "active" },
    { projection: { _id: 1 } }
  )
  if (!org) return null
  const m = await db.collection("org_memberships").findOne(
    { organizationId: org._id, userId: new mongoose.Types.ObjectId(userId), status: "active" },
    { projection: { orgRole: 1, status: 1, tenantRole: 1, scope: 1 } }
  )
  if (!m) return null
  const scope = (m.scope ?? {}) as { allTenants?: boolean; tenantIds?: unknown[]; locations?: { tenantId: unknown; locationId: unknown }[] }
  return effectiveGrant(
    {
      orgRole: m.orgRole as OrgGrantRole,
      status: String(m.status),
      tenantRole: (m.tenantRole as "admin" | "manager" | null | undefined) ?? null,
      scope: {
        allTenants: Boolean(scope.allTenants),
        tenantIds: (scope.tenantIds ?? []).map(String),
        locations: (scope.locations ?? []).map((l) => ({ tenantId: String(l.tenantId), locationId: String(l.locationId) })),
      },
    },
    tenantId
  )
}

/**
 * Sede del token para un grant: con sedes restringidas, la pedida tiene que
 * ser una de ellas (si no pidió y tiene una sola, esa). undefined = no puede.
 */
export function grantLocation(grant: OrgGrant, requested: string | null | undefined): string | null | undefined {
  if (grant.locationIds.length === 0) return requested ?? null
  if (requested) return grant.locationIds.includes(requested) ? requested : undefined
  return grant.locationIds.length === 1 ? grant.locationIds[0] : undefined
}
