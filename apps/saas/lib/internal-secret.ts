// ─────────────────────────────────────────────────────────────────────────────
// Verificación del secreto interno Sync ↔ SaaS
// ─────────────────────────────────────────────────────────────────────────────
// Los despliegues ya usan LOS DOS nombres de env para el mismo secreto:
// - Vercel (confirm-internal, status): SYNC_LAYER_SECRET
// - Vercel (encrypt/decrypt) y EC2 (config.internalApiSecret): INTERNAL_API_SECRET
// Acepta cualquiera de los dos valores para que el valor —no el nombre de la
// variable— sea lo único que debe alinearse entre despliegues. Fail-closed:
// sin ningún secreto configurado, nada matchea.
// ─────────────────────────────────────────────────────────────────────────────

export function internalSecretValues(): string[] {
  return [process.env.SYNC_LAYER_SECRET, process.env.INTERNAL_API_SECRET]
    .filter((v): v is string => !!v)
    .filter((v, i, arr) => arr.indexOf(v) === i)
}

export function hasInternalSecretConfigured(): boolean {
  return internalSecretValues().length > 0
}

/** Header X-Internal-Secret (o valor crudo) contra ambos secrets de env. */
export function matchesInternalSecret(
  provided: string | null | undefined
): boolean {
  if (!provided) return false
  const values = internalSecretValues()
  return values.length > 0 && values.includes(provided)
}

/** Authorization: Bearer <secret>. */
export function matchesInternalBearer(
  authorization: string | null | undefined
): boolean {
  if (!authorization?.startsWith('Bearer ')) return false
  return matchesInternalSecret(authorization.slice(7))
}
