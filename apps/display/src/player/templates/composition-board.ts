// ============================================================================
// Composiciones (Élite) — dibujo (DOM, sin React ni librerías)
// ============================================================================
// Una composición es UNA pantalla: los módulos se apilan de arriba hacia abajo
// y se reparten el alto según su tipo (el producto estrella y la grilla ocupan
// más; el encabezado y el QR lo justo). Todo inline, unidades vmin (igual en
// 720p y 1080p). Tipografías de la marca desde los archivos guardados en el
// equipo (FontFace); si no hay, la del sistema. Sin foto → recuadro con el
// color de la marca, nunca un hueco.
// ============================================================================

import { qrBadge, qrInline } from './qr'
import type { TapInfo } from './detail'
import QRCode from 'qrcode'
import { boardColors, compositionVisible, formatPrice, promoWhen, type BoardColors, type CompositionBoard, type CompositionProduct, type Freshness, type ResolvedModule } from '../board'

export interface PlayCompositionOptions {
  host: HTMLElement
  board: CompositionBoard
  nowMs: () => number
  timeZone?: string | null
  freshness: Freshness
  objectUrl: (url: string) => Promise<string | null>
  orderUrl?: string | null
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
const clamp = (n: number) => `display:-webkit-box;-webkit-line-clamp:${n};-webkit-box-orient:vertical;overflow:hidden`
const SYSTEM = 'system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif'
const fam = (f: string | null) => (f ? `"${f.replace(/"/g, '')}",${SYSTEM}` : SYSTEM)

/** Cuánto del alto que sobra se lleva cada módulo (además de su alto natural). La lista de precios tiene prioridad: sin ella no se ve la carta sin fotos. */
const WEIGHT: Record<ResolvedModule['type'], number> = {
  'brand-header': 0, 'hero-product': 2, 'product-grid': 2, 'combo-highlight': 1, 'promo-banner': 1,
  'drinks-row': 1, 'price-list': 4, 'illustration-block': 1.5, 'qr-cta': 0,
}

const loadedFonts = new Set<string>()
/** Fuentes de la marca desde la caché del equipo (nunca desde internet). */
async function injectFonts(board: CompositionBoard, objectUrl: (u: string) => Promise<string | null>): Promise<void> {
  if (typeof FontFace === 'undefined' || !document.fonts) return
  for (const f of board.brand.fontFiles) {
    const key = `${f.family}|${f.url}`
    if (loadedFonts.has(key)) continue
    const blob = await objectUrl(f.url).catch(() => null)
    if (!blob) continue
    try {
      const face = await new FontFace(f.family, `url(${blob})`).load()
      document.fonts.add(face)
      loadedFonts.add(key)
    } catch { /* archivo ilegible: queda la del sistema */ }
    // La fuente ya quedó en memoria: el blob se puede liberar.
    URL.revokeObjectURL(blob)
  }
}

export function playCompositionBoard(o: PlayCompositionOptions): () => void {
  const landscape = window.innerWidth >= window.innerHeight
  const colors = boardColors(o.board)
  const headFont = fam(o.board.brand.fontHeading ?? o.board.brand.fontBody)
  const bodyFont = fam(o.board.brand.fontBody ?? o.board.brand.fontHeading)
  const modules = compositionVisible(o.board, o.nowMs(), o.timeZone)
  let cancelled = false
  let timer: ReturnType<typeof setTimeout> | null = null
  const urls: string[] = []
  const wantsGlobalQr = o.board.showQr !== false && !modules.some((m) => m.type === 'qr-cta')
  let qrPlaced = false

  o.host.style.cssText = `position:absolute;inset:0;background:${colors.bg};color:${colors.text};font-family:${bodyFont};overflow:hidden;opacity:0;transition:opacity .4s`
  const finish = (ok: boolean, reason?: string) => {
    if (cancelled) return
    cancelled = true
    if (timer) clearTimeout(timer)
    setTimeout(() => { for (const u of urls) URL.revokeObjectURL(u) }, 1500)
    o.onDone(ok, reason)
  }
  if (!modules.length) { timer = setTimeout(() => finish(true), 1000); return () => finish(false, 'cancelada') }

  const photo = async (src: string | null): Promise<string | null> => {
    if (!src) return null
    const u = await o.objectUrl(src).catch(() => null)
    if (u) urls.push(u)
    return u
  }
  /**
   * Foto que llena su recuadro SIN aportar alto propio (posición absoluta):
   * el texto define el alto natural del módulo y la foto se adapta al lugar
   * que queda. Sin foto → degradé con el color de la marca.
   */
  const img = (src: string | null, css: string, dim = false, fit: 'cover' | 'contain' = 'cover'): HTMLElement => {
    const box = h('div', `position:relative;overflow:hidden;${css}`)
    if (!src) { box.style.background = `linear-gradient(135deg, ${colors.accent}, ${colors.card})`; return box }
    const el = h('img', `position:absolute;inset:0;width:100%;height:100%;object-fit:${fit};${dim ? 'filter:grayscale(1);opacity:.5' : ''}`)
    el.alt = ''
    el.addEventListener('error', () => { el.style.visibility = 'hidden' }, { once: true })
    el.src = src
    box.append(el)
    return box
  }

  const priceTag = (text: string, size: number) => h('span', `flex:none;align-self:flex-start;font-weight:900;font-size:${size}vmin;background:${colors.accent};color:${colors.onAccent};padding:.3vmin 1.6vmin;border-radius:1.4vmin;white-space:nowrap;font-family:${headFont}`, [text])
  const badge = (text: string, size = 2.4) => h('span', `flex:none;align-self:flex-start;font-weight:800;font-size:${size}vmin;letter-spacing:.08em;text-transform:uppercase;border:.3vmin solid ${colors.accent};color:${colors.accent};padding:.2vmin 1.2vmin;border-radius:1vmin`, [text])
  const tappable = (node: HTMLElement, p: CompositionProduct) => {
    if (!o.onTap) return node
    node.style.cursor = 'pointer'
    node.addEventListener('click', (e) => { e.stopPropagation(); o.onTap!({ name: p.name, description: p.description, price: `${p.fromPrice ? 'desde ' : ''}${formatPrice(p.price)}`, image: p.image }) })
    return node
  }
  const priceOf = (p: { price: number; fromPrice: boolean }) => `${p.fromPrice ? 'desde ' : ''}${formatPrice(p.price)}`

  async function renderModule(m: ResolvedModule): Promise<HTMLElement | null> {
    switch (m.type) {
      case 'brand-header': {
        const logo = m.config.showLogo && o.board.brand.logo ? await photo(o.board.brand.logo) : null
        const logoEl = logo ? (() => { const e = h('img', 'max-height:9vmin;max-width:28vmin;object-fit:contain'); e.alt = ''; e.src = logo; return e })() : h('div', `font-weight:900;font-size:4.4vmin;font-family:${headFont}`, [o.board.brand.name])
        // El QR global va en el encabezado (no tapa precios); sin encabezado, en la esquina.
        const qr = wantsGlobalQr ? await qrInline(o.orderUrl) : null
        if (qr) qrPlaced = true
        return h('header', `display:flex;align-items:center;gap:3vmin;padding:2vmin 4vmin;border-bottom:.5vmin solid ${colors.accent}`, [
          logoEl,
          h('div', `flex:1;min-width:0;font-size:3.2vmin;color:${colors.muted};${clamp(1)}`, [m.config.tagline || '']),
          qr,
        ])
      }
      case 'hero-product': {
        const p = m.product!
        const pic = await photo(p.image)
        const text = h('div', `${landscape ? 'flex:1 1 0' : 'flex:none'};min-width:0;display:flex;flex-direction:column;justify-content:safe center;gap:${landscape ? 1.4 : 2}vmin;padding:${landscape ? '2vmin 4vmin' : '3vmin 4vmin'}`, [
          m.config.badge ? badge(m.config.badge, 2.8) : null,
          h('div', `flex:none;font-weight:900;font-size:${landscape ? 5.8 : 7.6}vmin;line-height:1.02;font-family:${headFont};${clamp(2)}`, [p.name]),
          p.description ? h('div', `flex:none;font-size:${landscape ? 2.8 : 3.4}vmin;color:${colors.muted};${clamp(landscape ? 1 : 2)}`, [p.description]) : null,
          h('div', 'flex:none;display:flex;align-items:baseline;gap:2vmin', [
            p.originalPrice ? h('s', `font-size:3.4vmin;color:${colors.muted}`, [formatPrice(p.originalPrice)]) : null,
            priceTag(priceOf(p), landscape ? 5 : 7),
          ]),
        ])
        const media = img(pic, landscape ? 'flex:0 0 46%;align-self:stretch' : 'width:100%;flex:1 1 0;min-height:14vmin')
        return tappable(h('section', `display:flex;flex-direction:${landscape ? 'row' : 'column'};min-height:0;overflow:hidden`, [media, text]), p)
      }
      case 'product-grid': {
        const n = m.products.length
        const cols = landscape ? Math.min(n, 4) : Math.min(n, 2)
        const rows = Math.ceil(n / cols)
        const pics = await Promise.all(m.products.map((p) => photo(p.image)))
        const grid = h('section', `display:grid;grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},1fr);gap:2vmin;padding:2vmin 4vmin;min-height:0`)
        m.products.forEach((p, k) => {
          grid.append(tappable(h('div', `display:flex;flex-direction:column;gap:1vmin;min-height:0;min-width:0;background:${colors.card};border-radius:2vmin;padding:1.2vmin;overflow:hidden`, [
            img(pics[k], 'width:100%;flex:1 1 0;min-height:8vmin;border-radius:1.4vmin'),
            h('div', `flex:none;font-weight:800;font-size:2.8vmin;line-height:1.1;font-family:${headFont};${clamp(2)}`, [p.name]),
            m.config.showDescriptions && p.description ? h('div', `font-size:1.9vmin;color:${colors.muted};${clamp(1)}`, [p.description]) : null,
            priceTag(priceOf(p), 2.8),
          ]), p))
        })
        return grid
      }
      case 'combo-highlight': {
        const c = m.combo!
        const pic = await photo(c.image)
        return h('section', `display:flex;flex-direction:${landscape ? 'row' : 'column'};gap:3vmin;margin:2vmin 4vmin;padding:2vmin;border-radius:2.4vmin;background:${colors.card};min-height:0;overflow:hidden`, [
          img(pic, landscape ? 'flex:0 0 34%;align-self:stretch;border-radius:1.8vmin' : 'width:100%;flex:1 1 0;min-height:12vmin;border-radius:1.8vmin'),
          h('div', `${landscape ? 'flex:1 1 0' : 'flex:none'};min-width:0;display:flex;flex-direction:column;justify-content:safe center;gap:${landscape ? 1 : 1.4}vmin`, [
            m.config.badge ? badge(m.config.badge, landscape ? 2 : 2.4) : badge('Combo', landscape ? 2 : 2.4),
            h('div', `flex:none;font-weight:900;font-size:${landscape ? 4.4 : 5}vmin;line-height:1.05;font-family:${headFont};${clamp(landscape ? 1 : 2)}`, [c.name]),
            c.includes.length ? h('div', `flex:none;display:flex;flex-wrap:wrap;gap:1vmin;max-height:${landscape ? 4.4 : 8}vmin;overflow:hidden`, c.includes.slice(0, 6).map((n) => h('span', `font-size:2.2vmin;padding:.3vmin 1.2vmin;border-radius:1vmin;border:.2vmin solid ${colors.muted};color:${colors.muted}`, [n]))) : null,
            c.price ? priceTag(formatPrice(c.price), landscape ? 3.6 : 4.6) : null,
          ]),
        ])
      }
      case 'promo-banner': {
        const p = m.promo!
        const pic = await photo(p.image)
        const when = promoWhen(p)
        const deal = p.price ? formatPrice(p.price) : p.percent ? `hasta ${p.percent}% off` : null
        return h('section', `display:flex;align-items:stretch;margin:2vmin 4vmin;border-radius:2.4vmin;background:${colors.accent};color:${colors.onAccent};min-height:0;overflow:hidden`, [
          pic ? img(pic, 'flex:0 0 32%;align-self:stretch') : null,
          h('div', 'flex:1;min-width:0;min-height:0;overflow:hidden;display:flex;flex-direction:column;justify-content:center;gap:1.2vmin;padding:2.4vmin 3.4vmin', [
            m.config.headline ? h('div', 'flex:none;font-weight:800;font-size:2.6vmin;letter-spacing:.12em;text-transform:uppercase', [m.config.headline]) : null,
            h('div', `flex:none;font-weight:900;font-size:${landscape ? 4.6 : 5.4}vmin;line-height:1.05;font-family:${headFont};${clamp(landscape ? 1 : 2)}`, [p.title]),
            p.text ? h('div', `flex:none;font-size:2.6vmin;opacity:.9;${clamp(1)}`, [p.text]) : null,
            h('div', 'flex:none;display:flex;align-items:baseline;gap:2vmin;flex-wrap:wrap', [
              p.originalPrice ? h('s', 'font-size:3vmin;opacity:.75', [formatPrice(p.originalPrice)]) : null,
              deal ? h('span', `font-weight:900;font-size:5.4vmin;font-family:${headFont}`, [deal]) : null,
              when ? h('span', 'font-size:2.4vmin;font-weight:700;opacity:.9', [when]) : null,
            ]),
          ]),
        ])
      }
      case 'drinks-row': {
        const pics = await Promise.all(m.products.map((p) => photo(p.image)))
        const row = h('section', `display:grid;grid-template-columns:repeat(${m.products.length},1fr);gap:2vmin;padding:1.6vmin 4vmin;min-height:0`)
        m.products.forEach((p, k) => {
          row.append(tappable(h('div', 'display:flex;flex-direction:column;align-items:center;gap:.8vmin;min-width:0;min-height:0;text-align:center', [
            img(pics[k], `flex:1 1 0;min-height:6vmin;aspect-ratio:1;max-width:100%;border-radius:50%`),
            h('div', `font-weight:700;font-size:2.2vmin;${clamp(1)}`, [p.name]),
            h('div', `font-weight:900;font-size:2.6vmin;color:${colors.accent};font-family:${headFont}`, [priceOf(p)]),
          ]), p))
        })
        return row
      }
      case 'price-list': {
        const box = h('section', `column-count:${landscape ? 2 : 1};column-gap:6vmin;padding:2vmin 4vmin;min-height:0;overflow:hidden`)
        for (const s of m.sections) {
          const block = h('div', 'break-inside:avoid;margin-bottom:2.4vmin', [
            h('div', `font-weight:900;font-size:3.4vmin;text-transform:uppercase;letter-spacing:.06em;font-family:${headFont};border-bottom:.4vmin solid ${colors.accent};padding-bottom:.6vmin;margin-bottom:1vmin;break-after:avoid`, [s.parent ? `${s.parent} · ${s.name}` : s.name]),
          ])
          for (const p of s.products) {
            block.append(h('div', 'display:flex;align-items:baseline;gap:1vmin;font-size:2.8vmin;line-height:1.5', [
              h('span', `white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70%`, [p.name]),
              h('span', `flex:1;border-bottom:.3vmin dotted ${colors.muted};opacity:.6;transform:translateY(-.6vmin)`),
              h('span', `font-weight:800;white-space:nowrap;font-family:${headFont}`, [priceOf(p)]),
            ]))
          }
          box.append(block)
        }
        return box
      }
      case 'illustration-block': {
        const pic = await photo(m.imageUrl)
        const pos = m.config.imagePosition
        const dir = pos === 'left' ? 'row' : pos === 'right' ? 'row-reverse' : pos === 'top' ? 'column' : 'column-reverse'
        const horizontal = dir.startsWith('row')
        return h('section', `display:flex;flex-direction:${dir};gap:3vmin;padding:2vmin 4vmin;min-height:0;align-items:center`, [
          pic ? img(pic, horizontal ? 'flex:0 0 42%;align-self:stretch;min-height:14vmin;border-radius:2vmin' : 'width:100%;flex:1 1 0;min-height:14vmin;border-radius:2vmin', false, 'contain') : null,
          m.config.text ? h('div', `flex:1;min-width:0;font-weight:800;font-size:4.4vmin;line-height:1.15;font-family:${headFont};${clamp(4)}`, [m.config.text]) : null,
        ])
      }
      case 'qr-cta': {
        if (!o.orderUrl) return null
        const svg = await QRCode.toString(o.orderUrl, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }).catch(() => null)
        if (!svg) return null
        const code = h('div', 'width:20vmin;height:20vmin;flex:none;background:#fff;border-radius:1.6vmin;padding:1vmin')
        code.innerHTML = svg
        const s = code.querySelector('svg')
        if (s) { s.setAttribute('width', '100%'); s.setAttribute('height', '100%') }
        return h('section', `display:flex;align-items:center;gap:3vmin;margin:2vmin 4vmin 3vmin;padding:2vmin 3vmin;border-radius:2.4vmin;background:${colors.card}`, [
          code,
          h('div', 'flex:1;min-width:0;display:flex;flex-direction:column;gap:1vmin', [
            h('div', `flex:none;font-weight:900;font-size:5vmin;line-height:1.05;font-family:${headFont}`, [m.config.headline]),
            m.config.subtext ? h('div', `font-size:2.8vmin;color:${colors.muted}`, [m.config.subtext]) : null,
          ]),
        ])
      }
    }
  }

  async function render() {
    await injectFonts(o.board, o.objectUrl)
    if (cancelled) return
    const view = h('div', 'position:absolute;inset:0;display:flex;flex-direction:column;opacity:0;transition:opacity .5s')
    const hasPriceList = modules.some((m) => m.type === 'price-list')
    for (const m of modules) {
      const el = await renderModule(m).catch(() => null)
      if (!el) continue
      // Alto natural primero (el texto nunca se recorta); lo que sobra se
      // reparte según el peso. Solo la lista de precios y las grillas ceden
      // alto si no entra todo (recortan filas, no textos a la mitad).
      // Con lista de precios, el resto queda en su alto natural y la lista se lleva lo que sobra.
      const w = hasPriceList && m.type !== 'price-list' ? 0 : WEIGHT[m.type]
      const shrinks = m.type === 'price-list' || m.type === 'product-grid' || m.type === 'drinks-row' || m.type === 'illustration-block'
      el.style.flex = `${w} ${shrinks ? 1 : 0} ${m.type === 'price-list' ? '0' : 'auto'}`
      el.style.minHeight = shrinks ? '0' : ''
      view.append(el)
    }
    if (wantsGlobalQr && !qrPlaced) {
      const qr = await qrBadge(o.orderUrl, colors as BoardColors)
      if (qr) view.append(qr)
    }
    if (o.freshness === 'stale') view.append(h('div', `position:absolute;left:4vmin;bottom:1vmin;font-size:1.9vmin;color:${colors.muted}`, ['Sujeto a disponibilidad. Consultá en el mostrador.']))
    if (cancelled) return
    o.host.append(view)
    requestAnimationFrame(() => { view.style.opacity = '1' })
    o.host.style.opacity = '1'
    o.onShown()
    timer = setTimeout(() => finish(true), o.board.pageMs)
  }

  void render()
  return () => finish(false, 'cancelada')
}
