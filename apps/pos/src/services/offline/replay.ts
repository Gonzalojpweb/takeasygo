import { isPosApiError, posApi } from "../pos-api"
import { offlineOpKind } from "./registry"
import { offlineStore } from "./store"
import { getOfflineStatus, markOffline, setOfflineStatus } from "./status"
import type { OfflineOp } from "./types"
import { isLocalWorkPending } from "./local-work"

// ============================================================================
// Reenvío de la cola al volver la red
// ============================================================================
// Una operación por vez y en orden (seq). Cada una viaja con su X-Pos-Op-Id:
// si el envío se corta a mitad de camino y se repite, el server no la aplica
// dos veces (PosOpReceipt).
//
//   2xx                         → se guarda la respuesta (onSuccess) y sale de la cola
//   sin red                     → se corta el envío; sigue cuando vuelva
//   5xx / rate_limited / «en curso» / sin sesión → se corta y se reintenta después
//   otro 4xx                    → «con conflicto»: queda para revisar a mano y
//                                 las operaciones que tocan la misma entidad esperan
// ============================================================================

export interface ReplayResult {
  sent: number
  conflicts: number
  /** Quedó trabajo y conviene reintentar más tarde. */
  retryLater: boolean
}

/** Envío real (inyectable para tests). */
export type OpSender = (op: OfflineOp) => Promise<unknown>

/** Etapa 4: impresoras donde la comanda de esta operación ya salió por la red local. */
const printedKey = (opId: string) => `printed:${opId}`

export const sendOpToServer: OpSender = async (op) => {
  const printed = await offlineStore().getMeta<string[]>(printedKey(op.id))
  return posApi(op.tenantId, op.path, {
    method: op.method,
    body: op.body,
    idempotencyKey: op.idempotencyKey,
    skipApproval: true,
    headers: {
      "X-Pos-Op-Id": op.id,
      "X-Pos-Occurred-At": op.occurredAt,
      ...(printed?.length ? { "X-Pos-Printed": printed.join(",") } : {}),
    },
  })
}

/** Errores que no son del dato sino del momento: se reintenta, no es conflicto. */
function isTransient(err: unknown): boolean {
  if (!isPosApiError(err)) return true
  if (err.code === "network" || err.code === "rate_limited" || err.code === "internal") return true
  if (err.code === "no_session" || err.code === "unauthorized") return true
  if (err.status >= 500 || err.status === 0) return true
  // El recibo del server dice que otro envío la está aplicando.
  if (err.code === "conflict" && /se está (aplicando|reintentando)/.test(err.message)) return true
  return false
}

let running: Promise<ReplayResult> | null = null

export async function refreshOfflineCounts(tenantId: string): Promise<void> {
  const ops = await offlineStore().listOps(tenantId)
  setOfflineStatus({
    pending: ops.filter((o) => o.status === "pending").length,
    conflicts: ops.filter((o) => o.status === "conflict").length,
  })
}

/** Manda la cola. Si ya hay un envío en curso, devuelve ese mismo. */
export function replayOfflineOps(tenantId: string, send: OpSender = sendOpToServer): Promise<ReplayResult> {
  if (running) return running
  running = doReplay(tenantId, send).finally(() => {
    running = null
  })
  return running
}

async function doReplay(tenantId: string, send: OpSender): Promise<ReplayResult> {
  const store = offlineStore()
  const result: ReplayResult = { sent: 0, conflicts: 0, retryLater: false }
  const ops = await store.listOps(tenantId)
  if (ops.length === 0) return result

  setOfflineStatus({ syncing: true })
  const blocked = new Set<string>()
  try {
    for (const op of ops) {
      if (op.status === "conflict") {
        op.entityKeys.forEach((k) => blocked.add(k))
        continue
      }
      // Depende de algo que el server no aceptó: espera la revisión. Sus
      // entidades también quedan frenadas (etapa 6): un retiro de la misma
      // caja no puede adelantarse a un movimiento que está esperando.
      if (op.entityKeys.some((k) => blocked.has(k))) {
        op.entityKeys.forEach((k) => blocked.add(k))
        continue
      }
      // Se está imprimiendo por la red local: si saliera ya, el server no
      // sabría que se imprimió. Se manda en cuanto termine (en orden).
      if (isLocalWorkPending(op.id)) {
        result.retryLater = true
        break
      }

      try {
        const response = await send(op)
        await offlineOpKind(op.kind)?.onSuccess?.(response, op)
        await store.deleteOp(op.id)
        await store.deleteMeta(printedKey(op.id))
        result.sent++
      } catch (err) {
        if (isPosApiError(err) && offlineOpKind(op.kind)?.tolerate?.(err, op)) {
          await store.deleteOp(op.id)
          await store.deleteMeta(printedKey(op.id))
          result.sent++
          continue
        }
        if (isTransient(err)) {
          if (isPosApiError(err) && err.code === "network") markOffline()
          await store.updateOp(op.id, {
            attempts: op.attempts + 1,
            lastError: isPosApiError(err) ? { code: err.code, message: err.message, status: err.status } : { code: "unknown", message: String(err), status: 0 },
          })
          result.retryLater = true
          break
        }
        // Rechazo del dato: conflicto para revisar.
        const e = err as { code: string; message: string; status: number }
        await store.updateOp(op.id, {
          status: "conflict",
          attempts: op.attempts + 1,
          lastError: { code: e.code, message: e.message, status: e.status },
        })
        op.entityKeys.forEach((k) => blocked.add(k))
        result.conflicts++
      }
    }
  } finally {
    await refreshOfflineCounts(tenantId)
    setOfflineStatus({
      syncing: false,
      ...(result.retryLater ? {} : { lastSyncAt: new Date().toISOString() }),
    })
  }
  return result
}

/** ¿Hay un envío corriendo? (para la UI y los tests). */
export function isReplaying(): boolean {
  return running !== null || getOfflineStatus().syncing
}
