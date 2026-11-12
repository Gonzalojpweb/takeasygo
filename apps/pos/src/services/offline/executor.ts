import { isPosApiError, PosApiError } from "../pos-api"
import { isOfflineEnabled } from "./device"
import { refreshOfflineCounts, replayOfflineOps } from "./replay"
import { offlineStore } from "./store"
import { getOfflineStatus, markOffline } from "./status"
import type { OfflineOp, OfflineOpMethod } from "./types"

// ============================================================================
// Ejecutor «online si se puede, offline si hace falta»
// ============================================================================
// Cada escritura del POS que puede hacerse sin internet pasa por acá:
//
//   1. Se genera el opId ANTES del primer intento y viaja también online
//      (X-Pos-Op-Id). Si la red se corta después de que el server aplicó, el
//      reenvío offline usa el mismo opId y el server no la aplica dos veces.
//   2. Con red y sin cola pendiente → server-first, exactamente como hoy.
//   3. Sin red (o con operaciones esperando, para no desordenarlas) y el
//      equipo habilitado → se aplica en Dexie y se encola, todo en UNA
//      transacción. Después se intenta mandar la cola.
//   4. Sin red y equipo NO habilitado → el mismo error de red de siempre.
// ============================================================================

export interface OfflineRequest {
  method: OfflineOpMethod
  path: string
  body?: unknown
  idempotencyKey?: string
}

export interface OfflineAwareParams<T> {
  tenantId: string
  kind: string
  label: string
  request: OfflineRequest
  entityKeys: string[]
  /** El camino online de siempre; recibe los headers de la operación. */
  online: (headers: Record<string, string>) => Promise<T>
  /** Escritura local equivalente (solo Dexie: corre dentro de una transacción). */
  applyLocal: (op: OfflineOp) => Promise<T>
}

export const OFFLINE_NOT_ENABLED_MESSAGE =
  "Sin conexión: este equipo no está habilitado para operar sin internet. Se puede habilitar en Configuración › Sin internet."

/** Sin respuesta del server (o el proxy no llega a él). */
export function isOfflineError(err: unknown): boolean {
  if (!isPosApiError(err)) return err instanceof TypeError
  return err.code === "network" || err.status === 502 || err.status === 503 || err.status === 504
}

export async function offlineAware<T>(params: OfflineAwareParams<T>): Promise<T> {
  const opId = crypto.randomUUID()
  const occurredAt = new Date().toISOString()
  const status = getOfflineStatus()
  const queueBusy = status.pending > 0

  if (status.online && !queueBusy) {
    try {
      return await params.online({ "X-Pos-Op-Id": opId, "X-Pos-Occurred-At": occurredAt })
    } catch (err) {
      if (!isOfflineError(err)) throw err
      markOffline()
    }
  }

  if (!(await isOfflineEnabled(params.tenantId))) {
    throw new PosApiError(OFFLINE_NOT_ENABLED_MESSAGE, "network", 0)
  }

  const store = offlineStore()
  const op: OfflineOp = {
    id: opId,
    tenantId: params.tenantId,
    seq: await store.nextSeq(),
    kind: params.kind,
    label: params.label,
    method: params.request.method,
    path: params.request.path,
    ...(params.request.body !== undefined ? { body: params.request.body } : {}),
    ...(params.request.idempotencyKey ? { idempotencyKey: params.request.idempotencyKey } : {}),
    entityKeys: params.entityKeys,
    occurredAt,
    status: "pending",
    attempts: 0,
    lastError: null,
    createdAt: occurredAt,
  }

  const result = await store.runAtomic(async () => {
    const value = await params.applyLocal(op)
    await store.addOp(op)
    return value
  })

  await refreshOfflineCounts(params.tenantId)
  if (getOfflineStatus().online) void replayOfflineOps(params.tenantId).catch(() => {})
  return result
}
