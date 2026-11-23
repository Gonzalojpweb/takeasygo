// ============================================================================
// «Lo más pedido» — dibujo (DOM, sin React ni librerías)
// ============================================================================
// Página 1: lo más pedido en esta sede (o destacados), con «Nº 1, 2, 3…».
// Página 2 (si hay): combos disponibles. Horizontal 3 × 2, vertical 2 × 3.
// QR «Pedí desde tu celular» abajo a la derecha, con atribución.
// ============================================================================

import { qrBadge } from './qr'
import { boardColors, featuredVisible, formatPrice, type FeaturedBoard, type Freshness } from '../board'

export interface PlayFeaturedOptions {
  host: HTMLElement
  board: FeaturedBoard
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
const clamp = (n: number) => `display:-webkit-box;-webkit-line-clamp:${n};-webkit-box-orient:vertical;overflow:hidden`

interface Card { title: string; text: string | null; price: string | null; image: string | null; rank: number | null }

export function playFeaturedBoard(o: PlayFeaturedOptions): () => void {
  const landscape = window.innerWidth >= window.innerHeight
  const colors = boardColors(o.board)
  const products = featuredVisible(o.board, o.nowMs(), o.timeZone)
  const anyTop = products.some((p) => p.reason === 'top')
  const pages: Array<{ title: string; cards: Card[] }> = []
  if (products.length) pages.push({
    title: anyTop ? 'Lo más pedido acá' : 'Recomendados de la casa',
    cards: products.map((p, i) => ({ title: p.name, text: p.description, price: `${p.fromPrice ? 'desde ' : ''}${formatPrice(p.price)}`, image: p.image, rank: p.reason === 'top' ? i + 1 : null })),
  })
  if (o.board.combos.length) pages.push({
    title: 'Combos',
    cards: o.board.combos.slice(0, 6).map((c) => ({ title: c.name, text: c.description, price: c.price ? formatPrice(c.price) : null, image: c.image, rank: null })),
  })

  let cancelled = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let urls: string[] = []
  let logoUrl: string | null = null
  let qr: HTMLElement | null = null
  let shown = false
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
  if (!pages.length) { timer = setTimeout(() => finish(true), 1000); return () => finish(false, 'cancelada') }

  async function render(i: number) {
    if (cancelled) return
    const pg = pages[i]
    if (o.board.brand.logo && !logoUrl) logoUrl = await o.objectUrl(o.board.brand.logo).catch(() => null)
    if (i === 0 && o.board.showQr !== false) qr = await qrBadge(o.orderUrl, colors)
    const pageUrls: string[] = []
    const photos = await Promise.all(pg.cards.map(async (c) => {
      if (!c.image) return null
      const u = await o.objectUrl(c.image).catch(() => null)
      if (u) pageUrls.push(u)
      return u
    }))
    if (cancelled) { release(pageUrls); return }

    const cols = landscape ? 3 : 2
    const rows = landscape ? 2 : 3
    const grid = h('div', `flex:1;min-height:0;display:grid;grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},1fr);gap:2.4vmin;padding:2.4vmin 4vmin ${qr ? '4vmin' : '3vmin'}`)
    pg.cards.slice(0, cols * rows).forEach((c, k) => {
      const img = photos[k]
        ? (() => { const el = h('img', 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover'); el.alt = ''; el.addEventListener('error', () => { el.style.visibility = 'hidden' }, { once: true }); el.src = photos[k]!; return el })()
        : null
      const card = h('div', `position:relative;overflow:hidden;border-radius:2.4vmin;background:${colors.card};min-height:0`, [
        img,
        h('div', 'position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 35%,rgba(0,0,0,.82))'),
        c.rank ? h('div', `position:absolute;left:1.6vmin;top:1.6vmin;font-weight:900;font-size:3.4vmin;background:${colors.accent};color:${colors.onAccent};border-radius:1.4vmin;padding:.2vmin 1.4vmin`, [`Nº ${c.rank}`]) : null,
        h('div', 'position:absolute;left:0;right:0;bottom:0;padding:2vmin;color:#fff;display:flex;flex-direction:column;gap:.8vmin', [
          h('div', `font-weight:800;font-size:${landscape ? 3.2 : 3.8}vmin;line-height:1.1;${clamp(2)}`, [c.title]),
          c.text ? h('div', `font-size:${landscape ? 2 : 2.6}vmin;opacity:.85;${clamp(1)}`, [c.text]) : null,
          c.price ? h('span', `align-self:flex-start;font-weight:800;font-size:${landscape ? 3 : 3.6}vmin;background:${colors.accent};color:${colors.onAccent};padding:.2vmin 1.4vmin;border-radius:1.2vmin`, [c.price]) : null,
        ]),
      ])
      grid.append(card)
    })
    const logo = logoUrl
      ? (() => { const el = h('img', 'max-height:8vmin;max-width:24vmin;object-fit:contain'); el.alt = ''; el.src = logoUrl!; return el })()
      : h('div', `font-weight:800;font-size:3vmin`, [o.board.brand.name])
    const header = h('header', `display:flex;align-items:center;gap:3vmin;padding:3vmin 4vmin 1vmin`, [
      logo,
      h('div', `font-weight:900;font-size:6vmin;line-height:1.05;flex:1;min-width:0;${clamp(1)}`, [pg.title]),
    ])
    const view = h('div', 'position:absolute;inset:0;display:flex;flex-direction:column;opacity:0;transition:opacity .5s', [header, grid])
    if (o.freshness === 'stale') view.append(h('div', `position:absolute;left:4vmin;bottom:1vmin;font-size:1.9vmin;color:${colors.muted}`, ['Sujeto a disponibilidad. Consultá en el mostrador.']))
    if (qr) view.append(qr.cloneNode(true))
    o.host.append(view)
    requestAnimationFrame(() => { view.style.opacity = '1' })
    if (!shown) { shown = true; o.host.style.opacity = '1'; o.onShown() }
    const prev = urls
    urls = pageUrls
    for (const old of [...o.host.children]) if (old !== view) setTimeout(() => old.remove(), 600)
    setTimeout(() => release(prev), 900)
    timer = setTimeout(() => (i + 1 < pages.length ? void render(i + 1) : finish(true)), o.board.pageMs)
  }

  void render(0)
  return () => finish(false, 'cancelada')
}
