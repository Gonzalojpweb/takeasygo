const SYNC_URL = import.meta.env.VITE_SYNC_URL;

export interface LoginResponse {
  accessToken: string
  expiresAt: number
  deviceType: "hub"
}

export interface PosLocation {
  id: string
  name: string
  slug: string
  address: string
  acceptsOrders: boolean
}

export async function loginWithPin(
  employeePin: string,
  tenantId: string,
  locationId?: string
): Promise<LoginResponse> {
  const res = await fetch(`${SYNC_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "pin", employeePin, tenantId, locationId }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Network error" }))
    throw new Error(err.error ?? `Login failed (${res.status})`)
  }

  return res.json()
}

export async function loginWithEmail(
  email: string,
  password: string,
  locationId?: string
): Promise<LoginResponse> {
  const res = await fetch(`${SYNC_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "email", email, password, locationId }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Network error" }))
    throw new Error(err.error ?? `Login failed (${res.status})`)
  }

  return res.json()
}

// Fetches the tenant's active locations for the sede picker (multi-sede POS).
// Requires a valid hub JWT (temporary login).
export async function getLocations(jwt: string): Promise<PosLocation[]> {
  const res = await fetch(`${SYNC_URL}/api/v1/locations`, {
    headers: { Authorization: `Bearer ${jwt}` },
  })
  if (!res.ok) return []
  const data = await res.json()
  return data.locations ?? []
}

// ============================================================================
// Revocación en logout (S1-5)
// ============================================================================

const REVOKE_TIMEOUT_MS = 3000

export interface RevokeResult {
  /** El Sync Layer aceptó la revocación (denylist local de EC2). */
  sync: boolean
  /** El SaaS aceptó la revocación (denylist Upstash — la que Vercel lee). */
  saas: boolean
}

async function postRevoke(url: string, accessToken: string): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REVOKE_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
    // 401 = ese lado ya no acepta el token (revocado, expirado o inválido):
    // la revocación de HECHO está lograda, no hay nada que reintentar.
    // Clave para el reintento tras un 503: la memoria local del servidor
    // ya lo tenía denylisteado y el segundo intento contesta 401.
    // Con el logout idempotente (r3) un 401 no es lo esperado (el endpoint
    // responde 200/503): queda logueado para diagnosticar token expirado
    // o clave mal configurada.
    if (res.status === 401) {
      console.warn(`[logout] 401 de ${url}: el servidor no acepta el token (expirado/invalido)`)
    }
    return res.ok || res.status === 401
  } catch {
    // Red caída, timeout o abort: el logout LOCAL igual sigue. Best-effort.
    return false
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Revoca el token en los DOS verificadores (dual store, S1-5): sync
 * (Redis local de EC2, que protege su HTTP y su socket.io) y saas
 * (Upstash, que protege /api/[tenant]/pos/*). Nunca lanza: un fallo
 * parcial deja el otro lado cubierto y el token local se tira igual.
 *
 * Si un lado no confirma (503 o red caída), se reintenta EN MEMORIA:
 * 3 envíos con backoff (~10s, ~30s; ventana <60s), con timer por token.
 * Un 401 en la respuesta ya cuenta como confirmado (ese lado no acepta
 * el token: revocado/expirado/inválido = sin token vivo que temer).
 * El token NO se
 * persiste en ningún lado — guardarlo en localStorage sería una
 * regresión (credencial viva legible por cualquier XSS). Sin red en esa
 * ventana queda el residual de ≤30 min (exp), que F1 cierra con
 * tokensValidAfter.
 *
 * Las URLs se leen acá y no en carga de módulo: los tests las pisan
 * antes de llamar (mismo criterio que pos-api saasUrl()).
 */
export async function revokeSession(accessToken: string): Promise<RevokeResult> {
  // Solo cancela reintentos PREVIOS de ESTE token (re-ingreso del mismo
  // logout). Otros tokens en vuelo conservan sus timers (defecto 2).
  clearPendingRevoke(accessToken)
  const result = await revokeRemaining(accessToken, { sync: false, saas: false })

  const retry = sidesWorthRetrying(result)
  if (retry.sync || retry.saas) {
    console.warn('[logout] revocación server-side parcial:', result, '- reintentos en memoria')
    scheduleRevokeRetry(accessToken, result, 1)
  }
  return result
}

/** Reintenta SOLO los lados que siguen fallando y tienen URL configurada. */
async function revokeRemaining(
  accessToken: string,
  prev: RevokeResult
): Promise<RevokeResult> {
  const syncUrl = import.meta.env.VITE_SYNC_URL
  const saasUrl = import.meta.env.VITE_SAAS_URL

  const syncPromise: Promise<boolean> =
    !prev.sync && syncUrl
      ? postRevoke(`${syncUrl}/api/v1/auth/logout`, accessToken)
      : Promise.resolve(prev.sync)
  const saasPromise: Promise<boolean> =
    !prev.saas && saasUrl
      ? postRevoke(`${saasUrl}/api/auth/logout`, accessToken)
      : Promise.resolve(prev.saas)

  const [sync, saas] = await Promise.all([syncPromise, saasPromise])
  return { sync, saas }
}

function sidesWorthRetrying(prev: RevokeResult): { sync: boolean; saas: boolean } {
  return {
    sync: !prev.sync && Boolean(import.meta.env.VITE_SYNC_URL),
    saas: !prev.saas && Boolean(import.meta.env.VITE_SAAS_URL),
  }
}

// Backoff: intento 1 inmediato + reintentos a los 10s y 30s → 3 envíos
// en total, ventana <60s. Todo en memoria (module scope): si la página
// se recarga, se pierde — aceptado, es exactamente el residual que
// documentamos.
const REVOKE_RETRY_DELAYS_MS = [10_000, 30_000]

// Timer de reintento POR TOKEN (ronda 2, defecto 2): dos logouts seguidos
// (turnover de caja) no se pisan — el segundo solo cancela/reemplaza su
// propio timer, nunca el del token anterior.
const pendingRetryTimers = new Map<string, ReturnType<typeof setTimeout>>()

function clearPendingRevoke(accessToken?: string): void {
  if (accessToken === undefined) {
    for (const timer of pendingRetryTimers.values()) clearTimeout(timer)
    pendingRetryTimers.clear()
    return
  }
  const timer = pendingRetryTimers.get(accessToken)
  if (timer !== undefined) {
    clearTimeout(timer)
    pendingRetryTimers.delete(accessToken)
  }
}

function scheduleRevokeRetry(
  accessToken: string,
  prev: RevokeResult,
  attempt: number
): void {
  clearPendingRevoke(accessToken)

  if (attempt > REVOKE_RETRY_DELAYS_MS.length) {
    console.error(
      `[logout] revocación NO confirmada tras ${REVOKE_RETRY_DELAYS_MS.length + 1} intentos ` +
        '(residual ≤30 min hasta exp):',
      prev
    )
    return
  }

  const timer = setTimeout(async () => {
    pendingRetryTimers.delete(accessToken)
    const next = await revokeRemaining(accessToken, prev)
    if (next.sync && next.saas) {
      console.log(`[logout] revocación confirmada en el intento ${attempt + 1}`)
      return
    }
    console.warn(`[logout] revocación aún parcial (intento ${attempt + 1}):`, next)
    scheduleRevokeRetry(accessToken, next, attempt + 1)
  }, REVOKE_RETRY_DELAYS_MS[attempt - 1])
  pendingRetryTimers.set(accessToken, timer)
}

/** Solo para tests: cancela TODOS los reintentos pendientes. */
export function __resetRevokeRetriesForTests(): void {
  clearPendingRevoke()
}
