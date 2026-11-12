import { posApi } from "../pos-api"
import { offlineStore } from "./store"
import { getOfflineStatus, setCachedDeviceId, setOfflineStatus } from "./status"
import type { OfflineEligibility } from "./types"

// ============================================================================
// Este equipo: identidad y habilitación para operar sin internet
// ============================================================================
// El `deviceId` es un UUID que se crea la primera vez y vive en Dexie. El
// server decide si el equipo puede operar offline (tope por plan). La última
// respuesta se guarda: sin red, el equipo sigue habilitado hasta 7 días desde
// la última consulta buena (un equipo revocado lo sabe al reconectar).
// ============================================================================

const DEVICE_KEY = "deviceId"
const eligibilityKey = (tenantId: string) => `eligibility:${tenantId}`
const TRUST_OFFLINE_MS = 7 * 24 * 60 * 60 * 1000

export async function getDeviceId(): Promise<string> {
  const store = offlineStore()
  let id = await store.getMeta<string>(DEVICE_KEY)
  if (!id) {
    id = crypto.randomUUID()
    await store.setMeta(DEVICE_KEY, id)
  }
  setCachedDeviceId(id)
  return id
}

function applyToStatus(e: OfflineEligibility | undefined): void {
  setOfflineStatus({ enabled: Boolean(e?.enabled), role: e?.enabled ? e.role : null })
}

export async function getCachedEligibility(tenantId: string): Promise<OfflineEligibility | undefined> {
  return offlineStore().getMeta<OfflineEligibility>(eligibilityKey(tenantId))
}

/** ¿Puede operar sin internet AHORA? (con lo último que dijo el server). */
export async function isOfflineEnabled(tenantId: string, now = Date.now()): Promise<boolean> {
  const e = await getCachedEligibility(tenantId)
  if (!e?.enabled) return false
  return now - new Date(e.checkedAt).getTime() <= TRUST_OFFLINE_MS
}

interface DevicesResponse {
  limit: number
  devices: { deviceId: string; name: string; role: "primary" | "secondary"; lastSeenAt: string | null; enabledAt: string }[]
  thisDevice: { enabled: boolean; role: "primary" | "secondary" | null; name: string | null }
}

/** Consulta al server y guarda la respuesta. Sin red, devuelve la guardada. */
export async function refreshEligibility(tenantId: string): Promise<OfflineEligibility | undefined> {
  await getDeviceId()
  try {
    const res = await posApi<DevicesResponse>(tenantId, "/offline/devices")
    const e: OfflineEligibility = {
      enabled: res.thisDevice.enabled,
      role: res.thisDevice.role,
      name: res.thisDevice.name,
      limit: res.limit,
      checkedAt: new Date().toISOString(),
    }
    await offlineStore().setMeta(eligibilityKey(tenantId), e)
    applyToStatus(e)
    return e
  } catch {
    const cached = await getCachedEligibility(tenantId)
    applyToStatus(cached && (await isOfflineEnabled(tenantId)) ? cached : undefined)
    return cached
  }
}

/** Lista de equipos habilitados de la sede (pantalla de Configuración). */
export async function listOfflineDevices(tenantId: string): Promise<DevicesResponse> {
  await getDeviceId()
  return posApi<DevicesResponse>(tenantId, "/offline/devices")
}

/** Habilita ESTE equipo (admin/encargado). */
export async function enableThisDevice(tenantId: string, name: string): Promise<OfflineEligibility | undefined> {
  const deviceId = await getDeviceId()
  await posApi(tenantId, "/offline/devices", { method: "POST", body: { deviceId, name } })
  await requestPersistentStorage()
  return refreshEligibility(tenantId)
}

/** Revoca un equipo (por defecto, este). */
export async function revokeDevice(tenantId: string, deviceId?: string): Promise<void> {
  const id = deviceId ?? (await getDeviceId())
  await posApi(tenantId, "/offline/devices", { method: "DELETE", query: { deviceId: id } })
  if (!deviceId || deviceId === (await getDeviceId())) await refreshEligibility(tenantId)
}

/**
 * Pide al navegador que NO borre los datos de este sitio (ventas sin mandar).
 * Chrome lo concede a una PWA instalada. Devuelve si quedó persistente.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

/** Solo para la UI: lo que dice el estado en memoria. */
export function isEnabledInMemory(): boolean {
  return getOfflineStatus().enabled
}
