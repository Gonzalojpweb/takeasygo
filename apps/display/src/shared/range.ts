// Peticiones Range (opción A): el <video> pide trozos «bytes=inicio-fin»; el
// service worker los recorta del archivo completo guardado y responde 206.
// Sin dependencias para poder usarse en el SW y en tests.

export interface ByteRange { start: number; end: number }

/**
 * «bytes=100-199», «bytes=100-» o «bytes=-500» (últimos 500). Un solo rango.
 * null si el encabezado no es válido o queda fuera del archivo (→ 416).
 */
export function parseRangeHeader(header: string | null | undefined, size: number): ByteRange | null {
  if (!header || size <= 0) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m || (m[1] === '' && m[2] === '')) return null
  let start: number
  let end: number
  if (m[1] === '') {
    const suffix = Number(m[2])
    if (!Number.isFinite(suffix) || suffix <= 0) return null
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(m[1])
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null
  return { start, end }
}

export function contentRange(r: ByteRange, size: number): string {
  return `bytes ${r.start}-${r.end}/${size}`
}
