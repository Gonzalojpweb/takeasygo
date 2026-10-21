// ============================================================================
// page-scope.ts — Alcance de sede para páginas server-side del admin
// ============================================================================
// Las páginas (server components) consultan la DB directo, sin pasar por las
// APIs: tienen que aplicar el mismo alcance que las rutas. Un usuario con
// sedes asignadas solo recibe datos de sus sedes; uno de tenant, todo.
//
// Usa getSessionUser (permisos frescos de la DB), no los claims del JWT.
// ============================================================================

import mongoose from 'mongoose'
import { getSessionUser } from '@/lib/apiAuth'

export interface PageScope {
  /** Sedes del usuario; null = usuario de tenant (ve todas). */
  locationIds: string[] | null
  /** Para filtrar colecciones con `locationId` (find y aggregate). */
  locationFilter: { locationId?: { $in: mongoose.Types.ObjectId[] } }
  /** Para filtrar la colección de sedes (`_id`). */
  sedeFilter: { _id?: { $in: mongoose.Types.ObjectId[] } }
  /** Para recursos compartidos con override (locationId null = todas). */
  sharedFilter: { locationId?: { $in: Array<mongoose.Types.ObjectId | null> } }
  isScoped: boolean
}

export async function getPageScope(): Promise<PageScope> {
  const user = await getSessionUser()
  const scoped = user && user.role !== 'superadmin' ? (user.assignedLocations ?? []).map(String) : []
  if (scoped.length === 0) {
    return { locationIds: null, locationFilter: {}, sedeFilter: {}, sharedFilter: {}, isScoped: false }
  }
  const ids = scoped.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id))
  return {
    locationIds: scoped,
    locationFilter: { locationId: { $in: ids } },
    sedeFilter: { _id: { $in: ids } },
    sharedFilter: { locationId: { $in: [...ids, null] } },
    isScoped: true,
  }
}

/**
 * Sede para mandar al cliente: sin el hash del token del agente de impresión
 * (secreto) ni credenciales de integraciones.
 */
export function sanitizeLocationForClient<T extends Record<string, unknown>>(location: T): T {
  const { printerAgent, rapiboyConfig, ...rest } = location as Record<string, unknown>
  const agent = printerAgent as { secretHash?: unknown } | undefined
  const out: Record<string, unknown> = { ...rest }
  if (agent) {
    const { secretHash: _secret, ...publicAgent } = agent as Record<string, unknown>
    out.printerAgent = { ...publicAgent, hasToken: Boolean(_secret) }
  }
  if (rapiboyConfig) {
    const { apiToken, webhookSecret, ...publicRapiboy } = rapiboyConfig as Record<string, unknown>
    out.rapiboyConfig = { ...publicRapiboy, hasApiToken: Boolean(apiToken), hasWebhookSecret: Boolean(webhookSecret) }
  }
  return out as T
}
