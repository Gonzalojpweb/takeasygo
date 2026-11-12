// ============================================================================
// Estado offline del POS — en memoria, síncrono, sin dependencias
// ============================================================================
// Lo leen la UI (useOfflineStatus), pos-api (para marcar online/offline según
// responda el server) y el polling (que no escribe mientras haya operaciones
// sin mandar: pisaría lo que el equipo hizo sin internet con datos viejos).
// No importa nada del POS a propósito: así nadie arma un ciclo de imports.
// ============================================================================

export interface OfflineStatus {
  /** ¿El server del POS responde? (no es navigator.onLine: puede haber Wi-Fi sin internet). */
  online: boolean
  /** Operaciones esperando para mandarse. */
  pending: number
  /** Operaciones que el server rechazó y hay que revisar. */
  conflicts: number
  /** Se está mandando la cola. */
  syncing: boolean
  /** Este equipo está habilitado para operar sin internet. */
  enabled: boolean
  role: "primary" | "secondary" | null
  /** ISO del último envío completo de la cola. */
  lastSyncAt: string | null
}

let state: OfflineStatus = {
  online: typeof navigator === "undefined" ? true : navigator.onLine !== false,
  pending: 0,
  conflicts: 0,
  syncing: false,
  enabled: false,
  role: null,
  lastSyncAt: null,
}

let deviceId: string | null = null
const listeners = new Set<() => void>()
const onlineListeners = new Set<() => void>()

export function getOfflineStatus(): OfflineStatus {
  return state
}

export function subscribeOfflineStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Se dispara cada vez que el server vuelve a responder (para mandar la cola). */
export function onBackOnline(listener: () => void): () => void {
  onlineListeners.add(listener)
  return () => onlineListeners.delete(listener)
}

export function setOfflineStatus(patch: Partial<OfflineStatus>): void {
  const next = { ...state, ...patch }
  const changed = (Object.keys(next) as (keyof OfflineStatus)[]).some((k) => next[k] !== state[k])
  if (!changed) return
  const cameBack = !state.online && next.online
  state = next
  for (const l of listeners) l()
  if (cameBack) for (const l of onlineListeners) l()
}

export function markOnline(): void {
  if (!state.online) setOfflineStatus({ online: true })
}

export function markOffline(): void {
  if (state.online) setOfflineStatus({ online: false })
}

/** ¿Hay escrituras hechas sin internet que el server todavía no tiene? */
export function hasUnsyncedOps(): boolean {
  return state.pending > 0 || state.conflicts > 0
}

export function setCachedDeviceId(id: string | null): void {
  deviceId = id
}

export function getCachedDeviceId(): string | null {
  return deviceId
}

/** Solo tests. */
export function __resetOfflineStatusForTests(): void {
  state = { online: true, pending: 0, conflicts: 0, syncing: false, enabled: false, role: null, lastSyncAt: null }
  deviceId = null
  listeners.clear()
  onlineListeners.clear()
}
