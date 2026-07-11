const SYNC_URL = import.meta.env.VITE_SYNC_URL ?? "http://localhost:3001"

export interface SsoTokenResponse {
  ssoToken: string
  jti: string
  expiresAt: number
}

export async function requestSsoToken(jwt: string): Promise<SsoTokenResponse> {
  const res = await fetch(`${SYNC_URL}/api/v1/auth/sso-token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Network error" }))
    throw new Error(err.error ?? `SSO token request failed (${res.status})`)
  }

  return res.json()
}
