const SYNC_URL = "http://localhost:3001"

export interface PairingPublishResponse {
  code: string
  expiresAt: number
}

export interface PairingClaimResponse {
  status: "pending"
  message: string
}

export interface PairingApproveResponse {
  status: "approved"
  deviceId: string
}

export async function publishPairingCode(
  hubId: string,
  nonce: string,
  hubIp: string,
  hubPort: number,
  pubKey: string,
  jwt: string
): Promise<PairingPublishResponse> {
  const res = await fetch(`${SYNC_URL}/api/v1/pairing/hub-publish`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ hubId, nonce, hubIp, hubPort, pubKey }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Network error" }))
    throw new Error(err.error ?? `Pairing publish failed (${res.status})`)
  }

  return res.json()
}

export async function approvePairing(
  code: string,
  deviceId: string,
  deviceSecret: string,
  jwt: string
): Promise<PairingApproveResponse> {
  const res = await fetch(`${SYNC_URL}/api/v1/pairing/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ code, deviceId, deviceSecret }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Network error" }))
    throw new Error(err.error ?? `Pairing approve failed (${res.status})`)
  }

  return res.json()
}
