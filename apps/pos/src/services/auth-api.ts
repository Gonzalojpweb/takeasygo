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
