import { getDeviceId, refreshEligibility } from "./device"
import { refreshOfflineCounts, replayOfflineOps } from "./replay"
import { getOfflineStatus, markOffline, onBackOnline } from "./status"
import { probeServer } from "../pos-api"
import { currentPosUser } from "./offline-auth"

// ============================================================================
// Vigilancia de la conexión y envío automático de la cola
// ============================================================================
// · Al arrancar: identidad del equipo, habilitación y contador de la cola.
// · Sin conexión: cada 10 s consulta al server (la misma consulta de
//   habilitación sirve de «ping»). Cuando responde, manda la cola.
// · Con conexión y cola pendiente: reintenta cada 20 s (un 5xx o un «en curso»
//   corta el envío y se retoma solo).
// · Eventos del navegador online/offline aceleran la detección.
// ============================================================================

const PING_OFFLINE_MS = 10_000
const RETRY_PENDING_MS = 20_000

let timer: ReturnType<typeof setInterval> | null = null
let tenant: string | null = null
let unsubscribe: (() => void) | null = null
let onWindowOnline: (() => void) | null = null
let onWindowOffline: (() => void) | null = null

async function tick(): Promise<void> {
  const tenantId = tenant
  if (!tenantId) return
  const s = getOfflineStatus()
  if (!s.online) {
    // Ingreso sin internet (etapa 7): no hay token, así que se sondea sin
    // credenciales; al responder, el POS pide el PIN para un token real.
    if (currentPosUser().offline) await probeServer(tenantId)
    else await refreshEligibility(tenantId) // si responde, pos-api marca online → onBackOnline
    return
  }
  if (s.pending > 0 && !s.syncing) await replayOfflineOps(tenantId).catch(() => {})
}

export async function startOfflineMonitor(tenantId: string): Promise<void> {
  stopOfflineMonitor()
  tenant = tenantId
  await getDeviceId()
  await refreshOfflineCounts(tenantId)
  await refreshEligibility(tenantId)

  unsubscribe = onBackOnline(() => {
    if (!tenant) return
    void refreshEligibility(tenant)
    void replayOfflineOps(tenant).catch(() => {})
  })

  if (typeof window !== "undefined") {
    onWindowOnline = () => void tick()
    onWindowOffline = () => markOffline()
    window.addEventListener("online", onWindowOnline)
    window.addEventListener("offline", onWindowOffline)
  }

  timer = setInterval(() => {
    const s = getOfflineStatus()
    // Con red y sin cola no hace falta hacer nada.
    if (s.online && s.pending === 0) return
    void tick()
  }, Math.min(PING_OFFLINE_MS, RETRY_PENDING_MS))

  if (getOfflineStatus().online && getOfflineStatus().pending > 0) void replayOfflineOps(tenantId).catch(() => {})
}

export function stopOfflineMonitor(): void {
  if (timer) clearInterval(timer)
  timer = null
  unsubscribe?.()
  unsubscribe = null
  if (typeof window !== "undefined") {
    if (onWindowOnline) window.removeEventListener("online", onWindowOnline)
    if (onWindowOffline) window.removeEventListener("offline", onWindowOffline)
  }
  onWindowOnline = null
  onWindowOffline = null
  tenant = null
}
