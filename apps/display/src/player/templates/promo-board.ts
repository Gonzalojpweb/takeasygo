// ============================================================================
// Promos por horario — dibujo (DOM, sin React ni librerías)
// ============================================================================
// Una promo por página, a pantalla completa: foto grande, título, texto,
// precio (o «hasta X% off») y cuándo vale. Horizontal: foto a la izquierda.
// Vertical: foto arriba. Solo las vigentes AHORA (board.ts → activePromos).
// ============================================================================

import { qrBadge } from './qr'
import { activePromos, boardColors, formatPrice, promoWhen, type BoardPromo, type Freshness, type PromoBoard } from '../board'

export interface PlayPromosOptions {
  host: HTMLElement
  board: PromoBoard
  nowMs: () => number
  timeZone?: string | null
  freshness: Freshness
  objectUrl: (url: string) => Promise<string | null>
  orderUrl?: string | null
  onShown: () => void
  onDone: (ok: boolean, reason?: string) => void
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, css: string, children: Array<Node | string | null> = []): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  el.style.cssText = css
  for (const c of children) if (c !== null) el.append(typeof c === 'string' ? document.createTextNode(c) : c)
  return el
}
const clamp = (lines: number) => `display:-webkit-box;-webkit-line-clamp:${lines};-webkit-box-orient:vertical;overflow:hidden`

export function playPromoBoard(o: PlayPromosOptions): () => void {
  const landscape = window.innerWidth >= window.innerHeight
  const list = activePromos(o.board, o.nowMs(), o.timeZone)
  const colors = boardColors(o.board)
  let cancelled = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let urls: string[] = []
  let logoUrl: string | null = null
  let shown = false
  let qr: HTMLElement | null = null

  o.host.style.cssText = `position:absolute;inset:0;background:${colors.bg};color:${colors.text};font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;overflow:hidden;opacity:0;transition:opacity .4s`
  const release = (l: string[]) => { for (const u of l) URL.revokeObjectURL(u) }
  const finish = (ok: boolean, reason?: string) => {
    if (cancelled) return
    cancelled = true
    if (timer) clearTimeout(timer)
    const last = urls; const logo = logoUrl
    setTimeout(() => { release(last); if (logo) URL.revokeObjectURL(logo) }, 1500)
    o.onDone(ok, reason)
  }
  if (!list.length) { timer = setTimeout(() => finish(true), 1000); return () => finish(false, 'cancelada') }

  async function render(i: number) {
    if (cancelled) return
    const p = list[i]
    if (o.board.brand.logo && !logoUrl) logoUrl = await o.objectUrl(o.board.brand.logo).catch(() => null)
    if (i === 0 && o.board.showQr !== false) qr = await qrBadge(o.orderUrl, colors)
    const photo = p.image ? await o.objectUrl(p.image).catch(() => null) : null
    if (cancelled) { if (photo) URL.revokeObjectURL(photo); return }
    const view = page(p, photo)
    if (qr) view.append(qr.cloneNode(true))
    view.style.opacity = '0'
    view.style.transition = 'opacity .5s'
    o.host.append(view)
    requestAnimationFrame(() => { view.style.opacity = '1' })
    if (!shown) { shown = true; o.host.style.opacity = '1'; o.onShown() }
    const prev = urls
    urls = photo ? [photo] : []
    for (const old of [...o.host.children]) if (old !== view) setTimeout(() => old.remove(), 600)
    setTimeout(() => release(prev), 900)
    timer = setTimeout(() => (i + 1 < list.length ? void render(i + 1) : finish(true)), o.board.pageMs)
  }

  function page(p: BoardPromo, photo: string | null): HTMLElement {
    const img = photo
      ? (() => { const el = h('img', `width:100%;height:100%;object-fit:cover;display:block`); el.alt = ''; el.addEventListener('error', () => { el.style.visibility = 'hidden' }, { once: true }); el.src = photo; return el })()
      : h('div', `width:100%;height:100%;background:linear-gradient(135deg, ${colors.accent}, ${colors.bg})`)
    const media = h('div', landscape ? 'flex:0 0 50%;height:100%;overflow:hidden' : 'flex:0 0 46%;width:100%;overflow:hidden', [img])
    const when = promoWhen(p)
    const deal: Array<HTMLElement | null> = []
    if (o.board.showPrices && p.price) {
      deal.push(h('div', 'display:flex;align-items:baseline;gap:2vmin;flex-wrap:wrap', [
        p.originalPrice ? h('s', `font-size:4vmin;color:${colors.muted}`, [formatPrice(p.originalPrice)]) : null,
        h('span', `font-weight:900;font-size:${landscape ? 8 : 9}vmin;background:${colors.accent};color:${colors.onAccent};padding:.6vmin 2.6vmin;border-radius:2vmin;white-space:nowrap`, [formatPrice(p.price)]),
      ]))
    } else if (p.percent) {
      deal.push(h('span', `align-self:flex-start;font-weight:900;font-size:${landscape ? 8 : 9}vmin;background:${colors.accent};color:${colors.onAccent};padding:.6vmin 2.6vmin;border-radius:2vmin`, [`hasta ${p.percent}% off`]))
    }
    const logo = logoUrl
      ? (() => { const el = h('img', 'max-height:8vmin;max-width:28vmin;object-fit:contain;align-self:flex-start'); el.alt = ''; el.src = logoUrl!; return el })()
      : h('div', `font-weight:800;font-size:3vmin;color:${colors.muted}`, [o.board.brand.name])
    const textCol = h('div', `flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:2.6vmin;padding:${landscape ? '6vmin 6vmin' : '5vmin 6vmin 6vmin'}`, [
      logo,
      h('div', `font-weight:700;font-size:2.6vmin;letter-spacing:.14em;text-transform:uppercase;color:${colors.accent}`, ['Promo']),
      h('div', `font-weight:900;font-size:${landscape ? 7.4 : 8.4}vmin;line-height:1.02;${clamp(3)}`, [p.title]),
      p.text ? h('div', `font-size:${landscape ? 3.4 : 4.2}vmin;line-height:1.25;color:${colors.muted};${clamp(3)}`, [p.text]) : null,
      ...deal,
      when ? h('div', `font-size:${landscape ? 3 : 3.8}vmin;font-weight:600`, [when]) : null,
      o.freshness === 'stale' ? h('div', `font-size:2vmin;color:${colors.muted}`, ['Sujeto a disponibilidad. Consultá en el mostrador.']) : null,
    ])
    return h('div', `position:absolute;inset:0;display:flex;flex-direction:${landscape ? 'row' : 'column'}`, [media, textCol])
  }

  void render(0)
  return () => finish(false, 'cancelada')
}
