import { posApi } from "./pos-api"

// ============================================================================
// Club en el POS (Fase 4, 29/10/2026): socio por celular y canjes a entregar.
// El código del canje lo trae el cliente; el POS nunca lo recibe.
// ============================================================================

export interface ClubMember {
  id: string
  name: string
  points: number
  tier: string | null
}

export interface ClubRedemption {
  id: string
  item: string
  pointsUsed: number
  expiresAt: string | null
  createdAt: string
}

export interface ClubLookup {
  member: ClubMember | null
  redemptions: ClubRedemption[]
}

export function lookupClubMember(tenantId: string, phone: string): Promise<ClubLookup> {
  return posApi<ClubLookup>(tenantId, "/club", { query: { phone } })
}

export function claimRedemption(tenantId: string, id: string, code: string): Promise<{ ok: true }> {
  return posApi(tenantId, `/club/redemptions/${encodeURIComponent(id)}`, { method: "POST", body: { code } })
}
