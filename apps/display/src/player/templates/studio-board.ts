// ============================================================================
// Display Studio — plantillas de diseño (plan: apps/display/PLAN-STUDIO.md §6/§9)
// ============================================================================
// Ocho plantillas con un renderer cada una sobre una base común:
//   · golden-bites        (Free)    título enorme, producto sobre un arco de
//                                   color, banda inferior descuento/horario/QR
//   · cheese-burger       (Premium) fondo plano, palabra gigante en marquesina
//                                   saliendo de los bordes, producto encima
//   · chocolate-croissant (Premium) serif + manuscrita, trazos que se dibujan,
//                                   sello circular, lema con ornamento
//   · sandwich-board      (Free)    menú diagonal con precios en estrella
//   · block-menu          (Free)    bloques crema sobre fondo de color + bebidas
//   · carta-lista         (Premium) lista por categoría desde la carta + fotos
//   · menu-ejecutivo      (Premium) cuadrícula 2×2 con tarjeta central
//   · eco-palabra         (Premium) palabra repetida + foto flotante en eco
// Lienzo real DW×DH escalado sin deformar (u = 1 % del lado corto; ×1,18 si
// se lee de lejos). Cada plantilla tiene su diseño vertical y horizontal.
// Foto recortada (PNG con transparencia) → el producto «flota» y se superpone;
// foto con fondo → variante enmarcada (círculo/tarjeta), nunca un rectángulo
// encima del título. Todo lo que falta se oculta y el resto se acomoda.
// Sin red: fotos, logo y fuentes salen de la caché del equipo (objectUrl).
// Decorados (arco, trazos, ornamento, sello) son SVG/CSS propios.
// ============================================================================

import { gsap } from 'gsap'
import QRCode from 'qrcode'
import { CARTA_ROWS, fitCanvas, formatPrice, readableOn, type Freshness, type StudioBoard } from '../board'
import { applyMotion } from './motion'

export interface PlayStudioOptions {
  host: HTMLElement
  board: StudioBoard
  nowMs: () => number
  timeZone?: string | null
  freshness: Freshness
  objectUrl: (url: string) => Promise<string | null>
  orderUrl?: string | null
  onShown: () => void
  onDone: (ok: boolean, reason?: string) => void
  /** Dentro de una secuencia: sin fundido de salida (la transición la hace la secuencia). */
  inSequence?: boolean
}

type El = HTMLElement
function h<K extends keyof HTMLElementTagNameMap>(tag: K, css: string, children: Array<Node | string | null | false | undefined> = []): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  el.style.cssText = css
  for (const c of children) if (c) el.append(typeof c === 'string' ? document.createTextNode(c) : c)
  return el
}
const SVGNS = 'http://www.w3.org/2000/svg'
function svg(w: number, hgt: number, css: string, inner: string): SVGSVGElement {
  const s = document.createElementNS(SVGNS, 'svg')
  s.setAttribute('viewBox', `0 0 ${w} ${hgt}`)
  s.setAttribute('style', css)
  s.innerHTML = inner
  return s
}
const SYSTEM = 'system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif'
const fam = (f: string | null | undefined, fallback = SYSTEM) => (f ? `"${f.replace(/"/g, '')}",${fallback}` : fallback)
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const hex = (v: unknown, def: string) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : def)

const loadedFonts = new Set<string>()
async function injectFonts(files: Array<{ family: string; url: string }>, objectUrl: (u: string) => Promise<string | null>): Promise<void> {
  if (typeof FontFace === 'undefined' || !document.fonts) return
  for (const f of files) {
    const key = `${f.family}|${f.url}`
    if (loadedFonts.has(key)) continue
    const blob = await objectUrl(f.url).catch(() => null)
    if (!blob) continue
    try {
      document.fonts.add(await new FontFace(f.family, `url(${blob})`).load())
      loadedFonts.add(key)
    } catch { /* archivo ilegible: queda la del sistema */ }
    if (blob.startsWith('blob:')) URL.revokeObjectURL(blob)
  }
}

/** Achica el texto hasta que entre a lo ancho (y a lo alto, si se pide) de su caja. */
function fitText(el: El, minPx: number, opts: { height?: boolean } = {}) {
  let size = parseFloat(el.style.fontSize)
  for (let i = 0; i < 24 && size > minPx; i++) {
    const over = el.scrollWidth > el.clientWidth + 1 || (opts.height && el.scrollHeight > el.clientHeight + 1)
    if (!over) break
    size *= 0.93
    el.style.fontSize = `${size}px`
  }
}

export function playStudioBoard(o: PlayStudioOptions): () => void {
  const b = o.board
  const v = b.values
  const portrait = b.orientation === 'portrait'
  const DW = b.designWidth || (portrait ? 1080 : 1920)
  const DH = b.designHeight || (portrait ? 1920 : 1080)
  const U = (Math.min(DW, DH) / 100) * (b.viewing === 'far' ? 1.18 : 1)
  const u = (n: number) => `${Math.round(n * U * 10) / 10}px`
  const urls: string[] = []
  const loops: gsap.core.Animation[] = []
  let tl: gsap.core.Timeline | null = null
  let cancelled = false
  let timer: ReturnType<typeof setTimeout> | null = null
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

  const brandFont = b.brand.fontHeading ?? b.brand.fontBody
  const fontOf = (key: string, fallback: string, generic = SYSTEM) => {
    const f = str(v[key])
    if (!f || f === 'brand') return fam(brandFont ?? fallback, generic)
    return fam(f, fam(fallback, generic))
  }
  const bodyFont = fam(b.brand.fontBody ?? b.brand.fontHeading)

  o.host.style.cssText = 'position:absolute;inset:0;overflow:hidden;opacity:0'
  const canvas = h('div', `position:absolute;left:0;top:0;width:${DW}px;height:${DH}px;transform-origin:0 0;overflow:hidden;font-family:${bodyFont}`)
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
    tl?.kill()
    for (const l of loops) l.kill()
    gsap.killTweensOf(canvas.querySelectorAll('*'))
    setTimeout(() => { for (const x of urls) if (x.startsWith('blob:')) URL.revokeObjectURL(x) }, o.inSequence ? 10_000 : 1500)
    o.onDone(ok, reason)
  }

  const photo = async (src: unknown): Promise<string | null> => {
    if (typeof src !== 'string' || !src) return null
    const x = await o.objectUrl(src).catch(() => null)
    if (x) urls.push(x)
    return x
  }
  const qr = async (size: number): Promise<El | null> => {
    if (!b.showQr || !o.orderUrl) return null
    const code = await QRCode.toString(o.orderUrl, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }).catch(() => null)
    if (!code) return null
    const box = h('div', `flex:none;width:${u(size)};height:${u(size)};background:#fff;border-radius:${u(1.2)};padding:${u(0.8)};box-sizing:border-box`)
    box.innerHTML = code
    const s = box.querySelector('svg')
    if (s) { s.setAttribute('width', '100%'); s.setAttribute('height', '100%') }
    return box
  }
  const logo = async (heightU: number, light = false): Promise<El | null> => {
    if (v.showLogo === false || !b.brand.logo) return null
    const src = await photo(b.brand.logo)
    if (!src) return null
    const img = h('img', `height:${u(heightU)};width:auto;max-width:${u(heightU * 3.2)};object-fit:contain;display:block;${light ? 'filter:drop-shadow(0 0 1px rgba(0,0,0,.25))' : ''}`)
    img.src = src
    img.alt = ''
    return img
  }
  const brandName = () => str(v.brandName) || b.brand.name || ''
  type Badge = 'top' | 'featured' | 'new'
  const BADGE_TEXT: Record<Badge, string> = { top: 'Más vendido', featured: 'Destacado', new: 'Nuevo' }
  /** Badges dinámicos de la carta (más vendido, destacado, nuevo). */
  const badgePills = (badges: Badge[] | undefined, bg: string, sizeU = 1.7): El | null => {
    if (!badges?.length) return null
    return h('div', `display:flex;flex-wrap:wrap;gap:${u(0.6)}`, badges.slice(0, 2).map((k) => h('span', `display:inline-flex;background:${bg};color:${readableOn(bg)};border-radius:999px;padding:${u(0.3)} ${u(1.1)};font-weight:900;font-size:${u(sizeU)};text-transform:uppercase;letter-spacing:.05em;white-space:nowrap`, [BADGE_TEXT[k]])))
  }
  /** Cartel «Agotado» sobre un plato pausado (si la pieza elige mostrarlos). */
  const soldOutStamp = (sizeU = 2.2): El => h('div', `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-8deg);background:#111;color:#fff;border-radius:${u(0.8)};padding:${u(0.5)} ${u(1.6)};font-weight:900;font-size:${u(sizeU)};letter-spacing:.12em;text-transform:uppercase;white-space:nowrap;z-index:3`, ['Agotado'])
  type SlotMeta = { badges?: Badge[]; originalPrice?: number | null; soldOut?: boolean }
  const slotMeta = (slot: string): SlotMeta => ((v.__slots as Record<string, SlotMeta> | undefined)?.[slot] ?? {})
  /** Producto: recortado → flota con sombra; con fondo → enmarcado en círculo. */
  const product = (src: string | null, cutout: boolean, sizeU: number, ring: string, fill = false, fallbackLabel?: string): El | null => {
    if (!src) {
      // Plato sin foto (Proximo_Nivel §2.3): respaldo tipográfico elegante con el nombre, del color de la marca.
      if (!fallbackLabel) return null
      const side = u(sizeU * 0.86)
      const list = fallbackLabel.trim().split(/\s+/).slice(0, 3)
      const longest = Math.max(4, ...list.map((w) => w.length))
      // Que la palabra más larga entre a lo ancho del círculo (≈ 0,62 em por letra en negrita).
      const size = Math.min(sizeU * 0.12, (sizeU * 0.86 * 0.62) / (longest * 0.62))
      const t = h('div', `width:66%;margin-top:${u(sizeU * 0.2)};text-align:center;font-weight:900;text-transform:uppercase;line-height:1;white-space:normal;overflow-wrap:anywhere;font-size:${u(size)};color:${readableOn(ring)};letter-spacing:-.01em`, [list.join(' ')])
      return h('div', fill ? `width:80%;aspect-ratio:1;border-radius:50%;background:${ring};display:flex;align-items:center;justify-content:center;box-shadow:0 ${u(2)} ${u(4)} rgba(0,0,0,.2)` : `width:${side};height:${side};border-radius:50%;background:${ring};display:flex;align-items:center;justify-content:center;box-shadow:0 ${u(2)} ${u(4)} rgba(0,0,0,.2)`, [t])
    }
    if (cutout) {
      const img = h('img', `width:100%;height:100%;object-fit:contain;display:block;filter:drop-shadow(0 ${u(2)} ${u(2.4)} rgba(0,0,0,.28))`)
      img.src = src; img.alt = ''
      return h('div', fill ? `width:94%;height:94%` : `width:${u(sizeU)};height:${u(sizeU)}`, [img])
    }
    const img = h('img', `width:100%;height:100%;object-fit:cover;display:block`)
    img.src = src; img.alt = ''
    return h('div', `width:${u(sizeU * 0.86)};height:${u(sizeU * 0.86)};border-radius:50%;overflow:hidden;border:${u(1.4)} solid ${ring};box-shadow:0 ${u(2)} ${u(4)} rgba(0,0,0,.25)`, [img])
  }

  const start = async () => {
    await injectFonts([...b.brand.fontFiles, ...b.fontFiles], o.objectUrl)
    if (cancelled) return
    tl = gsap.timeline({ paused: true })
    switch (b.templateId) {
      case 'golden-bites': await goldenBites(); break
      case 'cheese-burger': await cheeseBurger(); break
      case 'chocolate-croissant': await chocolateCroissant(); break
      case 'sandwich-board': await sandwichBoard(); break
      case 'block-menu': await blockMenu(); break
      case 'carta-lista': await cartaLista(); break
      case 'menu-ejecutivo': await menuEjecutivo(); break
      case 'eco-palabra': await ecoPalabra(); break
      default: finish(false, 'plantilla desconocida'); return
    }
    if (cancelled) return
    await Promise.all([...canvas.querySelectorAll('img')].map((img) => (img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r }))))
    if (cancelled) return
    canvas.querySelectorAll<El>('[data-fit]').forEach((el) => fitText(el, U * 1.4, { height: el.dataset.fit === 'h' }))
    gsap.to(o.host, { opacity: 1, duration: 0.45 })
    o.onShown()
    loops.push(...applyMotion(b.motion, tl, loops, canvas, reduced))
    if (reduced) tl.progress(1); else tl.play()
    timer = setTimeout(() => {
      if (o.inSequence) finish(true)
      else gsap.to(canvas, { opacity: 0, duration: 0.5, onComplete: () => finish(true) })
    }, Math.max(4000, b.pageMs) * Math.max(1, b.pages ?? 1))
  }

  // ── 1. Golden Bites (Free) ──────────────────────────────────────────────
  async function goldenBites() {
    const accent = hex(v.accent, b.brand.primary || '#e3342f')
    const onAccent = readableOn(accent)
    const bg = hex(v.background, '#f7efe4')
    const text = hex(v.textColor, readableOn(bg) === '#000' ? '#1d1d1b' : '#ffffff')
    const titleFont = fontOf('font', 'Archivo Black')
    canvas.style.background = bg
    canvas.style.color = text
    o.host.style.background = bg
    // Textura de papel muy sutil (SVG chico repetido; sin degradés).
    canvas.append(h('div', `position:absolute;inset:0;opacity:.07;pointer-events:none;background-image:url("data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/></filter><rect width="160" height="160" filter="url(#n)"/></svg>')}")`))

    const [mainSrc, backSrc, lg, code] = await Promise.all([photo(v.image), photo(v.image2), logo(6), qr(portrait ? 17 : 15)])
    const cut = v.imageCutout === true
    const title = h('div', `font-family:${titleFont};font-weight:900;color:${accent};text-transform:uppercase;line-height:.9;letter-spacing:-.01em;font-size:${u(portrait ? 21 : 17)};white-space:nowrap;overflow:hidden`, [str(v.title1)])
    title.dataset.fit = '1'
    const title2 = str(v.title2) ? h('div', title.style.cssText, [str(v.title2)]) : null
    if (title2) title2.dataset.fit = '1'
    const subtitle = str(v.subtitle) ? h('div', `font-size:${u(portrait ? 3.3 : 2.6)};line-height:1.35;max-width:${portrait ? '62%' : '92%'};opacity:.85`, [str(v.subtitle)]) : null
    const head = h('div', `display:flex;align-items:center;justify-content:space-between;gap:${u(2)}`, [
      h('div', `display:flex;align-items:center;gap:${u(1.4)}`, [lg, brandName() ? h('div', `font-weight:900;font-size:${u(2.6)};line-height:1;text-transform:uppercase;letter-spacing:.04em;max-width:${u(28)}`, [brandName()]) : null]),
      str(v.website) ? h('div', `font-size:${u(2.2)};opacity:.75`, [str(v.website)]) : null,
    ])

    // Producto sobre el arco de acento.
    const stage = h('div', `position:relative;flex:1;min-height:0`)
    const arc = h('div', `position:absolute;left:${portrait ? '-30%' : '-10%'};right:${portrait ? '-30%' : '-25%'};bottom:${portrait ? '-58%' : '-70%'};height:${portrait ? '115%' : '135%'};border-radius:50%;background:${accent}`)
    stage.append(arc)
    const mainSize = portrait ? 62 : 56
    if (backSrc) {
      const back = product(backSrc, v.image2Cutout === true, mainSize * 0.72, bg)!
      back.style.cssText += `;position:absolute;right:${portrait ? '4%' : '6%'};top:${portrait ? '0' : '6%'}`
      stage.append(back)
    }
    const main = product(mainSrc, cut, mainSize, bg)
    if (main) {
      main.style.cssText += `;position:absolute;left:${backSrc ? (portrait ? '2%' : '4%') : '50%'};bottom:${portrait ? '2%' : '4%'};${backSrc ? '' : 'transform:translateX(-50%)'}`
      stage.append(main)
    }

    // Banda inferior: descuento · horario · QR.
    const cellLabel = (s: string) => h('div', `font-weight:800;font-size:${u(1.9)};text-transform:uppercase;letter-spacing:.06em;opacity:.95`, [s])
    const deal = str(v.dealValue) ? h('div', `display:flex;flex-direction:column;gap:${u(0.4)}`, [
      str(v.dealLabel) ? cellLabel(str(v.dealLabel)) : null,
      h('div', `font-family:${titleFont};font-weight:900;font-size:${u(portrait ? 11 : 9)};line-height:.95`, [str(v.dealValue)]),
    ]) : null
    const hours = str(v.hours) ? h('div', `display:flex;flex-direction:column;gap:${u(0.5)}`, [
      str(v.hoursTitle) ? h('div', `font-size:${u(2.1)};opacity:.9`, [str(v.hoursTitle)]) : null,
      h('div', `font-family:${titleFont};font-weight:900;font-size:${u(portrait ? 5.6 : 4.6)};line-height:1`, [str(v.hours)]),
      str(v.hoursText) ? h('div', `font-size:${u(1.9)};opacity:.9;max-width:${u(30)};line-height:1.3`, [str(v.hoursText)]) : null,
    ]) : null
    const cta = code || str(v.ctaTitle) ? h('div', `display:flex;align-items:center;gap:${u(1.6)};background:${bg};color:${text};border-radius:${u(2)};padding:${u(1.2)} ${u(1.2)} ${u(1.2)} ${u(2)}`, [
      str(v.ctaTitle) ? h('div', `font-weight:900;font-size:${u(2.6)};line-height:1.15;max-width:${u(18)}`, [str(v.ctaTitle)]) : null,
      code,
    ]) : null
    const band = h('div', `flex:none;background:${accent};color:${onAccent};padding:${u(3)} ${u(5)};display:${portrait ? 'grid' : 'flex'};${portrait ? `grid-template-columns:1fr 1fr;row-gap:${u(2.4)};column-gap:${u(3)}` : `gap:${u(5)};justify-content:space-between`};align-items:center`, [deal, hours, cta])
    if (portrait && cta) cta.style.gridColumn = '1 / -1'
    if (portrait && cta) cta.style.justifySelf = 'end'

    if (portrait) {
      canvas.append(h('div', `position:absolute;inset:0;display:flex;flex-direction:column`, [
        h('div', `flex:none;padding:${u(5)} ${u(5)} 0;display:flex;flex-direction:column;gap:${u(2.4)}`, [head, h('div', `display:flex;flex-direction:column;margin-top:${u(2)}`, [title, title2]), subtitle]),
        stage, band,
      ]))
    } else {
      canvas.append(h('div', `position:absolute;inset:0;display:flex;flex-direction:column`, [
        h('div', `flex:1;min-height:0;display:flex`, [
          h('div', `flex:0 0 44%;padding:${u(5)} 0 ${u(3)} ${u(5)};display:flex;flex-direction:column;gap:${u(2.4)};justify-content:center;box-sizing:border-box`, [head, h('div', `display:flex;flex-direction:column;margin-top:${u(2)}`, [title, title2]), subtitle]),
          stage,
        ]),
        band,
      ]))
    }

    // Animación: arco sube, producto con rebote, título por líneas, banda, % count-up, QR pop, producto flota.
    tl!.from(arc, { yPercent: 40, duration: 0.7, ease: 'power3.out' }, 0)
      .from(title, { y: U * 6, opacity: 0, duration: 0.6, ease: 'power3.out' }, 0.15)
    if (title2) tl!.from(title2, { y: U * 6, opacity: 0, duration: 0.6, ease: 'power3.out' }, 0.28)
    if (subtitle) tl!.from(subtitle, { opacity: 0, y: U * 2, duration: 0.5 }, 0.45)
    if (main) tl!.from(main, { scale: 0.6, opacity: 0, duration: 0.9, ease: 'back.out(1.6)' }, 0.35)
    const back = stage.children.length > 2 ? stage.children[1] as El : null
    if (back) tl!.from(back, { x: U * 8, opacity: 0, duration: 0.8, ease: 'power3.out' }, 0.5)
    tl!.from(band, { yPercent: 100, duration: 0.6, ease: 'power3.out' }, 0.7)
    const pct = /^(\d{1,3})\s*%$/.exec(str(v.dealValue))
    const dealNum = deal?.lastElementChild as El | undefined
    if (pct && dealNum) {
      const n = { x: 0 }
      tl!.to(n, { x: Number(pct[1]), duration: 0.9, ease: 'power2.out', onUpdate: () => { dealNum.textContent = `${Math.round(n.x)}%` } }, 0.9)
    }
    if (code) tl!.from(code, { scale: 0, duration: 0.5, ease: 'back.out(2)' }, 1.1)
    if (main && !reduced) loops.push(gsap.to(main, { y: -U * 0.8, duration: 2.2, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 1.4 }))
  }

  // ── 2. Cheese Burger (Premium) ──────────────────────────────────────────
  async function cheeseBurger() {
    const bg = hex(v.background, b.brand.primary || '#ff7a00')
    const ink = hex(v.textColor, readableOn(bg) === '#000' ? '#111111' : '#ffffff')
    const font = fontOf('font', 'Anton')
    canvas.style.background = bg
    canvas.style.color = ink
    o.host.style.background = bg
    const [src, code] = await Promise.all([photo(v.image), qr(portrait ? 15 : 13)])
    const cut = v.imageCutout === true
    const w1 = str(v.word1).toUpperCase()
    const w2 = (str(v.word2) || str(v.word1)).toUpperCase()
    const rows = portrait ? [w1, w2, w1, w2] : [w1, w2]
    const rowH = (portrait ? DH * 0.66 : DH * 0.7) / rows.length
    const big = rowH * 1.08
    const rowsBox = h('div', `position:absolute;left:0;right:0;top:${portrait ? '13%' : '10%'};display:flex;flex-direction:column;align-items:center`)
    const marquees: El[] = []
    rows.forEach((w, i) => {
      const moving = portrait ? i === 1 || i === 2 : i === 1
      const line = h('div', `height:${rowH}px;line-height:${rowH}px;font-family:${font};font-weight:900;font-size:${big}px;white-space:nowrap;letter-spacing:-.01em;text-transform:uppercase`)
      if (moving) {
        const track = h('div', `display:inline-flex;gap:${big * 0.25}px;will-change:transform`)
        for (let k = 0; k < 6; k++) track.append(h('span', '', [w]))
        line.append(track)
        line.dataset.dir = (i % 2 ? '-1' : '1')
        marquees.push(track)
      } else line.append(w)
      rowsBox.append(line)
    })
    canvas.append(rowsBox)

    const pill = brandName() ? h('div', `position:absolute;left:50%;top:${u(4)};transform:translateX(-50%);border:${u(0.35)} solid ${ink};border-radius:999px;padding:${u(0.8)} ${u(3)};font-weight:900;font-size:${u(2.4)};letter-spacing:.06em;text-transform:uppercase;white-space:nowrap`, [brandName()]) : null
    if (pill) canvas.append(pill)

    const mainSize = portrait ? 78 : 62
    const main = product(src, cut, mainSize, ink)
    if (main) {
      main.style.cssText += `;position:absolute;left:50%;top:${portrait ? '47%' : '46%'};transform:translate(-50%,-50%)`
      canvas.append(main)
    }
    const minis: El[] = []
    if (src && v.showMini !== false) {
      for (const [x, y, s, r] of (portrait ? [[4, 9, 15, -12], [79, 63, 17, 10]] : [[3, 8, 14, -12], [86, 60, 15, 10]]) as Array<[number, number, number, number]>) {
        const m = product(src, cut, s, ink)!
        m.style.cssText += `;position:absolute;left:${x}%;top:${y}%;transform:rotate(${r}deg)`
        canvas.append(m)
        minis.push(m)
      }
    }
    const price = typeof v.price === 'number' && v.price > 0
      ? h('div', `position:absolute;${portrait ? 'right:7%;top:30%' : 'right:22%;top:20%'};width:${u(19)};height:${u(19)};border-radius:50%;background:${ink};color:${bg};display:flex;align-items:center;justify-content:center;font-family:${font};font-weight:900;font-size:${u(formatPrice(v.price).length > 8 ? 3.6 : 4.4)};white-space:nowrap;transform:rotate(-10deg);box-shadow:0 ${u(1)} ${u(2.4)} rgba(0,0,0,.25)`, [formatPrice(v.price)])
      : null
    if (price) canvas.append(price)

    const col = (a: string, b2?: string) => (a || b2 ? h('div', `flex:1 1 0;min-width:0;display:flex;flex-direction:column;gap:${u(0.4)};font-weight:900;text-transform:uppercase;font-size:${u(portrait ? 2.6 : 2.2)};line-height:1.1;letter-spacing:.02em`, [a ? h('div', '', [a]) : null, b2 ? h('div', '', [b2]) : null]) : null)
    const c1 = col(str(v.text1), str(v.text1b))
    const c2 = col(str(v.text2))
    const c3 = col(str(v.text3), str(v.text3b))
    if (c3) c3.style.textAlign = 'right'
    const foot = h('div', `position:absolute;left:${u(5)};right:${u(5)};bottom:${u(4)};display:flex;align-items:flex-end;justify-content:space-between;gap:${u(3)}`, [c1, c2, c3, code])
    canvas.append(foot)

    // Animación: renglones entran de lados opuestos, marquesina infinita, producto con rebote fuerte y respiración.
    rowsBox.querySelectorAll<El>(':scope > div').forEach((line, i) => tl!.from(line, { xPercent: i % 2 ? 60 : -60, opacity: 0, duration: 0.8, ease: 'power4.out' }, i * 0.08))
    if (pill) tl!.from(pill, { y: -U * 4, opacity: 0, duration: 0.5 }, 0.1)
    if (main) tl!.from(main, { scale: 0.3, opacity: 0, duration: 1, ease: 'back.out(2.2)' }, 0.45)
    minis.forEach((m, i) => tl!.from(m, { scale: 0, rotate: 0, duration: 0.6, ease: 'back.out(2)' }, 0.9 + i * 0.12))
    if (price) tl!.from(price, { scale: 1.6, opacity: 0, duration: 0.45, ease: 'power4.in' }, 1.25)
    tl!.from(foot.children, { y: U * 4, opacity: 0, stagger: 0.08, duration: 0.5 }, 1.1)
    if (!reduced) {
      for (const track of marquees) {
        const dir = Number(track.parentElement?.dataset.dir) || 1
        const half = () => track.scrollWidth / 2
        loops.push(gsap.fromTo(track, { x: dir > 0 ? 0 : -half() }, { x: dir > 0 ? -half() : 0, duration: 14, ease: 'none', repeat: -1 }))
      }
      if (main) loops.push(gsap.to(main, { scale: 1.03, duration: 1.8, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 1.5 }))
      minis.forEach((m, i) => loops.push(gsap.to(m, { rotate: `+=${i ? -6 : 6}`, duration: 2.6, ease: 'sine.inOut', yoyo: true, repeat: -1 })))
    }
  }

  // ── 3. Chocolate Croissant (Premium) ────────────────────────────────────
  async function chocolateCroissant() {
    const accent = hex(v.accent, b.brand.primary || '#c06a3a')
    const ink = hex(v.textColor, '#5b2a12')
    const bg = hex(v.background, '#f8ecdf')
    const serif = fontOf('font', 'Playfair Display', 'Georgia,"Times New Roman",serif')
    const script = fontOf('scriptFont', 'Pacifico', '"Brush Script MT","Segoe Script",cursive')
    canvas.style.background = bg
    canvas.style.color = ink
    o.host.style.background = bg
    const [src, code, lg] = await Promise.all([photo(v.image), qr(portrait ? 12 : 11), logo(5)])
    const cut = v.imageCutout === true

    const name = brandName() ? h('div', `font-family:${serif};font-size:${u(2.4)};letter-spacing:.35em;text-transform:uppercase;font-weight:700;text-align:center`, [brandName()]) : null
    const t1 = h('div', `font-family:${serif};font-weight:900;font-size:${u(portrait ? 15 : 12)};line-height:1;white-space:nowrap;overflow:hidden;text-align:center;width:100%`, [str(v.word1)])
    t1.dataset.fit = '1'
    const t2 = str(v.word2) ? h('div', `font-family:${script};color:${accent};font-size:${u(portrait ? 11 : 9)};line-height:1.05;white-space:nowrap;overflow:hidden;text-align:center;width:100%;margin-top:-${u(1.4)};clip-path:inset(0 0 0 0)`, [str(v.word2)]) : null
    if (t2) t2.dataset.fit = '1'
    // Trazos tipo «brillo» a los costados del título.
    const rays = (flip: boolean) => svg(60, 60, `width:${u(7)};height:${u(7)};flex:none;${flip ? 'transform:scaleX(-1)' : ''}`,
      `<g stroke="${accent}" stroke-width="4" stroke-linecap="round" fill="none"><path class="ray" d="M50 30 L30 30"/><path class="ray" d="M46 12 L32 22"/><path class="ray" d="M46 48 L32 38"/></g>`)
    const titleRow = h('div', `display:flex;align-items:center;justify-content:center;gap:${u(1.4)};width:100%`, [rays(true), h('div', `flex:1;min-width:0;display:flex;flex-direction:column;align-items:center`, [t1, t2]), rays(false)])
    const ornament = svg(300, 20, `width:${u(26)};height:${u(1.8)}`, `<g stroke="${ink}" stroke-width="1.5" fill="${ink}"><line class="orn" x1="0" y1="10" x2="130" y2="10"/><path d="M150 3 L157 10 L150 17 L143 10 Z"/><line class="orn" x1="170" y1="10" x2="300" y2="10"/></g>`)
    const tagline = str(v.tagline) ? h('div', `font-family:${serif};font-size:${u(2.4)};letter-spacing:.24em;text-transform:uppercase;font-weight:700;text-align:center;white-space:nowrap;overflow:hidden;max-width:100%`, [str(v.tagline)]) : null
    if (tagline) tagline.dataset.fit = '1'

    const plateSize = portrait ? 74 : 66
    const plate = product(src, cut, plateSize, '#ffffff', true)
    const showStamp = v.showStamp !== false && (str(v.stampText) || (typeof v.price === 'number' && v.price > 0))
    const stamp = showStamp ? h('div', `position:absolute;${portrait ? 'right:4%;top:6%' : 'right:2%;top:4%'};width:${u(19)};height:${u(19)};border-radius:50%;background:${accent};color:${readableOn(accent)};display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:${u(2)};box-sizing:border-box;transform:rotate(-12deg)`, [
      str(v.stampText) ? h('div', `font-family:${script};font-size:${u(3.2)};line-height:1.1`, [str(v.stampText)]) : null,
      typeof v.price === 'number' && v.price > 0 ? h('div', `font-family:${serif};font-weight:900;font-size:${u(3.6)};margin-top:${u(0.6)}`, [formatPrice(v.price)]) : null,
    ]) : null
    const sideRays = (left: boolean) => svg(80, 80, `position:absolute;${left ? 'left:2%' : 'right:2%'};bottom:18%;width:${u(9)};height:${u(9)};${left ? '' : 'transform:scaleX(-1)'}`,
      `<g stroke="${accent}" stroke-width="4" stroke-linecap="round" fill="none"><path class="ray" d="M10 40 L34 40"/><path class="ray" d="M14 18 L32 30"/><path class="ray" d="M14 62 L32 50"/></g>`)
    const plateBox = h('div', `position:relative;display:flex;align-items:center;justify-content:center;width:100%;${portrait ? `flex:none;height:${Math.round(DW * 0.92)}px` : 'flex:1;min-height:0'}`, [plate, stamp, sideRays(true), sideRays(false)])
    const qrBox = code && !portrait ? h('div', `position:absolute;right:${u(4)};bottom:${u(4)};opacity:.95`, [code]) : null

    if (portrait) {
      const qrW = code ? code.style.width : '0px'
      const foot = h('div', `flex:none;width:100%;display:flex;align-items:flex-end;justify-content:space-between;gap:${u(2)}`, [
        h('div', `flex:none;width:${qrW}`), h('div', `flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:${u(1.6)}`, [tagline, ornament]), code,
      ])
      if (tagline) tagline.style.letterSpacing = '.2em'
      canvas.append(h('div', `position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:${u(6)} ${u(5)} ${u(5)};box-sizing:border-box;gap:${u(2.4)}`, [
        h('div', `display:flex;flex-direction:column;align-items:center;gap:${u(2.4)};width:100%`, [lg, name, titleRow]), plateBox, foot,
      ]))
    } else {
      canvas.append(h('div', `position:absolute;inset:0;display:flex;align-items:stretch;padding:${u(4)};box-sizing:border-box;gap:${u(3)}`, [
        h('div', `flex:0 0 55%;display:flex`, [plateBox]),
        h('div', `flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${u(2.4)}`, [lg, name, titleRow, tagline, ornament]),
      ]))
    }
    if (qrBox) canvas.append(qrBox)

    // Animación: trazos se dibujan, script con revelado, plato baja con sombra, sello gira y se asienta, Ken Burns.
    const strokes = canvas.querySelectorAll<SVGPathElement | SVGLineElement>('.ray, .orn')
    strokes.forEach((p) => { const len = 140; p.style.strokeDasharray = `${len}`; p.style.strokeDashoffset = `${len}` })
    if (name) tl!.from(name, { opacity: 0, y: -U * 2, duration: 0.5 }, 0)
    tl!.from(t1, { opacity: 0, y: U * 3, duration: 0.6, ease: 'power3.out' }, 0.1)
    if (t2) tl!.fromTo(t2, { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 1.1, ease: 'power2.inOut' }, 0.45)
    tl!.to(strokes, { strokeDashoffset: 0, duration: 0.6, stagger: 0.05, ease: 'power2.out' }, 0.6)
    if (plate) tl!.from(plate, { y: -U * 10, opacity: 0, duration: 0.9, ease: 'power3.out' }, 0.35)
    if (stamp) tl!.from(stamp, { scale: 0, rotate: -120, duration: 0.8, ease: 'back.out(1.8)' }, 1.1)
    const tail = [tagline, ornament, qrBox ?? (portrait ? code : null)].filter(Boolean) as Element[]
    if (tail.length) tl!.from(tail, { opacity: 0, y: U * 2, stagger: 0.1, duration: 0.5 }, 1.2)
    if (!reduced) {
      const img = plate?.querySelector('img')
      if (img) loops.push(gsap.to(img, { scale: cut ? 1.035 : 1.08, duration: Math.max(6, b.pageMs / 1000), ease: 'none', delay: 1.4 }))
      loops.push(gsap.to(canvas.querySelectorAll('.ray'), { opacity: 0.35, duration: 0.9, stagger: { each: 0.15, repeat: -1, yoyo: true }, delay: 2.4 }))
    }
  }

  type ResolvedItem = { name: string; description: string; price: number | null; image: string | null; cutout?: boolean; category: string; originalPrice?: number | null; badges?: Array<'top' | 'featured' | 'new'>; available?: boolean }
  const resolvedItems = (): ResolvedItem[] => {
    const raw = v.__items
    if (!Array.isArray(raw)) return []
    return raw.filter((x): x is ResolvedItem => !!x && typeof x === 'object' && typeof (x as ResolvedItem).name === 'string')
  }
  const starburst = (label: string, fill: string, ink: string, sizeU: number): El => {
    const s = svg(100, 100, `width:${u(sizeU)};height:${u(sizeU)};flex:none`,
      `<polygon points="50,4 61,28 88,22 74,44 96,58 70,64 72,92 50,76 28,92 30,64 4,58 26,44 12,22 39,28" fill="${fill}"/>`)
    const wrap = h('div', `position:relative;width:${u(sizeU)};height:${u(sizeU)};display:flex;align-items:center;justify-content:center`)
    wrap.append(s)
    const t = h('div', `position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:${u(sizeU * 0.22)};color:${ink};text-align:center;line-height:1;padding:${u(1)};box-sizing:border-box`)
    t.textContent = label
    t.dataset.fit = 'h'
    wrap.append(t)
    return wrap
  }
  const spark = (color: string, sizeU: number) => svg(24, 24, `width:${u(sizeU)};height:${u(sizeU)};flex:none`,
    `<path d="M12 2 L13.5 9.5 L21 12 L13.5 14.5 L12 22 L10.5 14.5 L3 12 L10.5 9.5 Z" fill="${color}"/>`)

  // ── 4. Sandwich Board (Free) ────────────────────────────────────────────
  async function sandwichBoard() {
    const accent = hex(v.accent, b.brand.primary || '#d62828')
    const accent2 = hex(v.accent2, '#f4c430')
    const bg = hex(v.background, '#faf6ef')
    const ink = hex(v.textColor, '#1a1a1a')
    const font = fontOf('font', 'Fredoka')
    canvas.style.background = bg
    canvas.style.color = ink
    o.host.style.background = bg
    const [i1, i2, i3, code, lg] = await Promise.all([photo(v.image1), photo(v.image2), photo(v.image3), qr(portrait ? 12 : 11), logo(5)])
    const slots = [
      { id: 'p1', name: str(v.item1Name), desc: str(v.item1Desc), price: typeof v.item1Price === 'number' ? v.item1Price : null, src: i1, cut: v.image1Cutout === true },
      { id: 'p2', name: str(v.item2Name), desc: str(v.item2Desc), price: typeof v.item2Price === 'number' ? v.item2Price : null, src: i2, cut: v.image2Cutout === true },
      { id: 'p3', name: str(v.item3Name), desc: str(v.item3Desc), price: typeof v.item3Price === 'number' ? v.item3Price : null, src: i3, cut: v.image3Cutout === true },
    ].filter((s) => s.name || s.src)

    const badge = str(v.badge) ? h('div', `display:inline-flex;align-items:center;justify-content:center;background:${accent2};color:${accent};border-radius:999px;padding:${u(1)} ${u(2.4)};font-family:${font};font-weight:900;font-size:${u(3.2)};text-transform:uppercase;letter-spacing:.04em`, [str(v.badge)]) : null
    const title = h('div', `font-family:${font};font-weight:900;font-size:${u(portrait ? 14 : 11)};color:${accent};text-transform:uppercase;line-height:.9;letter-spacing:-.02em;white-space:nowrap;overflow:hidden`, [str(v.title)])
    title.dataset.fit = '1'
    const head = h('div', `display:flex;align-items:center;justify-content:space-between;gap:${u(2)};flex-wrap:wrap`, [
      h('div', `display:flex;align-items:center;gap:${u(1.6)};min-width:0;flex:1`, [badge, title]),
      h('div', `display:flex;align-items:center;gap:${u(1.2)}`, [lg, brandName() ? h('div', `font-weight:800;font-size:${u(2.2)};text-transform:uppercase;letter-spacing:.06em;max-width:${u(30)};white-space:nowrap;overflow:hidden`, [brandName()]) : null]),
    ])

    const rows: El[] = []
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i]
      const flip = i % 2 === 1
      const meta = slotMeta(s.id)
      const pic = product(s.src, s.cut, portrait ? 28 : 24, accent, false, s.name)
      const priceTag = s.price && s.price > 0 && !meta.soldOut ? starburst(formatPrice(s.price), accent, accent2, portrait ? 14 : 12) : null
      const text = h('div', `flex:1;min-width:0;display:flex;flex-direction:column;gap:${u(0.8)};${flip ? 'text-align:right;align-items:flex-end' : ''}`, [
        badgePills(meta.badges, accent2),
        s.name ? h('div', `font-family:${font};font-weight:900;font-size:${u(portrait ? 4.2 : 3.6)};color:${accent};line-height:1.05;text-transform:uppercase`, [s.name]) : null,
        meta.originalPrice && !meta.soldOut ? h('div', `font-size:${u(2.2)};opacity:.6;text-decoration:line-through`, [`Antes ${formatPrice(meta.originalPrice)}`]) : null,
        s.desc ? h('div', `font-size:${u(2.2)};line-height:1.35;opacity:.8;max-width:${u(42)}`, [s.desc]) : null,
      ])
      const media = h('div', `position:relative;flex:none;display:flex;align-items:center`, [
        pic,
        priceTag ? (() => { priceTag.style.cssText += `;position:absolute;${flip ? 'left:-8%' : 'right:-8%'};top:-6%;transform:rotate(${flip ? 8 : -8}deg)`; return priceTag })() : null,
      ])
      if (meta.soldOut) media.append(soldOutStamp())
      const row = h('div', `display:flex;align-items:center;gap:${u(2.4)};${flip ? 'flex-direction:row-reverse' : ''};${meta.soldOut ? 'opacity:.55' : ''}`, [media, text, spark(accent, 3.2)])
      rows.push(row)
    }

    const foot = h('div', `display:flex;align-items:center;justify-content:space-between;gap:${u(2)}`, [
      str(v.footer) ? h('div', `font-size:${u(2)};color:${accent};font-weight:700;max-width:70%`, [str(v.footer)]) : h('div', ''),
      code,
    ])
    // Decorados SVG (contorno de sandwich, no asset de Canva).
    const deco = (flip: boolean) => svg(80, 50, `position:absolute;${flip ? 'left:3%;bottom:18%' : 'right:3%;top:16%'};width:${u(14)};height:${u(9)};opacity:.35;${flip ? 'transform:scaleX(-1)' : ''}`,
      `<g fill="none" stroke="${accent2}" stroke-width="3" stroke-linecap="round"><path d="M8 28 C20 8 60 8 72 28"/><path d="M12 32 H68"/><path d="M16 36 H64"/></g>`)

    canvas.append(deco(false), deco(true))
    canvas.append(h('div', `position:absolute;inset:0;display:flex;flex-direction:column;padding:${u(5)};box-sizing:border-box;gap:${u(portrait ? 3.2 : 2.4)}`, [
      head,
      h('div', `flex:1;min-height:0;display:flex;flex-direction:${portrait ? 'column' : 'row'};${portrait ? '' : 'flex-wrap:wrap;'};justify-content:center;gap:${u(portrait ? 4 : 3)}`, rows),
      foot,
    ]))
    if (!portrait && rows.length) rows.forEach((r) => { r.style.flex = '1 1 45%' })

    tl!.from(head, { y: -U * 4, opacity: 0, duration: 0.5 }, 0)
    rows.forEach((r, i) => tl!.from(r, { x: i % 2 ? U * 10 : -U * 10, opacity: 0, duration: 0.7, ease: 'power3.out' }, 0.15 + i * 0.12))
    tl!.from(foot, { y: U * 3, opacity: 0, duration: 0.45 }, 0.7)
    if (!reduced) rows.forEach((r, i) => {
      const p = r.querySelector('img')?.parentElement
      if (p) loops.push(gsap.to(p, { y: i % 2 ? 4 : -4, duration: 2.4, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 1 + i * 0.2 }))
    })
  }

  // ── 5. Block Menu (Free) ────────────────────────────────────────────────
  async function blockMenu() {
    const accent = hex(v.accent, b.brand.primary || '#8b1e1e')
    const panel = hex(v.panel, '#f3d9b8')
    const inkOnAccent = hex(v.textColor, panel)
    const inkOnPanel = readableOn(panel) === '#000' ? '#2a1510' : '#fff'
    const font = fontOf('font', 'Oswald')
    canvas.style.background = accent
    canvas.style.color = inkOnAccent
    o.host.style.background = accent
    const [a1, a2, d1, d2, d3, code, lg] = await Promise.all([
      photo(v.image1), photo(v.image2), photo(v.drink1Image), photo(v.drink2Image), photo(v.drink3Image), qr(portrait ? 11 : 10), logo(5, true),
    ])

    const title = h('div', `font-family:${font};font-weight:900;font-size:${u(portrait ? 12 : 9)};line-height:.9;text-transform:uppercase;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;max-width:${portrait ? '70%' : '55%'}`, [str(v.title)])
    title.dataset.fit = '1'
    const brandPill = h('div', `flex:none;background:${panel};color:${inkOnPanel};border-radius:${u(2)};padding:${u(1.6)} ${u(1.4)};display:flex;flex-direction:column;align-items:center;gap:${u(0.8)};min-width:${u(10)}`, [
      lg || h('div', `width:${u(6)};height:${u(6)};border-radius:50%;background:${accent}`),
      brandName() ? h('div', `writing-mode:vertical-rl;transform:rotate(180deg);font-weight:900;font-size:${u(2)};letter-spacing:.12em;text-transform:uppercase;max-height:${u(22)};overflow:hidden`, [brandName()]) : null,
    ])
    const head = h('div', `display:flex;align-items:flex-start;justify-content:space-between;gap:${u(2)}`, [title, brandPill])

    const featured = async (name: string, desc: string, price: unknown, src: string | null, cut: boolean, align: 'left' | 'right', meta: SlotMeta = {}) => {
      if (!name && !src) return null
      const pic = product(src, cut, portrait ? 26 : 22, inkOnPanel, false, name)
      const tag = typeof price === 'number' && price > 0 && !meta.soldOut
        ? h('div', `position:absolute;${align === 'left' ? 'left:2%' : 'right:2%'};top:4%;width:${u(11)};height:${u(11)};border-radius:50%;background:${accent};color:${inkOnAccent};display:flex;align-items:center;justify-content:center;font-family:${font};font-weight:900;font-size:${u(formatPrice(price).length > 8 ? 2 : 2.5)};white-space:nowrap;z-index:2`, [formatPrice(price)])
        : null
      const copy = h('div', `flex:1;min-width:0;display:flex;flex-direction:column;gap:${u(0.8)};padding:${u(2)};box-sizing:border-box`, [
        badgePills(meta.badges, accent),
        name ? h('div', `font-family:${font};font-weight:900;font-size:${u(portrait ? 4.4 : 3.6)};line-height:1;text-transform:uppercase;color:${inkOnPanel}`, [name]) : null,
        desc ? h('div', `font-size:${u(2)};line-height:1.35;opacity:.85;color:${inkOnPanel}`, [desc]) : null,
      ])
      const inner = h('div', `position:relative;display:flex;align-items:center;gap:${u(1.2)};${align === 'right' ? 'flex-direction:row-reverse' : ''}`, [h('div', `position:relative;flex:none`, [pic, tag, meta.soldOut ? soldOutStamp() : null]), copy])
      return h('div', `background:${panel};border-radius:${u(3)};padding:${u(1.6)};box-sizing:border-box;width:${portrait ? '92%' : '48%'};${align === 'right' ? 'align-self:flex-end' : 'align-self:flex-start'};${meta.soldOut ? 'opacity:.6' : ''}`, [inner])
    }
    const f1 = await featured(str(v.item1Name), str(v.item1Desc), v.item1Price, a1, v.image1Cutout === true, 'left', slotMeta('p1'))
    const f2 = await featured(str(v.item2Name), str(v.item2Desc), v.item2Price, a2, v.image2Cutout === true, 'right', slotMeta('p2'))
    const diag = h('div', `position:absolute;left:18%;right:18%;top:42%;height:${u(1.6)};background:${accent};transform:rotate(-18deg);opacity:.9;pointer-events:none`)

    const drinks = [
      { name: str(v.drink1Name), price: v.drink1Price, src: d1, cut: v.drink1ImageCutout === true, meta: slotMeta('d1') },
      { name: str(v.drink2Name), price: v.drink2Price, src: d2, cut: v.drink2ImageCutout === true, meta: slotMeta('d2') },
      { name: str(v.drink3Name), price: v.drink3Price, src: d3, cut: v.drink3ImageCutout === true, meta: slotMeta('d3') },
    ].filter((d) => d.name || d.src)
    const drinkRow = drinks.length ? h('div', `background:${panel};border-radius:${u(3)};padding:${u(2)} ${u(2.4)};display:flex;align-items:center;justify-content:space-around;gap:${u(2)};color:${inkOnPanel}`,
      drinks.map((d) => h('div', `position:relative;display:flex;flex-direction:column;align-items:center;gap:${u(0.6)};min-width:0;flex:1;${d.meta.soldOut ? 'opacity:.55' : ''}`, [
        product(d.src, d.cut, portrait ? 12 : 10, accent, false, d.name),
        d.meta.soldOut ? soldOutStamp(1.6) : null,
        typeof d.price === 'number' && d.price > 0 && !d.meta.soldOut ? h('div', `font-weight:900;font-size:${u(2.2)};color:${accent}`, [formatPrice(d.price)]) : null,
        d.name ? h('div', `font-family:${font};font-weight:900;font-size:${u(2.2)};text-transform:uppercase;text-align:center;line-height:1.1`, [d.name]) : null,
      ]))) : null

    const foot = h('div', `background:${panel};color:${inkOnPanel};border-radius:999px;padding:${u(1.4)} ${u(3)};display:flex;align-items:center;justify-content:space-between;gap:${u(2)};font-weight:800;font-size:${u(2)}`, [
      str(v.website) ? h('div', '', [str(v.website)]) : null,
      str(v.phone) ? h('div', '', [str(v.phone)]) : null,
      code,
    ])

    const stage = h('div', `position:relative;flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:${u(2.4)}`, [diag, f1, f2])
    canvas.append(h('div', `position:absolute;inset:0;display:flex;flex-direction:column;padding:${u(4.5)};box-sizing:border-box;gap:${u(2.4)}`, [head, stage, drinkRow, foot]))

    tl!.from(title, { x: -U * 8, opacity: 0, duration: 0.6, ease: 'power3.out' }, 0)
    tl!.from(brandPill, { x: U * 6, opacity: 0, duration: 0.55 }, 0.1)
    if (f1) tl!.from(f1, { x: -U * 12, opacity: 0, duration: 0.7, ease: 'power3.out' }, 0.25)
    if (f2) tl!.from(f2, { x: U * 12, opacity: 0, duration: 0.7, ease: 'power3.out' }, 0.4)
    tl!.from(diag, { scaleX: 0, duration: 0.5 }, 0.45)
    if (drinkRow) tl!.from(drinkRow, { y: U * 6, opacity: 0, duration: 0.55 }, 0.7)
    tl!.from(foot, { y: U * 4, opacity: 0, duration: 0.45 }, 0.85)
    if (!reduced && f1) {
      const img = f1.querySelector('img')
      if (img) loops.push(gsap.to(img, { y: -3, duration: 2.2, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 1.2 }))
    }
  }

  // ── 6. Carta Lista (Premium) ────────────────────────────────────────────
  async function cartaLista() {
    const accent = hex(v.accent, b.brand.primary || '#c45c26')
    const bg = hex(v.background, '#f8ead9')
    const ink = hex(v.textColor, '#3b2416')
    const font = fontOf('font', 'Montserrat')
    canvas.style.background = bg
    canvas.style.color = ink
    o.host.style.background = bg
    // Marca de agua vegetal (SVG propio).
    canvas.append(svg(200, 200, `position:absolute;right:-4%;top:8%;width:${u(48)};height:${u(48)};opacity:.08;pointer-events:none`,
      `<g fill="none" stroke="${ink}" stroke-width="6"><path d="M100 180 C60 120 50 60 100 20 C150 60 140 120 100 180"/><path d="M100 180 C80 130 90 70 100 40"/><path d="M40 90 C70 80 90 100 100 120"/><path d="M160 90 C130 80 110 100 100 120"/></g>`))
    const [p1, p2, code, lg] = await Promise.all([photo(v.image1), photo(v.image2), qr(portrait ? 11 : 10), logo(5)])
    const items = resolvedItems()
    // Lista larga («Toda la carta»): páginas de N filas, cada una pageMs.
    const perPage = CARTA_ROWS[portrait ? 'portrait' : 'landscape']
    const chunks: ResolvedItem[][] = []
    for (let i = 0; i < items.length; i += perPage) chunks.push(items.slice(i, i + perPage))
    if (!chunks.length) chunks.push([])

    const title = h('div', `font-family:${font};font-weight:900;font-size:${u(portrait ? 10 : 8)};text-transform:uppercase;letter-spacing:-.02em;line-height:.95;white-space:nowrap;overflow:hidden`, [str(v.title)])
    title.dataset.fit = '1'
    const head = h('div', `display:flex;align-items:center;justify-content:space-between;gap:${u(2)}`, [
      h('div', `display:flex;align-items:center;gap:${u(1.4)}`, [lg, brandName() ? h('div', `font-weight:800;font-size:${u(2.2)};letter-spacing:.08em;text-transform:uppercase`, [brandName()]) : null]),
      title,
    ])

    const pageSections = chunks.map((chunk) => {
      const byCat = new Map<string, ResolvedItem[]>()
      for (const it of chunk) {
        const k = it.category || 'Carta'
        if (!byCat.has(k)) byCat.set(k, [])
        byCat.get(k)!.push(it)
      }
      const out: El[] = []
      for (const [cat, list] of byCat) {
        const pill = h('div', `display:inline-flex;background:${accent};color:${readableOn(accent)};border-radius:999px;padding:${u(0.7)} ${u(2)};font-weight:900;font-size:${u(2)};text-transform:uppercase;letter-spacing:.06em;margin-bottom:${u(1.2)}`, [cat])
        const rows = list.map((it) => h('div', `display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:${u(2)};row-gap:${u(0.3)};padding:${u(0.7)} 0;border-bottom:1px solid ${ink}22`, [
          h('div', `display:flex;align-items:center;gap:${u(1)};min-width:0;flex-wrap:wrap`, [
            h('div', `font-weight:800;font-size:${u(2.6)};line-height:1.15;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;${it.available === false ? 'opacity:.5' : ''}`, [it.name]),
            it.available === false ? h('span', `background:#111;color:#fff;border-radius:${u(0.6)};padding:${u(0.2)} ${u(0.9)};font-weight:900;font-size:${u(1.5)};letter-spacing:.1em;text-transform:uppercase`, ['Agotado']) : badgePills((it as { badges?: Badge[] }).badges, accent, 1.4),
          ]),
          it.price && it.price > 0 && it.available !== false ? h('div', `display:flex;align-items:baseline;gap:${u(0.8)};white-space:nowrap`, [
            (it as { originalPrice?: number | null }).originalPrice ? h('span', `font-size:${u(1.9)};opacity:.55;text-decoration:line-through`, [formatPrice((it as { originalPrice: number }).originalPrice)]) : null,
            h('span', `font-weight:900;font-size:${u(2.6)}`, [formatPrice(it.price)]),
          ]) : h('div', ''),
          it.description ? h('div', `grid-column:1/-1;font-size:${u(1.9)};opacity:.7;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis`, [it.description]) : null,
        ]))
        out.push(h('div', `margin-bottom:${u(2.4)}`, [pill, ...rows]))
      }
      return out
    })
    const sections = pageSections[0]

    const photoCol = h('div', `position:relative;flex:none;${portrait ? `width:38%;` : 'width:36%;'}display:flex;flex-direction:column;justify-content:center;gap:${u(3)}`)
    const panel = h('div', `position:absolute;inset:${portrait ? '8% 4%' : '6% 6%'};background:${accent};border-radius:${u(3)};opacity:.95`)
    photoCol.append(panel)
    for (const [src, cut, top] of [[p1, v.image1Cutout === true, true], [p2, v.image2Cutout === true, false]] as Array<[string | null, boolean, boolean]>) {
      const pic = product(src, cut || true, portrait ? 28 : 26, bg)
      if (!pic) continue
      pic.style.cssText += `;position:relative;align-self:${top ? 'flex-start' : 'flex-end'};margin:${top ? '0 0 0 4%' : '0 4% 0 0'};z-index:1`
      photoCol.append(pic)
    }

    const listBox = h('div', `position:relative;flex:1;min-width:0;min-height:0;overflow:hidden`)
    const pageEls = pageSections.map((secs, i) => {
      const el = h('div', `position:absolute;inset:0;display:flex;flex-direction:column;${i ? 'opacity:0;visibility:hidden' : ''}`, secs)
      listBox.append(el)
      return el
    })
    const pageDots = pageEls.length > 1 ? h('div', `display:flex;gap:${u(0.8)};margin-right:auto`, pageEls.map((_, i) => h('div', `width:${u(1.2)};height:${u(1.2)};border-radius:50%;background:${i ? ink + '33' : accent}`))) : null
    const foot = h('div', `display:flex;align-items:center;justify-content:flex-end;gap:${u(2)}`, [
      pageDots,
      str(v.website) ? h('div', `background:${accent};color:${readableOn(accent)};border-radius:999px;padding:${u(1)} ${u(2.4)};font-weight:800;font-size:${u(2)}`, [str(v.website)]) : null,
      code,
    ])

    if (portrait) {
      canvas.append(h('div', `position:absolute;inset:0;display:flex;flex-direction:column;padding:${u(4.5)};box-sizing:border-box;gap:${u(2)}`, [
        head,
        h('div', `flex:1;min-height:0;display:flex;gap:${u(2)}`, [listBox, photoCol]),
        foot,
      ]))
    } else {
      canvas.append(h('div', `position:absolute;inset:0;display:flex;padding:${u(4)};box-sizing:border-box;gap:${u(3)}`, [
        h('div', `flex:1;min-width:0;display:flex;flex-direction:column;gap:${u(2)}`, [head, listBox, foot]),
        photoCol,
      ]))
    }

    tl!.from(head, { y: -U * 3, opacity: 0, duration: 0.5 }, 0)
    sections.forEach((s, i) => tl!.from(s, { x: -U * 4, opacity: 0, duration: 0.45 }, 0.15 + i * 0.08))
    tl!.from(photoCol.children, { scale: 0.85, opacity: 0, stagger: 0.12, duration: 0.7, ease: 'back.out(1.4)' }, 0.35)
    tl!.from(foot, { opacity: 0, y: U * 2, duration: 0.4 }, 0.9)
    // Cambio de página: la lista sale y entra la siguiente (los puntos marcan cuál va).
    const step = Math.max(4000, b.pageMs) / 1000
    pageEls.forEach((el, i) => {
      if (!i) return
      const at = i * step
      const prev = pageEls[i - 1]
      tl!.to(prev, { opacity: 0, x: -U * 4, duration: 0.45, ease: 'power2.in', onComplete: () => { prev.style.visibility = 'hidden' } }, at - 0.45)
      tl!.set(el, { visibility: 'visible', x: U * 4 }, at)
      tl!.to(el, { opacity: 1, x: 0, duration: 0.5, ease: 'power3.out' }, at)
      tl!.from(el.children, { x: -U * 3, opacity: 0, stagger: 0.06, duration: 0.4 }, at + 0.1)
      if (pageDots) tl!.call(() => { [...pageDots.children].forEach((d, k) => { (d as El).style.background = k === i ? accent : ink + '33' }) }, [], at)
    })
    if (!reduced) {
      const imgs = photoCol.querySelectorAll('img')
      imgs.forEach((img, i) => loops.push(gsap.to(img, { y: i ? 4 : -4, duration: 2.6, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 1.3 })))
    }
  }

  // ── 7. Menú Ejecutivo (Premium) ─────────────────────────────────────────
  async function menuEjecutivo() {
    const accent = hex(v.accent, b.brand.primary || '#1f4d3a')
    const priceCol = hex(v.priceColor, '#d97706')
    const sans = fontOf('font', 'Montserrat')
    const script = fontOf('scriptFont', 'Dancing Script', '"Brush Script MT","Segoe Script",cursive')
    canvas.style.background = '#111'
    o.host.style.background = '#111'
    const fromMenu = v.fromMenu !== false
    const items = fromMenu ? resolvedItems().slice(0, 4) : []
    const uploads = fromMenu ? [] : await Promise.all([photo(v.image1), photo(v.image2), photo(v.image3), photo(v.image4)])
    const cuts = [v.image1Cutout, v.image2Cutout, v.image3Cutout, v.image4Cutout]
    const menuSrcs = fromMenu ? await Promise.all(items.map((it) => photo(it.image))) : []
    const cells: Array<{ src: string | null; cut: boolean }> = fromMenu
      ? menuSrcs.map((src, i) => ({ src, cut: items[i]?.cutout === true }))
      : uploads.map((src, i) => ({ src, cut: cuts[i] === true }))
    while (cells.length < 4) cells.push({ src: null, cut: false })

    const code = await qr(portrait ? 11 : 10)
    const gap = u(1.2)
    const grid = h('div', `position:absolute;inset:0;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:${gap};background:#fff`)
    const cellEls: El[] = []
    for (let i = 0; i < 4; i++) {
      const cell = h('div', `position:relative;overflow:hidden;background:#1a1a1a`)
      const c = cells[i]
      if (c.src) {
        const img = h('img', `position:absolute;inset:0;width:100%;height:100%;object-fit:${c.cut ? 'contain' : 'cover'};display:block`)
        img.src = c.src; img.alt = ''
        cell.append(img)
      } else if (fromMenu && items[i]?.name) {
        // Plato sin foto: el nombre en grande del color principal (respaldo tipográfico).
        cell.style.background = accent
        const t = h('div', `position:absolute;inset:12%;display:flex;align-items:center;justify-content:center;text-align:center;font-family:${sans};font-weight:900;text-transform:uppercase;line-height:1;color:${readableOn(accent)};font-size:${u(portrait ? 7 : 6)};overflow:hidden`, [items[i].name])
        t.dataset.fit = 'h'
        cell.append(t)
      }
      if (fromMenu && items[i]?.available === false) cell.append(soldOutStamp(3))
      grid.append(cell)
      cellEls.push(cell)
    }
    canvas.append(grid)

    const priceLabel = typeof v.price === 'number' && v.price > 0
      ? formatPrice(v.price)
      : (fromMenu && items[0]?.price ? formatPrice(items[0].price) : '')
    const card = h('div', `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:${u(portrait ? 52 : 44)};max-width:86%;background:#fff;border:${u(1.1)} solid ${accent};border-radius:${u(4)};padding:${u(3.2)} ${u(3)};box-sizing:border-box;display:flex;flex-direction:column;align-items:center;text-align:center;gap:${u(1)};color:${accent};box-shadow:0 ${u(2)} ${u(4)} rgba(0,0,0,.25)`, [
      str(v.eyebrow) ? h('div', `font-family:${sans};font-weight:800;font-size:${u(2.4)};line-height:1.2`, [str(v.eyebrow)]) : null,
      h('div', `display:flex;align-items:baseline;justify-content:center;gap:${u(1.2)};flex-wrap:wrap;width:100%`, [
        h('div', `font-family:${script};font-size:${u(portrait ? 10 : 8)};line-height:1;font-weight:700`, [str(v.titleWord)]),
        priceLabel ? h('div', `font-family:${sans};font-weight:900;font-size:${u(portrait ? 9 : 7)};color:${priceCol};line-height:1`, [priceLabel]) : null,
      ]),
      str(v.titleWord2) ? h('div', `font-family:${sans};font-weight:800;font-size:${u(3.2)};text-transform:uppercase;letter-spacing:.04em`, [str(v.titleWord2)]) : null,
      str(v.schedule) ? h('div', `font-size:${u(2)};opacity:.85;line-height:1.3;max-width:100%`, [str(v.schedule)]) : null,
    ])
    canvas.append(card)

    const handle = str(v.handle) || brandName()
    if (handle || code) {
      const pill = h('div', `position:absolute;right:${u(3)};bottom:${u(3)};background:${accent};color:${readableOn(accent)};border-radius:999px;padding:${u(1)} ${u(2)};display:flex;align-items:center;gap:${u(1.2)};font-weight:800;font-size:${u(2)}`, [
        handle ? h('div', '', [handle.startsWith('@') ? handle : `@${handle}`]) : null,
        code,
      ])
      canvas.append(pill)
      tl!.from(pill, { y: U * 4, opacity: 0, duration: 0.45 }, 1.1)
    }

    cellEls.forEach((c, i) => tl!.from(c, { scale: 1.12, opacity: 0, duration: 0.7, ease: 'power3.out' }, i * 0.08))
    tl!.from(card, { scale: 0.6, opacity: 0, duration: 0.75, ease: 'back.out(1.8)' }, 0.45)
    if (!reduced) {
      cellEls.forEach((c, i) => {
        const img = c.querySelector('img')
        if (img) loops.push(gsap.to(img, { scale: 1.06, duration: 8 + i, ease: 'none', yoyo: true, repeat: -1, delay: 1.2 }))
      })
      loops.push(gsap.to(card, { y: -3, duration: 2.4, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 1.5 }))
    }
  }
  // ── 8. Eco Palabra (Premium) ────────────────────────────────────────────
  async function ecoPalabra() {
    const accent = hex(v.accent, b.brand.primary || '#e10600')
    const bg = hex(v.background, '#f7f3ea')
    const font = fontOf('font', 'Fredoka')
    canvas.style.background = bg
    canvas.style.color = accent
    o.host.style.background = bg
    const [src, code, lg] = await Promise.all([photo(v.image), qr(portrait ? 12 : 11), logo(6)])
    const cut = v.imageCutout === true
    const word = (str(v.word) || 'Hola').toUpperCase()
    const repeats = portrait ? 4 : 3
    const wordsBox = h('div', `position:absolute;left:0;right:0;top:${portrait ? '10%' : '8%'};bottom:${portrait ? '18%' : '16%'};display:flex;flex-direction:column;align-items:center;justify-content:space-evenly;pointer-events:none`)
    const wordEls: El[] = []
    for (let i = 0; i < repeats; i++) {
      const line = h('div', `font-family:${font};font-weight:900;font-size:${u(portrait ? 18 : 14)};line-height:.85;letter-spacing:-.02em;text-transform:uppercase;white-space:nowrap;overflow:hidden;width:100%;text-align:center;opacity:${0.95 - i * 0.02}`, [word])
      line.dataset.fit = '1'
      wordsBox.append(line)
      wordEls.push(line)
    }
    canvas.append(wordsBox)

    if (lg) {
      lg.style.cssText += `;position:absolute;left:50%;top:${u(3)};transform:translateX(-50%)`
      canvas.append(lg)
    }

    const pics: El[] = []
    if (src) {
      const count = portrait ? 3 : 3
      for (let i = 0; i < count; i++) {
        const p = product(src, cut, portrait ? 34 : 28, bg)!
        const top = portrait ? 18 + i * 22 : 16 + i * 24
        p.style.cssText += `;position:absolute;left:50%;top:${top}%;transform:translate(-50%,-50%);z-index:2`
        canvas.append(p)
        pics.push(p)
      }
    }

    const price = typeof v.price === 'number' && v.price > 0
      ? h('div', `position:absolute;right:${u(5)};top:${u(8)};background:${accent};color:${readableOn(accent)};border-radius:999px;padding:${u(1.2)} ${u(2.4)};font-family:${font};font-weight:900;font-size:${u(3.2)}`, [formatPrice(v.price)])
      : null
    if (price) canvas.append(price)

    const foot = h('div', `position:absolute;left:${u(5)};right:${u(5)};bottom:${u(4)};display:flex;align-items:center;justify-content:center;gap:${u(2)};font-weight:800;font-size:${u(2.4)};text-transform:uppercase;letter-spacing:.08em`, [
      str(v.cta) ? h('div', '', [str(v.cta)]) : null,
      str(v.website) ? h('div', `opacity:.85`, [str(v.website)]) : null,
      code,
    ])
    canvas.append(foot)

    wordEls.forEach((w, i) => tl!.from(w, { xPercent: i % 2 ? 30 : -30, opacity: 0, duration: 0.7, ease: 'power4.out' }, i * 0.06))
    pics.forEach((p, i) => tl!.from(p, { scale: 0.4, opacity: 0, duration: 0.8, ease: 'back.out(1.8)' }, 0.35 + i * 0.12))
    if (price) tl!.from(price, { scale: 1.4, opacity: 0, duration: 0.45 }, 1)
    tl!.from(foot, { y: U * 3, opacity: 0, duration: 0.45 }, 1.05)
    if (!reduced) {
      pics.forEach((p, i) => loops.push(gsap.to(p, { y: i % 2 ? 6 : -6, duration: 2.3 + i * 0.2, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 1.4 })))
      wordEls.forEach((w, i) => loops.push(gsap.to(w, { x: i % 2 ? 8 : -8, duration: 5, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 1.6 })))
    }
  }

  void start().catch((e) => finish(false, (e as Error)?.message || 'error'))
  return () => finish(false, 'cancelada')
}
