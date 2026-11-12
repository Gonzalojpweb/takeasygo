import type { PosApiError } from "../pos-api"
import type { OfflineOp } from "./types"

// ============================================================================
// Qué hacer con cada tipo de operación al reenviarla
// ============================================================================
// Cada servicio (órdenes, mesas, caja) registra sus tipos en la etapa que le
// toca:
//   · onSuccess — guarda en Dexie lo que devolvió el server (gana el server).
//   · tolerate  — un rechazo que en realidad significa «ya estaba hecho»
//                 (ej. mandar a cocina una orden que otra terminal ya mandó).
// Un tipo sin registro se reenvía igual y no toca Dexie con la respuesta.
// ============================================================================

export interface OfflineOpKind {
  onSuccess?: (response: unknown, op: OfflineOp) => Promise<void>
  tolerate?: (error: PosApiError, op: OfflineOp) => boolean
}

const kinds = new Map<string, OfflineOpKind>()

export function registerOfflineOpKind(kind: string, handlers: OfflineOpKind): void {
  kinds.set(kind, handlers)
}

export function offlineOpKind(kind: string): OfflineOpKind | undefined {
  return kinds.get(kind)
}

/** Solo tests. */
export function __clearOfflineOpKinds(): void {
  kinds.clear()
}
