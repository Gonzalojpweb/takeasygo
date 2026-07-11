const SYNC_URL = import.meta.env.VITE_SYNC_URL ?? "http://localhost:3001"

export interface LoginResponse {
  accessToken: string
  expiresAt: number
  deviceType: "hub"
}

export async function loginWithPin(
  employeePin: string,
  tenantId: string
): Promise<LoginResponse> {
  const res = await fetch(`${SYNC_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "pin", employeePin, tenantId }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Network error" }))
    throw new Error(err.error ?? `Login failed (${res.status})`)
  }

  return res.json()
}

export async function loginWithEmail(
  email: string,
  password: string
): Promise<LoginResponse> {
  const res = await fetch(`${SYNC_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "email", email, password }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Network error" }))
    throw new Error(err.error ?? `Login failed (${res.status})`)
  }

  return res.json()
}
