// ============================================================================
// POS offline V2 — tipos compartidos (etapa 1, 12/11/2026)
// ============================================================================
// Ver POS/OFFLINE/PLAN.md. Una «operación» es una escritura que el equipo hizo
// sin internet: ya se aplicó en Dexie (lo que ve la pantalla) y espera en la
// cola para mandarse al server, en el mismo orden, cuando vuelva la red.
// ============================================================================

export type OfflineOpMethod = "POST" | "PATCH" | "PUT" | "DELETE"

export type OfflineOpStatus =
  /** Espera turno para mandarse. */
  | "pending"
  /** El server la rechazó (4xx): queda para revisar a mano (etapa 6). */
  | "conflict"

export interface OfflineOpError {
  code: string
  message: string
  status: number
}

export interface OfflineOp {
  /** UUID de la operación = header X-Pos-Op-Id (el server deduplica con él). */
  id: string
  tenantId: string
  /** Orden de aplicación (creciente por equipo). */
  seq: number
  /** Tipo (`order.create`, `table.patch`, …): decide qué se hace con la respuesta. */
  kind: string
  /** Texto para la pantalla de sincronización: «Mesa 5 · nueva ronda». */
  label: string
  method: OfflineOpMethod
  /** Ruta bajo /api/[tenant]/pos (ej. `/orders`). */
  path: string
  body?: unknown
  idempotencyKey?: string
  /** Headers propios de la operación (etapa 7: X-Pos-Offline-Approver). */
  headers?: Record<string, string>
  /**
   * Entidades que toca (`order:<id>`, `table:<id>`, `register:<id>`). Si una
   * operación queda con conflicto, las siguientes que comparten entidad
   * esperan: no se cobra una orden que el server no aceptó.
   */
  entityKeys: string[]
  /** Momento real en el local (ISO) = header X-Pos-Occurred-At. */
  occurredAt: string
  status: OfflineOpStatus
  attempts: number
  lastError: OfflineOpError | null
  createdAt: string
}

/** Lo que el server dijo de este equipo (cacheado para cuando no hay red). */
export interface OfflineEligibility {
  enabled: boolean
  role: "primary" | "secondary" | null
  name: string | null
  limit: number
  /** ISO de la última consulta exitosa. */
  checkedAt: string
}
