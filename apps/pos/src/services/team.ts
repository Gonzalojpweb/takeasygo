import { posApi } from "./pos-api"

// ============================================================================
// Usuario y Equipo (Fase 3, 29/10/2026). Los PIN los genera el server y
// llegan UNA sola vez: no se guardan en el POS.
// ============================================================================

export interface MyProfile {
  name: string
  role: string
  posRole: string | null
  locationName: string
  hasPin: boolean
  posPinUpdatedAt: string | null
  closes: { posId: string; openedAt: string; closedAt: string; shiftName: string | null; shiftDate: string | null }[]
}

export interface TeamMember {
  id: string
  name: string
  role: string
  posRole: string | null
  isActive: boolean
  hasPin: boolean
  posPinUpdatedAt: string | null
  allSedes: boolean
  webAccess: boolean
  isMe: boolean
  canManage: boolean
}

export type CreatableRole = "waiter" | "cashier" | "manager"

export function getMyProfile(tenantId: string): Promise<MyProfile> {
  return posApi<MyProfile>(tenantId, "/me")
}

export function changeMyPin(tenantId: string, currentPin?: string): Promise<{ pin: string }> {
  return posApi(tenantId, "/me/pin", { method: "POST", body: currentPin ? { currentPin } : {} })
}

export async function listTeam(tenantId: string): Promise<TeamMember[]> {
  return (await posApi<{ team: TeamMember[] }>(tenantId, "/team")).team
}

export function createMember(tenantId: string, name: string, role: CreatableRole): Promise<{ member: TeamMember; pin: string }> {
  return posApi(tenantId, "/team", { method: "POST", body: { name, role } })
}

export function resetMemberPin(tenantId: string, id: string): Promise<{ pin: string }> {
  return posApi(tenantId, `/team/${encodeURIComponent(id)}/pin`, { method: "POST" })
}

export async function updateMember(tenantId: string, id: string, patch: { name?: string; isActive?: boolean }): Promise<TeamMember> {
  return (await posApi<{ member: TeamMember }>(tenantId, `/team/${encodeURIComponent(id)}`, { method: "PATCH", body: patch })).member
}
