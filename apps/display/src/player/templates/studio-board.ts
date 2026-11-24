// ============================================================================
// Display Studio — plantillas de diseño (plan: apps/display/PLAN-STUDIO.md §6/§9)
// ============================================================================
// Tres plantillas con un renderer cada una sobre una base común:
//   · golden-bites        (Free)    título enorme, producto sobre un arco de
//                                   color, banda inferior descuento/horario/QR
//   · cheese-burger       (Premium) fondo plano, palabra gigante en marquesina
//                                   saliendo de los bordes, producto encima
//   · chocolate-croissant (Premium) serif + manuscrita, trazos que se dibujan,
//                                   sello circular, lema con ornamento
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
import { fitCanvas, formatPrice, readableOn, type Freshness, type StudioBoard } from '../board'

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
    setTimeout(() => { for (const x of urls) if (x.startsWith('blob:')) URL.revokeObjectURL(x) }, 1500)
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
  /** Producto: recortado → flota con sombra; con fondo → enmarcado en círculo. */
  const product = (src: string | null, cutout: boolean, sizeU: number, ring: string, fill = false): El | null => {
    if (!src) return null
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
      default: finish(false, 'plantilla desconocida'); return
    }
    if (cancelled) return
    await Promise.all([...canvas.querySelectorAll('img')].map((img) => (img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r }))))
    if (cancelled) return
    canvas.querySelectorAll<El>('[data-fit]').forEach((el) => fitText(el, U * 1.4, { height: el.dataset.fit === 'h' }))
    gsap.to(o.host, { opacity: 1, duration: 0.45 })
    o.onShown()
    if (reduced) tl.progress(1); else tl.play()
    timer = setTimeout(() => {
      gsap.to(canvas, { opacity: 0, duration: 0.5, onComplete: () => finish(true) })
    }, Math.max(4000, b.pageMs))
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

  void start().catch((e) => finish(false, (e as Error)?.message || 'error'))
  return () => finish(false, 'cancelada')
}
