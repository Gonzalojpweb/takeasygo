/**
 * WCAG 2.1 contrast utilities.
 *
 * Usage:
 *   import { ensureContrast } from '@/lib/color-utils'
 *   const safeText = ensureContrast(textColor, backgroundColor)
 */

// ── Hex ↔ RGB ────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3
    ? h.split('').map(c => c + c).join('')
    : h
  return [
    parseInt(full.substring(0, 2), 16),
    parseInt(full.substring(2, 4), 16),
    parseInt(full.substring(4, 6), 16),
  ]
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(c =>
    Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')
  ).join('')
}

// ── RGB ↔ HSL ────────────────────────────────────────────────────────────────

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const d = max - min
  const l = (max + min) / 2

  if (d === 0) return [0, 0, l]

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
  else if (max === gn) h = ((bn - rn) / d + 2) / 6
  else h = ((rn - gn) / d + 4) / 6

  return [h * 360, s, l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hN = h / 360
  if (s === 0) {
    const v = Math.round(l * 255)
    return [v, v, v]
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [
    Math.round(hue2rgb(p, q, hN + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, hN) * 255),
    Math.round(hue2rgb(p, q, hN - 1 / 3) * 255),
  ]
}

// ── WCAG Relative Luminance ──────────────────────────────────────────────────

function getRelativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

// ── Contrast Ratio ───────────────────────────────────────────────────────────

export function getContrastRatio(hex1: string, hex2: string): number {
  const [r1, g1, b1] = hexToRgb(hex1)
  const [r2, g2, b2] = hexToRgb(hex2)
  const l1 = getRelativeLuminance(r1, g1, b1)
  const l2 = getRelativeLuminance(r2, g2, b2)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

// ── Ensure Minimum Contrast ──────────────────────────────────────────────────

/**
 * Given a foreground (text) color and a background color, returns a
 * foreground color that meets the minimum WCAG AA contrast ratio.
 *
 * If the pair already passes, returns the original foreground unchanged.
 * If not, adjusts the foreground's lightness in HSL until it passes.
 *
 * @param foreground  - hex color (text)
 * @param background  - hex color (behind the text)
 * @param minRatio    - minimum contrast ratio (default 4.5 = WCAG AA normal text)
 * @returns hex color that meets the contrast requirement
 */
export function ensureContrast(
  foreground: string,
  background: string,
  minRatio = 4.5,
): string {
  if (!foreground || !background) return foreground

  const ratio = getContrastRatio(foreground, background)
  if (ratio >= minRatio) return foreground

  const [r, g, b] = hexToRgb(foreground)
  let [h, s, l] = rgbToHsl(r, g, b)
  const [, , bgL] = hexToRgb(background)
  const [, , bgLightness] = rgbToHsl(...bgToRgb(background))

  // Determine direction: darken if bg is light, lighten if bg is dark
  const shouldDarken = bgLightness > 0.5

  // Binary search for the lightness that gives us the target ratio
  let lo = shouldDarken ? 0 : l
  let hi = shouldDarken ? l : 1
  let best = foreground

  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    const [nr, ng, nb] = hslToRgb(h, s, mid)
    const candidate = rgbToHex(nr, ng, nb)
    const candidateRatio = getContrastRatio(candidate, background)

    if (candidateRatio >= minRatio) {
      best = candidate
      if (shouldDarken) lo = mid
      else hi = mid
    } else {
      if (shouldDarken) hi = mid
      else lo = mid
    }
  }

  return best
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function bgToRgb(hex: string): [number, number, number] {
  return hexToRgb(hex)
}

/**
 * Returns true if the hex color is considered "light" (useful for
 * deciding dark vs light text on a colored background).
 */
export function isLightColor(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex)
  return getRelativeLuminance(r, g, b) > 0.5
}
