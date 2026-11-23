// ============================================================================
// Pantalla táctil: tocar un producto lo agranda con su QR para pedirlo
// ============================================================================
// Se cierra al tocar o sola a los 12 s; la carta sigue girando debajo. Sin
// cuentas ni datos personales: solo el producto y el QR de la sede (con el
// origen de esta pantalla, para la atribución).
// ============================================================================
import { qrBadge } from './qr'
import type { BoardColors } from '../board'

export interface TapInfo { name: string; description: string | null; price: string | null; image: string | null; soldOut?: boolean }

const AUTO_CLOSE_MS = 12_000
let open: { close: () => void } | null = null

function el(tag: string, css: string, text?: string): HTMLElement {
  const e = document.createElement(tag)
  e.style.cssText = css
  if (text) e.textContent = text
  return e
}

export async function showDetail(o: { root: HTMLElement; info: TapInfo; colors: BoardColors; orderUrl?: string | null; objectUrl: (url: string) => Promise<string | null> }): Promise<void> {
  open?.close()
  const photo = o.info.image ? await o.objectUrl(o.info.image).catch(() => null) : null
  const landscape = window.innerWidth >= window.innerHeight
  const c = o.colors
  const ov = el('div', 'position:fixed;inset:0;z-index:15;display:grid;place-items:center;background:rgba(0,0,0,.72);opacity:0;transition:opacity .25s')
  ov.setAttribute('role', 'dialog')
  ov.setAttribute('aria-label', o.info.name)
  const card = el('div', `position:relative;display:flex;flex-direction:${landscape ? 'row' : 'column'};width:${landscape ? '78vw' : '88vw'};max-height:86vh;overflow:hidden;border-radius:3vmin;background:${c.bg};color:${c.text};font-family:system-ui,sans-serif`)
  if (photo) {
    const img = document.createElement('img')
    img.alt = ''
    img.src = photo
    img.style.cssText = `${landscape ? 'width:48%;' : 'width:100%;height:42vh;'}object-fit:cover;${o.info.soldOut ? 'filter:grayscale(1);opacity:.5' : ''}`
    card.append(img)
  }
  const body = el('div', 'flex:1;min-width:0;padding:5vmin;display:flex;flex-direction:column;gap:2.4vmin;justify-content:center')
  body.append(el('div', 'font-weight:900;font-size:6vmin;line-height:1.05', o.info.name))
  if (o.info.description) body.append(el('div', `font-size:3.2vmin;color:${c.muted}`, o.info.description))
  if (o.info.soldOut) body.append(el('div', `font-weight:800;font-size:3.4vmin;color:${c.muted}`, 'Agotado por ahora'))
  else if (o.info.price) body.append(el('span', `align-self:flex-start;font-weight:900;font-size:6vmin;background:${c.accent};color:${c.onAccent};padding:.4vmin 2vmin;border-radius:1.6vmin`, o.info.price))
  body.append(el('div', `font-size:2.2vmin;color:${c.muted}`, 'Tocá para cerrar'))
  card.append(body)
  const qr = o.info.soldOut ? null : await qrBadge(o.orderUrl, c, 'Pedilo desde tu celular')
  if (qr) card.append(qr)
  ov.append(card)
  o.root.append(ov)
  requestAnimationFrame(() => { ov.style.opacity = '1' })
  let timer: ReturnType<typeof setTimeout> | null = null
  const close = () => {
    if (timer) clearTimeout(timer)
    ov.style.opacity = '0'
    setTimeout(() => { ov.remove(); if (photo) URL.revokeObjectURL(photo) }, 300)
    if (open?.close === close) open = null
  }
  ov.addEventListener('click', close)
  timer = setTimeout(close, AUTO_CLOSE_MS)
  open = { close }
}
