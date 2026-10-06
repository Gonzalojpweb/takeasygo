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
    return res.ok
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
 * Las URLs se leen acá y no en carga de módulo: los tests las pisan
 * antes de llamar (mismo criterio que pos-api saasUrl()).
 */
export async function revokeSession(accessToken: string): Promise<RevokeResult> {
  const syncUrl = import.meta.env.VITE_SYNC_URL
  const saasUrl = import.meta.env.VITE_SAAS_URL

  const syncPromise: Promise<boolean> = syncUrl
    ? postRevoke(`${syncUrl}/api/v1/auth/logout`, accessToken)
    : Promise.resolve(false)
  const saasPromise: Promise<boolean> = saasUrl
    ? postRevoke(`${saasUrl}/api/auth/logout`, accessToken)
    : Promise.resolve(false)

  const [sync, saas] = await Promise.all([syncPromise, saasPromise])
  return { sync, saas }
}
