// ============================================================================
// Links de CTA (stories y promociones) — validación y render seguro
// ============================================================================
// Solo se aceptan:
//   · vacío (sin link)
//   · rutas internas: «/algo», sin «//» ni «/\» (que el navegador toma como
//     otro dominio) y sin caracteres de control
//   · https absoluto, sin usuario/contraseña y con un host con punto
// Todo lo demás (http:, javascript:, data:, «//host», «www.x.com» sin
// esquema) se rechaza. Evita redirecciones abiertas desde el menú.
//
// Links viejos ya guardados: la API los deja pasar SIN CAMBIOS con un aviso
// (para no trabar la edición de otros campos) y el render no los muestra
// (safeCtaHref → null). Para corregirlos: scripts/fix-cta-links.ts.
// ============================================================================

export const CTA_LINK_MAX = 500

export const CTA_LINK_ERROR =
  'El link del botón tiene que empezar con https:// o ser una ruta interna que empiece con «/».'

export type CtaLinkResult = { ok: true; value: string } | { ok: false; error: string }

// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f\s]/

export function validateCtaLink(raw: unknown): CtaLinkResult {
  if (raw === undefined || raw === null) return { ok: true, value: '' }
  if (typeof raw !== 'string') return { ok: false, error: CTA_LINK_ERROR }
  const value = raw.trim()
  if (!value) return { ok: true, value: '' }
  if (value.length > CTA_LINK_MAX || CONTROL_RE.test(value)) return { ok: false, error: CTA_LINK_ERROR }

  if (value.startsWith('/')) {
    if (value.startsWith('//') || value.startsWith('/\\') || value.includes('\\')) return { ok: false, error: CTA_LINK_ERROR }
    return { ok: true, value }
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return { ok: false, error: CTA_LINK_ERROR }
  }
  if (url.protocol !== 'https:') return { ok: false, error: CTA_LINK_ERROR }
  if (url.username || url.password) return { ok: false, error: CTA_LINK_ERROR }
  if (!url.hostname.includes('.') || url.hostname.startsWith('.') || url.hostname.endsWith('.')) {
    return { ok: false, error: CTA_LINK_ERROR }
  }
  return { ok: true, value }
}

export type CtaLinkUpdate =
  | { ok: true; changed: false; warning?: 'ctaLink' }
  | { ok: true; changed: true; value: string }
  | { ok: false; error: string }

/**
 * Para ediciones: `incoming` undefined = no se tocó el campo. Si llega el
 * MISMO link viejo inválido que ya estaba guardado, se acepta sin cambios y
 * con aviso; cualquier valor nuevo o distinto tiene que ser válido.
 */
export function resolveCtaLinkUpdate(incoming: unknown, stored: string | null | undefined): CtaLinkUpdate {
  if (incoming === undefined) return { ok: true, changed: false }
  const prev = (stored ?? '').trim()
  const next = typeof incoming === 'string' ? incoming.trim() : incoming
  if (typeof next === 'string' && next === prev && prev !== '') {
    return validateCtaLink(prev).ok ? { ok: true, changed: false } : { ok: true, changed: false, warning: 'ctaLink' }
  }
  const r = validateCtaLink(incoming)
  if (!r.ok) return r
  return { ok: true, changed: true, value: r.value }
}

/** Para el render: null = no mostrar el CTA. */
export function safeCtaHref(raw: string | null | undefined): { href: string; external: boolean } | null {
  const r = validateCtaLink(raw)
  if (!r.ok || !r.value) return null
  return { href: r.value, external: !r.value.startsWith('/') }
}

export type CtaLinkFix = { action: 'keep' } | { action: 'fix'; value: string } | { action: 'clear' }

/**
 * Propuesta de corrección para un link viejo (scripts/fix-cta-links.ts):
 *  · válido → se deja
 *  · «http://…» → «https://…»
 *  · dominio sin esquema («www.x.com», «x.com/promo») → «https://…»
 *  · cualquier otra cosa (javascript:, data:, «//host», texto) → se borra
 * Si la corrección no queda válida, también se borra.
 */
export function proposeCtaLinkFix(raw: string | null | undefined): CtaLinkFix {
  const value = (raw ?? '').trim()
  if (validateCtaLink(value).ok) return { action: 'keep' }
  let candidate = ''
  if (/^http:\/\//i.test(value)) candidate = `https://${value.slice(7)}`
  else if (/^[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)+([/?#]\S*)?$/i.test(value)) candidate = `https://${value}`
  if (candidate && validateCtaLink(candidate).ok) return { action: 'fix', value: candidate }
  return { action: 'clear' }
}
