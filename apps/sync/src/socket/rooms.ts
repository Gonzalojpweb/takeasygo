import type { JwtPayload } from "@takeasygo/types"

// ============================================================================
// Salas (rooms) por conexión — aislamiento de sockets multisede.
//
// Regla (Oleada 1, ya vigente en producción):
//   - Toda conexión entra a su sala genérica de dispositivo
//     `tenant:{tenantId}:{deviceType}` (hub re-sync, pairing, etc.).
//   - POS multi-sede (payload.locationId presente): entra SOLO a
//     `tenant:{tenantId}:location:{locationId}`. NO entra a `tenant:{tenantId}`,
//     así no recibe pedidos de otras sedes.
//   - POS single-sede legacy (sin locationId): entra a `tenant:{tenantId}` y
//     recibe el comportamiento actual (todas las sedes).
//
// Esta función aísla la decisión de salas para poder testearla sin levantar
// un SocketServer real. Ver apps/sync/scripts/e-validate/socket-isolation.ts
// para la validación E2E contra staging.
// ============================================================================

export type SocketRoomScope = Pick<JwtPayload, "tenantId" | "deviceType"> & {
  locationId?: string | null
}

export function resolveSocketRooms(payload: SocketRoomScope): string[] {
  const rooms = [`tenant:${payload.tenantId}:${payload.deviceType}`]
  if (payload.locationId) {
    rooms.push(`tenant:${payload.tenantId}:location:${payload.locationId}`)
  } else {
    rooms.push(`tenant:${payload.tenantId}`)
  }
  return rooms
}

/** Salas de difusión usadas por los workers/rutas al emitir eventos de pedido. */
export function orderBroadcastRooms(tenantId: string, locationId?: string | null): string[] {
  const rooms = [`tenant:${tenantId}`]
  if (locationId) rooms.push(`tenant:${tenantId}:location:${locationId}`)
  return rooms
}
