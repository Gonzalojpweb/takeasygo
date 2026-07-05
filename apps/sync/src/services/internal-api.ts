// ─────────────────────────────────────────────────────────────────────────────
// internal-api.ts — Helper para llamar endpoints internos del SaaS
// ─────────────────────────────────────────────────────────────────────────────
// Solo accesible desde red interna. Nunca expone la ENCRYPTION_KEY.

import { config } from "../config"

interface DecryptField {
  field: string
  encryptedValue: string
}

/**
 * Descifra un batch de campos encriptados vía /internal/decrypt del SaaS.
 * La ENCRYPTION_KEY nunca sale del proceso del SaaS.
 */
export async function decryptFields(
  fields: DecryptField[]
): Promise<{ decrypted: string[]; errors?: string[] }> {
  if (!config.internalApiSecret) {
    throw new Error("INTERNAL_API_SECRET not configured")
  }

  const response = await fetch(`${config.saasBaseUrl}/api/internal/decrypt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.internalApiSecret}`,
      "X-Caller-Id": "sync-layer",
    },
    body: JSON.stringify({ fields }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Internal decrypt failed (${response.status}): ${text}`)
  }

  return response.json()
}

/**
 * Descifra un solo campo encriptado.
 */
export async function decryptField(
  field: string,
  encryptedValue: string
): Promise<string> {
  const { decrypted } = await decryptFields([{ field, encryptedValue }])
  return decrypted[0] ?? ""
}

/**
 * Descifra un batch de nombres para mostrar en resultados de búsqueda.
 */
export async function decryptNames(
  encryptedNames: string[]
): Promise<string[]> {
  if (encryptedNames.length === 0) return []

  const fields = encryptedNames.map((name) => ({
    field: "name",
    encryptedValue: name,
  }))

  const { decrypted } = await decryptFields(fields)
  return decrypted
}
