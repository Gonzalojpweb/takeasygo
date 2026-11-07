/**
 * Vuelta después del login (?callbackUrl=…): solo rutas internas de la app.
 * Rechaza otro dominio (`https://…`, `//evil.com`, `/\evil.com`). Multi-marca PR 9b.
 */
export function safeCallbackUrl(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 500) return null
  return /^\/(?![/\\])/.test(raw) ? raw : null
}
