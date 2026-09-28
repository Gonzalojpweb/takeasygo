import { db } from "../db/dexie"

// ============================================================================
// pos-api — el ÚNICO cliente HTTP de la superficie /api/[tenant]/pos/*
// ============================================================================
// Antes de M5 cada servicio armaba su propio fetch contra Sync Layer
// (`VITE_SYNC_URL`) con el `Authorization` escrito a mano: 12 constantes de
// módulo y ~25 fetches sin un solo punto donde inyectar la sede. Acá vive todo
// una vez:
//
//   · la sede viaja en `X-Location-Id` (leída de Dexie, que es donde la dejó
//     el login); si no la hay, el server resuelve solo (tenant single-sede)
//     o usa el claim `locationId` del token.
//   · el JWT vive en sessionStorage — es la única copia en claro que escribe
//     AuthContext (la de Dexie está cifrada y no se puede leer sin el PIN).
//   · cualquier error del server sale como `PosApiError` con `code`+`status`,
//     igual que el contrato `PosError` del SaaS: el POS decide por código,
//     nunca parseando mensajes.
//
// El segmento [tenant] es el `tenantId` (ObjectId) que el POS ya tiene; el
// server acepta ObjectId o slug (ver resolvePosContext).
// ============================================================================

/** Clave de sessionStorage donde AuthContext guarda la sesión en claro. */
export const SESSION_CACHE_KEY = "takeasygo_session"

/** Leída en cada llamada (no en carga de módulo): los tests la pisan antes de llamar. */
function saasUrl(): string | undefined {
  return import.meta.env.VITE_SAAS_URL
}

export type PosApiErrorCode =
  | "validation"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "transition_invalid"
  | "conflict"
  | "idempotency_mismatch"
  | "internal"
  // Códigos del lado cliente (no vienen del server)
  | "no_session"
  | "network"

export class PosApiError extends Error {
  readonly code: PosApiErrorCode
  readonly status: number
  readonly detail?: string

  constructor(
    message: string,
    code: PosApiErrorCode,
    status: number,
    detail?: string
  ) {
    super(message)
    this.name = "PosApiError"
    this.code = code
    this.status = status
    this.detail = detail
  }
}

export function isPosApiError(e: unknown): e is PosApiError {
  return e instanceof PosApiError
}

interface CachedSession {
  accessToken: string
  expiresAt?: number
  tenantId?: string
}

/**
 * Sesión en claro desde sessionStorage.
 * No existe ningún otro camino: AuthContext solo autentica vía `login()`, y
 * `login()` siempre escribe este registro (la restauración desde Dexie exige
 * PIN, que vuelve a pasar por `login()`).
 */
function readAccessToken(): string {
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY)
    if (raw) {
      const session = JSON.parse(raw) as CachedSession
      if (typeof session.accessToken === "string" && session.accessToken) {
        return session.accessToken
      }
    }
  } catch {
    // sessionStorage inaccesible o JSON roto: cae al error de abajo.
  }
  throw new PosApiError(
    "Sesión no disponible: volvé a iniciar sesión",
    "no_session",
    401
  )
}

export interface PosApiRequest {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"
  body?: unknown
  /** Equivale a `Idempotency-Key`; en V1 el POS manda `posId` acá. */
  idempotencyKey?: string
  query?: Record<string, string | number | boolean | undefined>
  /** Token explícito (si el caller ya lo tiene); si no, se lee de la sesión. */
  accessToken?: string
}

/**
 * Llamada autenticada a `${VITE_SAAS_URL}/api/{tenantId}/pos/{path}`.
 * Rechaza con `PosApiError`; un 401 además dispara `auth:expired` (mismo
 * comportamiento que `checkAuth` de sync-api).
 */
export async function posApi<T>(
  tenantId: string,
  path: string,
  request: PosApiRequest = {}
): Promise<T> {
  const base = saasUrl()
  if (!base) {
    throw new PosApiError(
      "Falta VITE_SAAS_URL: el POS necesita la URL del SaaS para hablar con /api/[tenant]/pos/*",
      "internal",
      500
    )
  }

  const url = new URL(`${base}/api/${encodeURIComponent(tenantId)}/pos${path}`)
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${request.accessToken ?? readAccessToken()}`,
  }
  if (request.body !== undefined) headers["Content-Type"] = "application/json"
  if (request.idempotencyKey) headers["Idempotency-Key"] = request.idempotencyKey

  // La sede la declara el POS; el server la valida contra el tenant y NUNCA
  // elige una por su cuenta (ver resolvePosContext).
  try {
    const config = await db.tenantConfig.get(tenantId)
    if (config?.locationId) headers["X-Location-Id"] = config.locationId
  } catch {
    // Sin Dexie no hay sede declarada: el server aplica la regla de single-sede.
  }

  let res: Response
  try {
    res = await fetch(url.toString(), {
      method: request.method ?? "GET",
      headers,
      body: request.body !== undefined ? JSON.stringify(request.body) : undefined,
    })
  } catch (e) {
    throw new PosApiError(
      e instanceof Error ? e.message : "Error de red",
      "network",
      0
    )
  }

  if (res.ok) {
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  }

  let code: PosApiErrorCode = "internal"
  let message = `Error del servidor (${res.status})`
  let detail: string | undefined
  try {
    const payload = (await res.json()) as {
      error?: { code?: string; message?: string; detail?: string }
    }
    if (payload.error?.code) code = payload.error.code as PosApiErrorCode
    if (payload.error?.message) message = payload.error.message
    detail = payload.error?.detail
  } catch {
    // Respuesta sin cuerpo JSON: conserva el mensaje genérico.
  }

  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent("auth:expired"))
  }

  throw new PosApiError(message, code, res.status, detail)
}
