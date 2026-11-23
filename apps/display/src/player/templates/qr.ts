// QR «Pedí desde tu celular»: lleva al menú de la sede con el origen de esta
// pantalla (atribución). Se dibuja con la librería qrcode que ya usa la
// vinculación: funciona sin internet. Un SVG por URL, guardado en memoria.
import QRCode from 'qrcode'
import type { BoardColors } from '../board'

const svgCache = new Map<string, string>()

async function svgFor(url: string): Promise<string | null> {
  if (svgCache.has(url)) return svgCache.get(url)!
  try {
    const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
    svgCache.set(url, svg)
    return svg
  } catch { return null }
}

/** Tarjeta con el QR para la esquina inferior derecha (null si no hay URL o falla). */
/** Versión compacta para el encabezado de la carta (no tapa productos). */
export async function qrInline(url: string | null | undefined, label = 'Pedí desde tu celular'): Promise<HTMLElement | null> {
  if (!url) return null
  const svg = await svgFor(url)
  if (!svg) return null
  const box = document.createElement('div')
  box.style.cssText = 'display:flex;align-items:center;gap:1.2vmin;flex:none;background:#fff;border-radius:1.4vmin;padding:.8vmin 1.4vmin .8vmin .8vmin'
  const code = document.createElement('div')
  code.style.cssText = 'width:9vmin;height:9vmin'
  code.innerHTML = svg
  const svgEl = code.querySelector('svg')
  if (svgEl) { svgEl.setAttribute('width', '100%'); svgEl.setAttribute('height', '100%') }
  const text = document.createElement('div')
  text.style.cssText = 'font:700 1.8vmin/1.15 system-ui,sans-serif;color:#111;max-width:13vmin'
  text.textContent = label
  box.append(code, text)
  return box
}

export async function qrBadge(url: string | null | undefined, colors: BoardColors, label = 'Pedí desde tu celular'): Promise<HTMLElement | null> {
  if (!url) return null
  const svg = await svgFor(url)
  if (!svg) return null
  const box = document.createElement('div')
  box.style.cssText = `position:absolute;right:3vmin;bottom:3vmin;z-index:3;display:flex;flex-direction:column;align-items:center;gap:.8vmin;padding:1.4vmin;border-radius:2vmin;background:#fff;box-shadow:0 .6vmin 2.4vmin rgba(0,0,0,.35)`
  const code = document.createElement('div')
  code.style.cssText = 'width:16vmin;height:16vmin'
  code.innerHTML = svg
  const svgEl = code.querySelector('svg')
  if (svgEl) { svgEl.setAttribute('width', '100%'); svgEl.setAttribute('height', '100%') }
  const text = document.createElement('div')
  text.style.cssText = `font:700 1.9vmin system-ui,sans-serif;color:#111;text-align:center;max-width:18vmin`
  text.textContent = label
  const bar = document.createElement('div')
  bar.style.cssText = `width:100%;height:.6vmin;border-radius:.3vmin;background:${colors.accent}`
  box.append(code, text, bar)
  return box
}
