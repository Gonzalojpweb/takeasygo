// ============================================================================
// Carta en pantalla — dibujo (DOM, sin React ni librerías)
// ============================================================================
// Recorre las páginas visibles AHORA (board.ts) una por una, con el logo y los
// colores del comercio. Horizontal: grilla de 4 × 2 con fotos (o lista en dos
// columnas sin fotos). Vertical: filas con foto a la izquierda (o lista sin
// fotos). Unidades vmin: se ve igual en 720p y 1080p. Las fotos salen de la
// caché del equipo (blob:); si una no está, el producto va sin foto.
// ============================================================================

import { qrInline } from './qr'
import type { TapInfo } from './detail'
import { boardColors, boardPages, formatPrice, perPage, type BoardPage, type Freshness, type MenuBoard } from '../board'

export interface PlayBoardOptions {
  host: HTMLElement
  board: MenuBoard
  nowMs: () => number
  timeZone?: string | null
  freshness: Freshness
  /** Última actualización correcta (para el aviso «sin actualizar desde…»). */
  lastOkMs: number | null
  objectUrl: (url: string) => Promise<string | null>
  /** Menú de la sede con el origen de esta pantalla (QR). */
  orderUrl?: string | null
  /** Pantalla táctil: se toca un producto. */
  onTap?: (info: TapInfo) => void
  onShown: () => void
  onDone: (ok: boolean, reason?: string) => void
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, css: string, children: Array<Node | string | null> = []): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  el.style.cssText = css
  for (const c of children) if (c !== null) el.append(typeof c === 'string' ? document.createTextNode(c) : c)
  return el
}

/** Foto guardada; si el archivo no se puede leer, queda el recuadro vacío (sin ícono de imagen rota). */
function photoEl(src: string, css: string): HTMLImageElement {
  const img = h('img', css)
  img.alt = ''
  img.addEventListener('error', () => { img.style.visibility = 'hidden' }, { once: true })
  img.src = src
  return img
}

const clamp = (lines: number) => `display:-webkit-box;-webkit-line-clamp:${lines};-webkit-box-orient:vertical;overflow:hidden`

function hhmm(ms: number, timeZone?: string | null): string {
  try {
    return new Intl.DateTimeFormat('es-AR', { timeZone: timeZone || 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms))
  } catch {
    const d = new Date(ms)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
}

export function playMenuBoard(o: PlayBoardOptions): () => void {
  const landscape = window.innerWidth >= window.innerHeight
  const size = perPage(landscape ? 'landscape' : 'portrait', o.board.showPhotos)
  const pages = boardPages(o.board, o.nowMs(), o.timeZone, size)
  const colors = boardColors(o.board)
  let cancelled = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let logoUrl: string | null = null
  let urls: string[] = []
  let shown = false
  let qr: HTMLElement | null = null

  o.host.style.cssText = `position:absolute;inset:0;background:${colors.bg};color:${colors.text};font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;overflow:hidden;opacity:0;transition:opacity .4s`

  const release = (list: string[]) => { for (const u of list) URL.revokeObjectURL(u) }
  const finish = (ok: boolean, reason?: string) => {
    if (cancelled) return
    cancelled = true
    if (timer) clearTimeout(timer)
    // Las URLs de la última página se liberan después del fundido.
    const last = urls
    const logo = logoUrl
    setTimeout(() => { release(last); if (logo) URL.revokeObjectURL(logo) }, 1500)
    o.onDone(ok, reason)
  }

  if (!pages.length) {
    timer = setTimeout(() => finish(true), 1000)
    return () => finish(false, 'cancelada')
  }

  async function renderPage(i: number) {
    if (cancelled) return
    const page = pages[i]
    const pageUrls: string[] = []
    const photo = async (src: string | null): Promise<string | null> => {
      if (!src || !o.board.showPhotos) return null
      const u = await o.objectUrl(src).catch(() => null)
      if (u) pageUrls.push(u)
      return u
    }
    if (o.board.brand.logo && !logoUrl) logoUrl = await o.objectUrl(o.board.brand.logo).catch(() => null)
    if (i === 0 && o.board.showQr !== false) qr = await qrInline(o.orderUrl)
    const photos = await Promise.all(page.products.map((p) => photo(p.product.image)))
    if (cancelled) { release(pageUrls); return }

    const view = h('div', 'position:absolute;inset:0;display:flex;flex-direction:column;opacity:0;transition:opacity .5s')
    view.append(header(page), body(page, photos, landscape), footer())
    o.host.append(view)
    requestAnimationFrame(() => { view.style.opacity = '1' })
    if (!shown) { shown = true; o.host.style.opacity = '1'; o.onShown() }
    const prev = urls
    urls = pageUrls
    for (const old of [...o.host.children]) if (old !== view) setTimeout(() => old.remove(), 600)
    setTimeout(() => release(prev), 900)

    timer = setTimeout(() => {
      if (i + 1 < pages.length) void renderPage(i + 1)
      else finish(true)
    }, o.board.pageMs)
  }

  function header(page: BoardPage): HTMLElement {
    const logo = logoUrl
      ? h('img', 'max-height:9vmin;max-width:24vmin;object-fit:contain;flex:none')
      : h('div', `font-weight:800;font-size:3vmin;line-height:1.1;flex:none;max-width:34vmin;${clamp(2)}`, [o.board.brand.name])
    if (logo instanceof HTMLImageElement && logoUrl) { logo.src = logoUrl; logo.alt = '' }
    const titles = h('div', 'min-width:0;flex:1', [
      page.section.parent ? h('div', `font-size:2.4vmin;color:${colors.muted};${clamp(1)}`, [page.section.parent]) : null,
      h('div', `font-weight:800;font-size:5.6vmin;line-height:1.05;${clamp(1)}`, [page.section.name]),
    ])
    const dots = page.pages > 1
      ? h('div', 'display:flex;gap:1vmin;flex:none', Array.from({ length: page.pages }, (_, k) =>
        h('span', `width:1.6vmin;height:1.6vmin;border-radius:50%;background:${k + 1 === page.page ? colors.accent : colors.muted};opacity:${k + 1 === page.page ? 1 : 0.35}`)))
      : null
    return h('header', `display:flex;align-items:center;gap:3vmin;padding:3vmin 4vmin 2vmin;border-bottom:.5vmin solid ${colors.accent}`, [logo, titles, dots, qr ? (qr.cloneNode(true) as HTMLElement) : null])
  }

  function priceTag(p: BoardPage['products'][number]['product'], big: boolean): HTMLElement {
    const fs = big ? 4.2 : 3
    return h('div', 'display:flex;align-items:baseline;gap:1.2vmin;flex-wrap:wrap', [
      p.originalPrice ? h('s', `font-size:${fs * 0.62}vmin;color:${colors.muted}`, [formatPrice(p.originalPrice)]) : null,
      h('span', `font-weight:800;font-size:${fs}vmin;background:${colors.accent};color:${colors.onAccent};padding:.3vmin 1.4vmin;border-radius:1.2vmin;white-space:nowrap`,
        [`${p.fromPrice ? 'desde ' : ''}${formatPrice(p.price)}`]),
    ])
  }

  function soldBadge(): HTMLElement {
    return h('span', `align-self:flex-start;font-weight:800;font-size:2.4vmin;text-transform:uppercase;letter-spacing:.08em;border:.3vmin solid ${colors.muted};color:${colors.muted};padding:.2vmin 1.2vmin;border-radius:1vmin`, ['Agotado'])
  }

  /** Tarjeta tocable: agranda el producto con su QR. */
  const tappable = (node: HTMLElement, p: BoardPage['products'][number]['product'], soldOut: boolean) => {
    if (!o.onTap) return node
    node.style.cursor = 'pointer'
    node.addEventListener('click', (e) => { e.stopPropagation(); o.onTap!({ name: p.name, description: p.description, price: `${p.fromPrice ? 'desde ' : ''}${formatPrice(p.price)}`, image: p.image, soldOut }) })
    return node
  }

  function body(page: BoardPage, photos: Array<string | null>, isLandscape: boolean): HTMLElement {
    const items = page.products
    if (isLandscape && o.board.showPhotos) {
      const grid = h('div', 'flex:1;min-height:0;display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:repeat(2,1fr);gap:2.4vmin;padding:2.4vmin 4vmin')
      items.forEach(({ product: p, soldOut }, k) => {
        const img = photos[k]
          ? photoEl(photos[k]!, `width:100%;flex:1;min-height:0;object-fit:cover;border-radius:1.6vmin;${soldOut ? 'filter:grayscale(1);opacity:.45' : ''}`)
          : h('div', `flex:1;min-height:0;border-radius:1.6vmin;background:${colors.card}`)
        grid.append(tappable(h('div', `display:flex;flex-direction:column;gap:1vmin;min-width:0;min-height:0;background:${colors.card};border-radius:2vmin;padding:1.4vmin`, [
          img,
          h('div', `font-weight:700;font-size:2.7vmin;line-height:1.15;${clamp(2)}`, [p.name]),
          p.description ? h('div', `font-size:1.9vmin;color:${colors.muted};${clamp(1)}`, [p.description]) : null,
          soldOut ? soldBadge() : priceTag(p, false),
        ]), p, soldOut))
      })
      return grid
    }
    if (!isLandscape && o.board.showPhotos) {
      const list = h('div', 'flex:1;min-height:0;display:grid;grid-template-rows:repeat(6,1fr);gap:2vmin;padding:2.6vmin 4vmin')
      items.forEach(({ product: p, soldOut }, k) => {
        const img = photos[k]
          ? photoEl(photos[k]!, `height:100%;aspect-ratio:1;object-fit:cover;border-radius:2vmin;flex:none;${soldOut ? 'filter:grayscale(1);opacity:.45' : ''}`)
          : h('div', `height:100%;aspect-ratio:1;border-radius:2vmin;background:${colors.card};flex:none`)
        list.append(tappable(h('div', `display:flex;gap:3vmin;align-items:center;min-height:0;background:${colors.card};border-radius:2.4vmin;padding:1.6vmin`, [
          img,
          h('div', 'flex:1;min-width:0;max-height:100%;overflow:hidden;display:flex;flex-direction:column;justify-content:center;gap:1vmin', [
            h('div', `font-weight:700;font-size:4.4vmin;line-height:1.1;${clamp(2)}`, [p.name]),
            p.description ? h('div', `font-size:2.8vmin;line-height:1.2;color:${colors.muted};${clamp(p.name.length > 24 ? 1 : 2)}`, [p.description]) : null,
            soldOut ? soldBadge() : priceTag(p, true),
          ]),
        ]), p, soldOut))
      })
      return list
    }
    // Sin fotos: lista (dos columnas en horizontal).
    const cols = isLandscape ? 2 : 1
    const rows = Math.ceil(size / cols)
    const list = h('div', `flex:1;min-height:0;display:grid;grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},1fr);grid-auto-flow:column;column-gap:6vmin;padding:2.4vmin 4vmin`)
    for (const { product: p, soldOut } of items) {
      list.append(tappable(h('div', `display:flex;align-items:center;gap:2vmin;min-height:0;border-bottom:.2vmin solid ${colors.card};${soldOut ? 'opacity:.5' : ''}`, [
        h('div', 'flex:1;min-width:0', [
          h('div', `font-weight:700;font-size:${isLandscape ? 3.2 : 4.4}vmin;${clamp(1)}`, [p.name]),
          p.description ? h('div', `font-size:${isLandscape ? 2 : 2.8}vmin;color:${colors.muted};${clamp(1)}`, [p.description]) : null,
        ]),
        soldOut ? soldBadge() : priceTag(p, !isLandscape),
      ]), p, soldOut))
    }
    return list
  }

  function footer(): HTMLElement | string {
    if (o.freshness !== 'stale' || !o.lastOkMs) return ''
    return h('footer', `padding:1.2vmin 4vmin 2vmin;font-size:2vmin;color:${colors.muted}`, [
      `Precios y disponibilidad actualizados a las ${hhmm(o.lastOkMs, o.timeZone)}. Consultá en el mostrador.`,
    ])
  }

  void renderPage(0)
  return () => finish(false, 'cancelada')
}
