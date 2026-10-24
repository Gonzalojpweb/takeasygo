// ============================================================================
// XML mínimo para los web services de ARCA (SOAP 1.1)
// ============================================================================
// Las respuestas de WSAA y WSFEv1 son documentos chicos y de forma fija: se
// leen por nombre de etiqueta (sin prefijo de namespace). Todo lo que se
// arma hacia ARCA pasa por `escapeXml`.
// ============================================================================

export function escapeXml(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
}

function tagRe(name: string, flags = ''): RegExp {
  // <ns:Name ...>contenido</ns:Name>  — prefijo opcional, atributos opcionales.
  return new RegExp(`<(?:[A-Za-z0-9_]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[A-Za-z0-9_]+:)?${name}>`, flags)
}

/** Contenido de la primera etiqueta `name` (sin des-escapar), o null. */
export function getTag(xml: string, name: string): string | null {
  const m = tagRe(name).exec(xml)
  return m ? m[1] : null
}

/** Texto des-escapado de la primera etiqueta `name`. */
export function getText(xml: string, name: string): string | null {
  const raw = getTag(xml, name)
  return raw === null ? null : unescapeXml(raw.trim())
}

/** Contenido de todas las etiquetas `name`. */
export function getAllTags(xml: string, name: string): string[] {
  return [...xml.matchAll(tagRe(name, 'g'))].map((m) => m[1])
}
