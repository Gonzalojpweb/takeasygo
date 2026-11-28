// Color de texto legible sobre el color de la marca (WCAG, luminancia
// relativa). Un amarillo lleva texto oscuro; un rojo o un azul, texto blanco.

const DARK = '#1A1A1A'
const LIGHT = '#FFFFFF'

function parseHex(hex: string): [number, number, number] | null {
  const h = hex.trim().replace(/^#/, '')
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  if (!/^[0-9a-f]{6}$/i.test(full)) return null
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)) as [number, number, number]
}

function luminance([r, g, b]: [number, number, number]): number {
  const ch = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
}

function contrast(a: number, b: number): number {
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

/** Texto (oscuro o blanco) con mejor contraste sobre `background`. */
export function readableTextOn(background: string): string {
  const rgb = parseHex(background)
  if (!rgb) return LIGHT
  const l = luminance(rgb)
  return contrast(l, luminance([26, 26, 26])) >= contrast(l, 1) ? DARK : LIGHT
}
