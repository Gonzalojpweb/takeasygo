// ============================================================================
// Composiciones (Élite) v2 — tótems y TV con lienzo de diseño y GSAP
// ============================================================================
// · Lienzo real: se dibuja en designWidth × designHeight (p. ej. 1080 × 1920
//   para un tótem) y se escala a la pantalla sin deformar, centrado, con
//   bandas del color de fondo si la proporción no coincide. Las medidas son
//   relativas al lienzo (u = 1 % del lado corto), así el diseño es idéntico en
//   720p, 1080p o un tótem.
// · Cada módulo tiene su diseño horizontal y vertical (no se rota ni se
//   estira): el producto estrella va a sangre arriba en vertical y a la
//   izquierda en horizontal; la grilla tiene 2 columnas en vertical y hasta 4
//   en horizontal; la lista de precios 1 o 2 columnas.
// · Animaciones con GSAP: cada página se arma en secuencia (encabezado,
//   módulos, CTA) con la entrada de cada módulo (configurable o la
//   recomendada), cascada en listas, precio con rebote, sello de descuento,
//   Ken Burns lento en las fotos grandes y transición entre páginas.
// · Si no entra todo, se reparte en páginas (encabezado arriba y el QR
//   «footer» abajo se repiten en cada una).
// · Sin degradés: superficies sólidas del color de la marca.
// ============================================================================

import { gsap } from 'gsap'
import QRCode from 'qrcode'
import type { TapInfo } from './detail'
import {
  boardColors, compositionVisible, discountPercent, fitCanvas, formatPrice, packModules, promoWhen,
  type BoardColors, type CompositionBoard, type CompositionProduct, type Freshness, type ModuleAnimation, type ResolvedModule,
} from '../board'

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

type Enter = ModuleAnimation['enter']

function h<K extends keyof HTMLElementTagNameMap>(tag: K, css: string, children: Array<Node | string | null> = []): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  el.style.cssText = css
  for (const c of children) if (c !== null) el.append(typeof c === 'string' ? document.createTextNode(c) : c)
  return el
}
const clamp = (n: number) => `display:-webkit-box;-webkit-line-clamp:${n};-webkit-box-orient:vertical;overflow:hidden`
const SYSTEM = 'system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif'
const fam = (f: string | null) => (f ? `"${f.replace(/"/g, '')}",${SYSTEM}` : SYSTEM)

/** Alto que sobra: cuánto se lleva cada módulo además del suyo natural. */
const WEIGHT: Record<ResolvedModule['type'], number> = {
  'brand-header': 0, 'hero-product': 3, 'product-grid': 2, 'combo-highlight': 1.4, 'promo-banner': 1.4,
  'drinks-row': 1, 'price-list': 4, 'illustration-block': 1.5, 'qr-cta': 0,
}
/** Entrada recomendada por módulo cuando la config dice 'auto'. */
const AUTO_ENTER: Record<ResolvedModule['type'], Enter> = {
  'brand-header': 'fadeUp', 'hero-product': 'scaleIn', 'product-grid': 'stagger', 'combo-highlight': 'slideLeft', 'promo-banner': 'scaleIn',
  'drinks-row': 'stagger', 'price-list': 'stagger', 'illustration-block': 'fade', 'qr-cta': 'fadeUp',
}
/** Cascada desde la izquierda para filas de listas; desde abajo para tarjetas. */
const STAGGER_FROM_LEFT = new Set<ResolvedModule['type']>(['price-list', 'combo-highlight'])

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
      document.fonts.add(await new FontFace(f.family, `url(${blob})`).load())
      loadedFonts.add(key)
    } catch { /* archivo ilegible: queda la del sistema */ }
    URL.revokeObjectURL(blob)
  }
}

export function playCompositionBoard(o: PlayCompositionOptions): () => void {
  const colors: BoardColors = boardColors(o.board)
  // Lienzo: el de la composición; las viejas (sin lienzo) usan la forma de la pantalla.
  const screenPortrait = window.innerHeight > window.innerWidth
  const portrait = o.board.orientation ? o.board.orientation === 'portrait' : screenPortrait
  const DW = o.board.designWidth || (portrait ? 1080 : 1920)
  const DH = o.board.designHeight || (portrait ? 1920 : 1080)
  const U = Math.min(DW, DH) / 100
  const u = (n: number) => `${Math.round(n * U * 10) / 10}px`
  const headFont = fam(o.board.brand.fontHeading ?? o.board.brand.fontBody)
  const bodyFont = fam(o.board.brand.fontBody ?? o.board.brand.fontHeading)
  const modules = compositionVisible(o.board, o.nowMs(), o.timeZone)
  const urls: string[] = []
  const timelines: gsap.core.Animation[] = []
  let cancelled = false
  let timer: ReturnType<typeof setTimeout> | null = null

  // Pantalla: fondo del color de la marca (bandas si la proporción no coincide) y el lienzo escalado adentro.
  o.host.style.cssText = `position:absolute;inset:0;background:${colors.bg};overflow:hidden;opacity:0`
  const canvas = h('div', `position:absolute;left:0;top:0;width:${DW}px;height:${DH}px;transform-origin:0 0;background:${colors.bg};color:${colors.text};font-family:${bodyFont};overflow:hidden`)
  o.host.append(canvas)
  const place = () => {
    const f = fitCanvas(DW, DH, o.host.clientWidth || window.innerWidth, o.host.clientHeight || window.innerHeight)
    canvas.style.transform = `translate(${f.x}px, ${f.y}px) scale(${f.scale})`
  }
  place()
  window.addEventListener('resize', place)

  const finish = (ok: boolean, reason?: string) => {
    if (cancelled) return
    cancelled = true
    if (timer) clearTimeout(timer)
    window.removeEventListener('resize', place)
    for (const t of timelines) t.kill()
    gsap.killTweensOf(canvas.querySelectorAll('*'))
    setTimeout(() => { for (const x of urls) URL.revokeObjectURL(x) }, 1500)
    o.onDone(ok, reason)
  }
  if (!modules.length) { timer = setTimeout(() => finish(true), 1000); return () => finish(false, 'cancelada') }

  // ── Piezas comunes ────────────────────────────────────────────────────────
  const photo = async (src: string | null): Promise<string | null> => {
    if (!src) return null
    const x = await o.objectUrl(src).catch(() => null)
    if (x) urls.push(x)
    return x
  }
  /** Foto a sangre en su recuadro (no aporta alto propio). Sin foto: superficie sólida. */
  const cover = (src: string | null, css: string, kenBurns = false, fit: 'cover' | 'contain' = 'cover'): HTMLElement => {
    const box = h('div', `position:relative;overflow:hidden;background:${colors.card};${css}`)
    if (!src) return box
    const img = h('img', `position:absolute;inset:0;width:100%;height:100%;object-fit:${fit};will-change:transform`)
    img.alt = ''
    img.addEventListener('error', () => { img.style.visibility = 'hidden' }, { once: true })
    img.src = src
    if (kenBurns) img.dataset.kb = '1'
    box.append(img)
    return box
  }
  const priceEl = (text: string, size: number, solid = true) => {
    const el = h('span', `flex:none;align-self:flex-start;display:inline-block;font-weight:900;font-size:${u(size)};line-height:1;letter-spacing:-.02em;font-family:${headFont};white-space:nowrap;${solid ? `background:${colors.accent};color:${colors.onAccent};padding:${u(size * 0.18)} ${u(size * 0.32)};border-radius:${u(size * 0.18)}` : ''}`, [text])
    el.dataset.price = '1'
    return el
  }
  const strike = (cents: number | null, size: number, color = colors.muted) => (cents ? h('s', `flex:none;font-size:${u(size)};color:${color};font-weight:600`, [formatPrice(cents)]) : null)
  const badge = (text: string, size = 2.2) => h('span', `flex:none;align-self:flex-start;font-weight:800;font-size:${u(size)};letter-spacing:.12em;text-transform:uppercase;background:${colors.text};color:${colors.bg};padding:${u(size * 0.35)} ${u(size * 0.7)};border-radius:${u(size * 2)}`, [text])
  /** Sello circular de descuento (con animación propia). */
  const stamp = (pct: number, size: number) => {
    const el = h('div', `position:absolute;z-index:2;width:${u(size)};height:${u(size)};border-radius:50%;background:${colors.accent};color:${colors.onAccent};display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:${headFont};box-shadow:0 ${u(0.6)} ${u(2.4)} rgba(0,0,0,.28);transform:rotate(-12deg)`, [
      h('span', `font-weight:900;font-size:${u(size * 0.34)};line-height:1`, [`-${pct}%`]),
      h('span', `font-weight:800;font-size:${u(size * 0.12)};letter-spacing:.14em`, ['OFF']),
    ])
    el.dataset.stamp = '1'
    return el
  }
  const priceText = (p: { price: number; fromPrice: boolean }) => `${p.fromPrice ? 'desde ' : ''}${formatPrice(p.price)}`
  const tappable = (node: HTMLElement, p: CompositionProduct) => {
    if (!o.onTap) return node
    node.style.cursor = 'pointer'
    node.addEventListener('click', (e) => { e.stopPropagation(); o.onTap!({ name: p.name, description: p.description, price: priceText(p), image: p.image }) })
    return node
  }
  const qrSvg = async (size: number): Promise<HTMLElement | null> => {
    if (!o.orderUrl) return null
    const svg = await QRCode.toString(o.orderUrl, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }).catch(() => null)
    if (!svg) return null
    const box = h('div', `flex:none;width:${u(size)};height:${u(size)};background:#fff;border-radius:${u(1.6)};padding:${u(1)}`)
    box.innerHTML = svg
    const s = box.querySelector('svg')
    if (s) { s.setAttribute('width', '100%'); s.setAttribute('height', '100%') }
    return box
  }
  const wantsGlobalQr = o.board.showQr !== false && !modules.some((m) => m.type === 'qr-cta')

  // ── Módulos (cada uno con su versión horizontal y vertical) ──────────────
  async function renderModule(m: ResolvedModule): Promise<HTMLElement | null> {
    switch (m.type) {
      case 'brand-header': {
        const logo = m.config.showLogo && o.board.brand.logo ? await photo(o.board.brand.logo) : null
        const logoEl = logo
          ? (() => { const e = h('img', `height:${u(portrait ? 11 : 9)};max-width:${u(34)};object-fit:contain`); e.alt = ''; e.src = logo; return e })()
          : h('div', `font-weight:900;font-size:${u(portrait ? 6 : 5)};letter-spacing:-.02em;font-family:${headFont}`, [o.board.brand.name])
        const qr = wantsGlobalQr ? await qrSvg(portrait ? 10 : 9) : null
        return h('header', `display:flex;align-items:center;gap:${u(3)};padding:${u(3)} ${u(4)};border-bottom:${u(0.7)} solid ${colors.accent}`, [
          logoEl,
          h('div', `flex:1;min-width:0;font-size:${u(portrait ? 3.4 : 3)};font-weight:600;color:${colors.muted};${clamp(2)}`, [m.config.tagline || '']),
          qr ? h('div', `display:flex;align-items:center;gap:${u(1.4)}`, [h('div', `font-weight:800;font-size:${u(1.9)};text-align:right;line-height:1.15;max-width:${u(14)}`, ['Pedí desde tu celular']), qr]) : null,
        ])
      }
      case 'hero-product': {
        const p = m.product!
        const pic = await photo(p.image)
        const pct = m.config.showDiscount !== false ? discountPercent(p.price, p.originalPrice) : null
        // Etiqueta en el color de la marca, espaciada; precio enorme en ese color, sin caja.
        const tag = m.config.badge ? h('div', `flex:none;font-weight:800;font-size:${u(portrait ? 3 : 2.4)};letter-spacing:.22em;text-transform:uppercase;color:${colors.accent}`, [m.config.badge]) : null
        const title = h('div', `flex:none;font-weight:900;font-size:${u(portrait ? 10.5 : 8)};line-height:1;letter-spacing:-.02em;text-transform:uppercase;padding-bottom:${u(0.4)};font-family:${headFont};${clamp(2)}`, [p.name])
        const desc = p.description ? h('div', `flex:none;font-size:${u(portrait ? 3.2 : 2.8)};line-height:1.25;opacity:.82;${clamp(2)}`, [p.description]) : null
        for (const part of [tag, title, desc]) if (part) part.dataset.part = '1'
        const big = h('div', `flex:none;font-weight:900;font-size:${u(portrait ? 12.5 : 9.5)};line-height:.9;letter-spacing:-.03em;color:${colors.accent};font-family:${headFont};white-space:nowrap`, [priceText(p)])
        big.dataset.price = '1'
        const priceRow = h('div', `flex:none;display:flex;align-items:flex-end;gap:${u(2)};margin-top:${u(1.4)}`, [
          big,
          p.originalPrice ? h('s', `font-size:${u(portrait ? 3.6 : 3)};color:${colors.muted};font-weight:700;margin-bottom:${u(1.2)}`, [formatPrice(p.originalPrice)]) : null,
        ])
        if (portrait) {
          // A sangre: la foto ocupa el módulo y el texto va abajo, sobre un oscurecido suave solo detrás del texto.
          const media = cover(pic, `position:absolute;inset:0`, m.config.kenBurns !== false)
          const scrim = h('div', 'position:absolute;inset:0;background:linear-gradient(to top, rgba(0,0,0,.9) 0%, rgba(0,0,0,.55) 35%, rgba(0,0,0,0) 62%)')
          const text = h('div', `position:absolute;left:${u(5)};right:${u(5)};bottom:${u(4)};display:flex;flex-direction:column;gap:${u(1.2)};color:#fff`, [tag, title, desc, priceRow])
          const box = h('section', `position:relative;min-height:${Math.round(DH * 0.46)}px;overflow:hidden;background:${colors.card}`, [media, scrim, text])
          if (pct) { const st = stamp(pct, 20); st.style.right = u(5); st.style.top = u(5); box.append(st) }
          return tappable(box, p)
        }
        const media = cover(pic, 'flex:0 0 56%;align-self:stretch', m.config.kenBurns !== false)
        if (pct) { const st = stamp(pct, 17); st.style.right = u(4); st.style.top = u(4); media.append(st) }
        const text = h('div', `flex:1 1 0;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:${u(1.6)};padding:${u(3)} ${u(5)}`, [tag, title, desc, priceRow])
        return tappable(h('section', 'display:flex;flex-direction:row;min-height:0', [media, text]), p)
      }
      case 'product-grid': {
        const n = m.products.length
        const cols = portrait ? (n <= 2 ? n : 2) : Math.min(n, n === 5 || n === 6 ? 3 : 4)
        const pics = await Promise.all(m.products.map((p) => photo(p.image)))
        const grid = h('section', `display:grid;grid-template-columns:repeat(${cols},1fr);grid-auto-rows:1fr;gap:${u(2.4)};padding:${u(3)} ${u(4)};min-height:0`)
        m.products.forEach((p, k) => {
          const card = tappable(h('div', `display:flex;flex-direction:column;min-width:0;min-height:0;background:${colors.card};border-radius:${u(2.4)};overflow:hidden`, [
            cover(pics[k], `width:100%;flex:1 1 0;min-height:${u(portrait ? 16 : 12)}`),
            h('div', `flex:none;display:flex;flex-direction:column;gap:${u(1)};padding:${u(1.8)} ${u(2)} ${u(2)}`, [
              h('div', `font-weight:800;font-size:${u(portrait ? 3.4 : 2.8)};line-height:1.1;font-family:${headFont};${clamp(2)}`, [p.name]),
              m.config.showDescriptions && p.description ? h('div', `font-size:${u(portrait ? 2.4 : 2)};color:${colors.muted};${clamp(2)}`, [p.description]) : null,
              h('div', `display:flex;align-items:baseline;gap:${u(1.4)}`, [priceEl(priceText(p), portrait ? 3.6 : 3), strike(p.originalPrice, portrait ? 2.2 : 1.9)]),
            ]),
          ]), p)
          card.dataset.item = '1'
          grid.append(card)
        })
        return grid
      }
      case 'combo-highlight': {
        const c = m.combo!
        const pic = await photo(c.image)
        const list = c.includes.length
          ? h('ul', `flex:none;list-style:none;margin:0;padding:0;display:grid;grid-template-columns:${portrait ? '1fr 1fr' : '1fr'};gap:${u(0.8)} ${u(3)}`, c.includes.slice(0, 6).map((n) => {
            const li = h('li', `display:flex;align-items:center;gap:${u(1.2)};font-size:${u(portrait ? 3 : 2.5)};font-weight:600`, [
              h('span', `flex:none;width:${u(1.4)};height:${u(1.4)};border-radius:50%;background:${colors.accent}`), n,
            ])
            li.dataset.item = '1'
            return li
          }))
          : null
        return h('section', `display:flex;flex-direction:${portrait ? 'column' : 'row'};margin:${u(2.4)} ${u(4)};border-radius:${u(3)};background:${colors.card};overflow:hidden;min-height:0`, [
          cover(pic, portrait ? `width:100%;flex:1 1 0;min-height:${u(22)}` : 'flex:0 0 42%;align-self:stretch', m.config.kenBurns === true),
          h('div', `${portrait ? 'flex:none' : 'flex:1 1 0'};min-width:0;display:flex;flex-direction:column;justify-content:center;gap:${u(1.8)};padding:${u(3.4)} ${u(4)}`, [
            badge(m.config.badge || 'Combo', portrait ? 2.4 : 2),
            h('div', `flex:none;font-weight:900;font-size:${u(portrait ? 7 : 5.6)};line-height:1;letter-spacing:-.02em;font-family:${headFont};${clamp(2)}`, [c.name]),
            c.includes.length ? h('div', `flex:none;font-size:${u(2)};font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:${colors.muted}`, ['Incluye']) : null,
            list,
            c.price ? priceEl(formatPrice(c.price), portrait ? 7 : 5.4) : null,
          ]),
        ])
      }
      case 'promo-banner': {
        const p = m.promo!
        const pic = await photo(p.image)
        const when = promoWhen(p)
        const pct = m.config.showDiscount !== false ? (p.price ? discountPercent(p.price, p.originalPrice) : p.percent) : null
        // Foto a sangre + placa sólida con el texto (sin degradés).
        const plate = h('div', `position:absolute;z-index:1;left:${u(4)};bottom:${u(4)};max-width:${portrait ? '84%' : '58%'};background:${colors.accent};color:${colors.onAccent};border-radius:${u(2.6)};padding:${u(3)} ${u(3.6)};display:flex;flex-direction:column;gap:${u(1.4)}`, [
          m.config.headline ? h('div', `font-weight:800;font-size:${u(2.4)};letter-spacing:.14em;text-transform:uppercase`, [m.config.headline]) : null,
          h('div', `font-weight:900;font-size:${u(portrait ? 7 : 5.6)};line-height:1;letter-spacing:-.02em;font-family:${headFont};${clamp(2)}`, [p.title]),
          p.text ? h('div', `font-size:${u(2.6)};font-weight:600;opacity:.92;${clamp(2)}`, [p.text]) : null,
          h('div', `display:flex;align-items:baseline;gap:${u(2)};flex-wrap:wrap`, [
            p.price ? priceEl(formatPrice(p.price), portrait ? 7 : 5.6, false) : p.percent ? priceEl(`hasta ${p.percent}% off`, portrait ? 6 : 5, false) : null,
            p.price ? strike(p.originalPrice, 3, colors.onAccent) : null,
          ]),
          when ? h('div', `font-size:${u(2.4)};font-weight:700`, [when]) : null,
        ])
        const box = cover(pic, `margin:${u(2.4)} ${u(4)};border-radius:${u(3)};min-height:${u(portrait ? 40 : 30)}`, m.config.kenBurns !== false)
        box.append(plate)
        if (pct) { const st = stamp(pct, portrait ? 18 : 15); st.style.right = u(4); st.style.top = u(4); box.append(st) }
        return box
      }
      case 'drinks-row': {
        const pics = await Promise.all(m.products.map((p) => photo(p.image)))
        const cols = portrait ? Math.min(m.products.length, 4) : Math.min(m.products.length, 6)
        const row = h('section', `display:grid;grid-template-columns:repeat(${cols},1fr);gap:${u(2.4)};padding:${u(2.4)} ${u(4)}`)
        m.products.forEach((p, k) => {
          const item = tappable(h('div', `display:flex;flex-direction:column;align-items:center;gap:${u(1)};min-width:0;text-align:center`, [
            cover(pics[k], `width:${u(portrait ? 16 : 13)};height:${u(portrait ? 16 : 13)};border-radius:50%`),
            h('div', `font-weight:700;font-size:${u(portrait ? 2.6 : 2.2)};${clamp(1)}`, [p.name]),
            h('div', `font-weight:900;font-size:${u(portrait ? 3.2 : 2.8)};color:${colors.accent};font-family:${headFont}`, [priceText(p)]),
          ]), p)
          item.dataset.item = '1'
          row.append(item)
        })
        return row
      }
      case 'price-list': {
        // Grilla (sin columnas CSS, que pueden trabar el layout de Chrome): 1 sección por fila en vertical, 2 en horizontal.
        const box = h('section', `display:grid;grid-template-columns:repeat(${portrait ? 1 : Math.min(2, m.sections.length)},1fr);column-gap:${u(7)};align-items:start;padding:${u(2)} ${u(5)};min-height:0;overflow:hidden`)
        for (const s of m.sections) {
          const block = h('div', `display:flex;flex-direction:column;margin-bottom:${u(2.4)}`, [
            h('div', `font-weight:700;font-size:${u(portrait ? 2.6 : 2.2)};text-transform:uppercase;letter-spacing:.2em;color:${colors.muted};margin-bottom:${u(0.6)}`, [s.parent ? `${s.parent} · ${s.name}` : s.name]),
          ])
          for (const p of s.products) {
            const row = h('div', `display:flex;justify-content:space-between;align-items:baseline;gap:${u(2)};padding:${u(portrait ? 2.6 : 1.8)} 0;border-bottom:${u(0.2)} dashed ${colors.muted}`, [
              h('span', `font-weight:900;font-size:${u(portrait ? 4.4 : 3.2)};font-family:${headFont};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0`, [p.name]),
              h('span', `flex:none;font-weight:900;font-size:${u(portrait ? 4.8 : 3.4)};color:${colors.accent};font-family:${headFont};white-space:nowrap`, [priceText(p)]),
            ])
            row.dataset.item = '1'
            block.append(row)
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
        return h('section', `display:flex;flex-direction:${dir};gap:${u(3)};padding:${u(2.4)} ${u(4)};min-height:0;align-items:center`, [
          pic ? cover(pic, horizontal ? `flex:0 0 44%;align-self:stretch;min-height:${u(16)};border-radius:${u(2.4)};background:transparent` : `width:100%;flex:1 1 0;min-height:${u(16)};border-radius:${u(2.4)};background:transparent`, m.config.kenBurns === true, 'contain') : null,
          m.config.text ? h('div', `flex:1;min-width:0;font-weight:900;font-size:${u(portrait ? 6 : 5)};line-height:1.05;letter-spacing:-.02em;font-family:${headFont};${clamp(4)}`, [m.config.text]) : null,
        ])
      }
      case 'qr-cta': {
        // Footer de tótem: banda sólida del color de la marca con QR grande.
        const qr = await qrSvg(portrait ? 22 : 12)
        if (!qr) return null
        return h('footer', `display:flex;align-items:center;gap:${u(4)};padding:${portrait ? `${u(3.4)} ${u(5)}` : `${u(1.8)} ${u(5)}`};background:${colors.accent};color:${colors.onAccent}`, [
          h('div', `flex:1;min-width:0;display:flex;flex-direction:column;gap:${u(1.2)}`, [
            h('div', `font-weight:900;font-size:${u(portrait ? 7.4 : 4.6)};line-height:.98;letter-spacing:-.02em;font-family:${headFont}`, [m.config.headline]),
            m.config.subtext ? h('div', `font-size:${u(portrait ? 3.2 : 2.6)};font-weight:600;opacity:.9`, [m.config.subtext]) : null,
          ]),
          qr,
        ])
      }
    }
  }

  // ── Animaciones (GSAP) ────────────────────────────────────────────────────
  function enterModule(tl: gsap.core.Timeline, el: HTMLElement, m: ResolvedModule, at: number): number {
    const a = m.animation
    const kind: Enter = !a || a.enter === 'auto' ? AUTO_ENTER[m.type] : a.enter
    const dur = a?.duration ?? 0.8
    const ease = a?.ease ?? 'power3.out'
    const start = at + (a?.delay ?? 0)
    if (kind === 'none') return start
    const items = el.querySelectorAll<HTMLElement>('[data-item]')
    switch (kind) {
      case 'fade': tl.from(el, { opacity: 0, duration: dur, ease }, start); break
      case 'fadeUp': tl.from(el, { opacity: 0, y: 6 * U, duration: dur, ease }, start); break
      case 'scaleIn':
        if (m.type === 'hero-product') {
          tl.from(el, { opacity: 0, duration: dur * 0.6, ease }, start)
          const parts = el.querySelectorAll<HTMLElement>('[data-part]')
          if (parts.length) tl.from(parts, { y: 5 * U, opacity: 0, duration: dur, ease, stagger: 0.18 }, start + 0.15)
        } else tl.from(el, { opacity: 0, scale: 0.9, duration: dur, ease }, start)
        break
      case 'slideLeft': tl.from(el, { opacity: 0, x: 10 * U, duration: dur, ease }, start); break
      case 'slideRight': tl.from(el, { opacity: 0, x: -10 * U, duration: dur, ease }, start); break
      case 'stagger':
        if (items.length) tl.from(items, STAGGER_FROM_LEFT.has(m.type)
          ? { opacity: 0, x: -10 * U, duration: dur * 0.85, ease, stagger: a?.stagger ? Math.max(a.stagger, 0.12) : 0.15 }
          : { opacity: 0, y: 4 * U, duration: dur * 0.75, ease, stagger: a?.stagger ?? 0.08 }, start)
        else tl.from(el, { opacity: 0, y: 6 * U, duration: dur, ease }, start)
        break
    }
    // Precios con rebote y sello de descuento, después de la entrada del módulo.
    const prices = el.querySelectorAll<HTMLElement>('[data-price]')
    if (prices.length && kind !== 'stagger') tl.from(prices, { scale: 0.6, opacity: 0, duration: 0.6, ease: 'back.out(2.2)', transformOrigin: 'left center', stagger: 0.06 }, start + dur * 0.55)
    el.querySelectorAll<HTMLElement>('[data-stamp]').forEach((st) => {
      tl.from(st, { scale: 0, rotation: -120, duration: 0.7, ease: 'back.out(1.8)' }, start + dur * 0.7)
      timelines.push(gsap.to(st, { rotation: -6, scale: 1.05, duration: 1.4, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: start + dur + 0.8 }))
    })
    return start
  }

  function kenBurns(view: HTMLElement) {
    view.querySelectorAll<HTMLElement>('[data-kb]').forEach((img, i) => {
      const d = Math.max(o.board.pageMs / 1000 + 4, 14)
      timelines.push(gsap.fromTo(img, { scale: 1, xPercent: 0 }, { scale: 1.14, xPercent: i % 2 ? 2 : -2, duration: d, ease: 'sine.inOut', yoyo: true, repeat: -1 }))
    })
  }

  // ── Armado de páginas ─────────────────────────────────────────────────────
  async function render() {
    await injectFonts(o.board, o.objectUrl)
    if (cancelled) return
    let header: HTMLElement | null = null
    let headerModule: ResolvedModule | null = null
    let footer: { el: HTMLElement; m: ResolvedModule } | null = null
    const items: Array<{ m: ResolvedModule; el: HTMLElement }> = []
    // Una lista de precios larga se parte por secciones (de a 2 en horizontal):
    // así sigue en la página siguiente en lugar de saltar entera.
    // Una sección larga (más de 6 filas) se parte en tandas con el mismo título.
    const ROWS = 6
    const expanded: ResolvedModule[] = modules.flatMap((m) => {
      if (m.type !== 'price-list') return [m]
      const chunks = m.sections.flatMap((sec) => {
        if (sec.products.length <= ROWS) return [sec]
        const parts = []
        for (let i = 0; i < sec.products.length; i += ROWS) parts.push({ ...sec, products: sec.products.slice(i, i + ROWS) })
        return parts
      })
      const per = portrait ? 1 : 2
      const out: ResolvedModule[] = []
      for (let i = 0; i < chunks.length; i += per) out.push({ ...m, sections: chunks.slice(i, i + per) })
      return out
    })
    for (const m of expanded) {
      const el = await renderModule(m).catch(() => null)
      if (!el) continue
      el.style.overflow = 'hidden'
      if (m.type === 'brand-header') { if (!header) { header = el; headerModule = m } }
      else if (m.type === 'qr-cta') { if (!footer) footer = { el, m } }
      else items.push({ m, el })
    }
    if (cancelled) return
    if (!items.length && !footer) { finish(true); return }

    // Alto natural de cada módulo en el lienzo (sin escalar) y reparto en páginas.
    const probe = h('div', `position:absolute;left:0;top:0;width:${DW}px;visibility:hidden;display:flex;flex-direction:column`)
    if (header) probe.append(header)
    if (footer) probe.append(footer.el)
    for (const it of items) probe.append(it.el)
    canvas.append(probe)
    const fixedH = (header?.offsetHeight ?? 0) + (footer?.el.offsetHeight ?? 0)
    const heights = items.map((it) => it.el.offsetHeight)
    probe.remove()
    const pages = items.length ? packModules(heights, Math.max(DH - fixedH, DH * 0.35)) : [[]]

    const views = pages.map((idxs, pi) => {
      const view = h('div', 'position:absolute;inset:0;display:flex;flex-direction:column')
      const head = header ? (pi === 0 ? header : (header.cloneNode(true) as HTMLElement)) : null
      if (head) { head.style.flex = '0 0 auto'; view.append(head) }
      const pageItems = idxs.map((i) => items[i])
      const hasPriceList = pageItems.some((it) => it.m.type === 'price-list')
      const alone = pageItems.length === 1
      const body = pageItems.map((it) => {
        const el = it.el
        const centered = alone && it.m.type !== 'price-list' && it.m.type !== 'product-grid'
        const w = centered || (hasPriceList && it.m.type !== 'price-list') ? 0 : WEIGHT[it.m.type]
        const shrinks = alone || it.m.type === 'price-list'
        el.style.flex = `${w} ${shrinks ? 1 : 0} auto`
        // Se respeta el alto mínimo propio del módulo (el producto estrella a sangre lo trae).
        if (centered) el.style.minHeight = el.style.minHeight || '55%'
        else if (shrinks && it.m.type === 'price-list') el.style.minHeight = '0'
        if (centered) { el.style.marginTop = 'auto'; el.style.marginBottom = 'auto' }
        view.append(el)
        return { el, m: it.m }
      })
      if (!pageItems.length) view.append(h('div', 'flex:1'))
      const foot = footer ? (pi === 0 ? footer.el : (footer.el.cloneNode(true) as HTMLElement)) : null
      if (foot) { foot.style.flex = '0 0 auto'; foot.style.marginTop = 'auto'; view.append(foot) }
      if (pages.length > 1) view.append(h('div', `position:absolute;left:50%;bottom:${u(foot ? 1 : 2)};transform:translateX(-50%);display:flex;gap:${u(1.2)};z-index:3`, pages.map((_, k) =>
        h('span', `width:${u(1.3)};height:${u(1.3)};border-radius:50%;background:${k === pi ? colors.accent : colors.muted};opacity:${k === pi ? 1 : 0.35}`))))
      if (o.freshness === 'stale') view.append(h('div', `position:absolute;left:${u(4)};bottom:${u(1)};font-size:${u(1.9)};color:${colors.muted};z-index:3`, ['Sujeto a disponibilidad. Consultá en el mostrador.']))
      return { view, head, foot, body }
    })
    if (cancelled) return

    const transition = o.board.transition ?? 'fade'
    let shown = false
    const show = (k: number) => {
      if (cancelled) return
      const { view, head, foot, body } = views[k]
      const prev = [...canvas.children].filter((c) => c !== view)
      canvas.append(view)
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
      timelines.push(tl)
      // Transición de página: la anterior se va y la nueva entra.
      if (prev.length && transition !== 'none') {
        tl.to(prev, { opacity: 0, duration: 0.45, ease: 'power2.in', onComplete: () => prev.forEach((p) => p.remove()) }, 0)
        if (transition === 'slide') tl.from(view, { x: 8 * U, opacity: 0, duration: 0.6 }, 0.3)
        else if (transition === 'zoom') tl.from(view, { scale: 1.05, opacity: 0, duration: 0.7 }, 0.3)
        else tl.from(view, { opacity: 0, duration: 0.5 }, 0.3)
      } else prev.forEach((p) => p.remove())
      // Secuencia: encabezado → módulos en orden → CTA.
      let at = prev.length ? 0.55 : 0.1
      if (head && headerModule && k === 0) { enterModule(tl, head, headerModule, at); at += 0.3 }
      for (const b of body) at = enterModule(tl, b.el, b.m, at) + 0.28
      if (foot && footer && k === 0) enterModule(tl, foot, footer.m, at)
      kenBurns(view)
      if (!shown) { shown = true; gsap.to(o.host, { opacity: 1, duration: 0.4 }); o.onShown() }
      timer = setTimeout(() => (k + 1 < views.length ? show(k + 1) : finish(true)), o.board.pageMs)
    }
    show(0)
  }

  void render()
  return () => finish(false, 'cancelada')
}
