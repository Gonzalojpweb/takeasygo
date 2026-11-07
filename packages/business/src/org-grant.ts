// ============================================================================
// Qué da una membresía de organización en una marca (multi-marca)
// ============================================================================
// Regla única que usan el SaaS (proyección de sesiones, /grupo, panel del
// grupo) y el Sync (login del POS con PIN en otra marca). Pura: sin base.
//
// Tabla (diseño §4): cada rol de organización se traduce, por marca, a un rol
// de comercio que ya existe:
//   owner, org_admin        → admin
//   brand_manager           → manager (o admin si tenantRole = 'admin')
//   location_manager        → manager, solo en sus sedes
//   operations              → operations_manager, solo en sus sedes
//   accountant              → auditor (solo lectura)
// Un rol de sede NUNCA devuelve locationIds = [] (que significa «todas»).
// ============================================================================

export type OrgGrantRole = "owner" | "org_admin" | "brand_manager" | "location_manager" | "operations" | "accountant"
export type GrantLocationRole = "admin" | "manager" | "operations_manager" | "auditor"

export interface MembershipForGrant {
  orgRole: OrgGrantRole
  status: string
  tenantRole?: "admin" | "manager" | null
  scope: { allTenants: boolean; tenantIds: string[]; locations: { tenantId: string; locationId: string }[] }
}

export interface OrgGrant {
  role: GrantLocationRole
  /** [] = todas las sedes del comercio. Nunca [] para roles de sede. */
  locationIds: string[]
}

export function effectiveLocationRole(orgRole: OrgGrantRole, tenantRole?: "admin" | "manager" | null): GrantLocationRole {
  switch (orgRole) {
    case "owner":
    case "org_admin":
      return "admin"
    case "brand_manager":
      return tenantRole === "admin" ? "admin" : "manager"
    case "location_manager":
      return "manager"
    case "operations":
      return "operations_manager"
    case "accountant":
      return "auditor"
  }
}

export function effectiveGrant(m: MembershipForGrant, tenantId: string): OrgGrant | null {
  if (m.status !== "active") return null
  const covers = m.scope.allTenants || m.scope.tenantIds.includes(tenantId)
  switch (m.orgRole) {
    case "owner":
      return { role: effectiveLocationRole("owner"), locationIds: [] }
    case "org_admin":
    case "accountant":
      return covers ? { role: effectiveLocationRole(m.orgRole), locationIds: [] } : null
    case "brand_manager":
      // Nunca por allTenants: el gerente de marca es por marca concreta.
      return m.scope.tenantIds.includes(tenantId)
        ? { role: effectiveLocationRole("brand_manager", m.tenantRole), locationIds: [] }
        : null
    case "location_manager":
    case "operations": {
      const locs = [...new Set(m.scope.locations.filter(l => l.tenantId === tenantId).map(l => l.locationId))]
      if (locs.length === 0) return null // nunca [] = «todas» por accidente
      return { role: effectiveLocationRole(m.orgRole), locationIds: locs }
    }
    default:
      return null
  }
}
