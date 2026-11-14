// ── Sprites del mapa (dibujados a pedido) ───────────────────────────────────
//
// Todo lo que aparece sobre el mapa (pines, gadgets, carteles, grupos) es una
// imagen que el motor pide por nombre la primera vez que la necesita
// (evento `styleimagemissing`). Agregar un gadget nuevo = un caso acá y una
// regla en lib/city/gadgets.ts. Escala igual con 20 que con 2.000 locales.
//
// Nombres:
//   pin|<cara>|<anillo>|<corona 0/1>|<red 0/1>|<vende online 0/1>
//   g|<gadget>|<tema>|<ancho>
//   tag|<texto>|<tono>|<tema>
//   c|<cantidad>|<despiertos 0/1>|<tema>

import type { CityTheme } from '@/lib/city/map-style'
import { GADGET_SIZE } from '@/lib/city/gadgets'

/** Densidad de los dibujos (2 = nítido en pantallas retina). */
export const SPRITE_RATIO = 2

// Íconos de línea: el mismo set (lucide) que usa el resto de la app.
type IconNode =
  | ['path', { d: string }]
  | ['circle', { cx: number; cy: number; r: number }]
  | ['rect', { x: number; y: number; w: number; h: number; r: number }]

const ICONS: Record<string, IconNode[]> = {
  bike: [['circle', { cx: 18.5, cy: 17.5, r: 3.5 }], ['circle', { cx: 5.5, cy: 17.5, r: 3.5 }], ['circle', { cx: 15, cy: 5, r: 1 }], ['path', { d: 'M12 17.5V14l-3-3 4-3 2 3h2' }]],
  cash: [['rect', { x: 2, y: 6, w: 20, h: 12, r: 2 }], ['circle', { cx: 12, cy: 12, r: 2 }], ['path', { d: 'M6 12h.01M18 12h.01' }]],
  mp: [['rect', { x: 5, y: 2, w: 14, h: 20, r: 2 }], ['path', { d: 'M12 18h.01' }]],
  transfer: [['path', { d: 'M8 3 4 7l4 4' }], ['path', { d: 'M4 7h16' }], ['path', { d: 'm16 21 4-4-4-4' }], ['path', { d: 'M20 17H4' }]],
  gift: [['path', { d: 'M12 7v14' }], ['path', { d: 'M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8' }], ['path', { d: 'M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5' }], ['rect', { x: 3, y: 7, w: 18, h: 4, r: 1 }]],
  tag: [['path', { d: 'M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z' }], ['circle', { cx: 7.5, cy: 7.5, r: 0.6 }]],
  users: [['path', { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' }], ['path', { d: 'M16 3.128a4 4 0 0 1 0 7.744' }], ['path', { d: 'M22 21v-2a4 4 0 0 0-3-3.87' }], ['circle', { cx: 9, cy: 7, r: 4 }]],
  new: [['path', { d: 'M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z' }], ['path', { d: 'M20 2v4' }], ['path', { d: 'M22 4h-4' }], ['circle', { cx: 4, cy: 20, r: 2 }]],
  clock: [['circle', { cx: 12, cy: 12, r: 10 }], ['path', { d: 'M12 6v6l4 2' }]],
}

const pathCache = new Map<string, Path2D>()
function iconPath(name: string): Path2D {
  const cached = pathCache.get(name)
  if (cached) return cached
  const p = new Path2D()
  for (const node of ICONS[name] ?? []) {
    const s = new Path2D()
    if (node[0] === 'path') s.addPath(new Path2D(node[1].d))
    else if (node[0] === 'circle') {
      const { cx, cy, r } = node[1]
      s.moveTo(cx + r, cy)
      s.arc(cx, cy, r, 0, Math.PI * 2)
    } else {
      const { x, y, w, h, r } = node[1]
      s.roundRect(x, y, w, h, r)
    }
    p.addPath(s)
  }
  pathCache.set(name, p)
  return p
}

function strokeIcon(g: CanvasRenderingContext2D, name: string, x: number, y: number, size: number, color: string) {
  g.save()
  g.translate(x, y)
  g.scale(size / 24, size / 24)
  g.strokeStyle = color
  g.lineWidth = 2.1
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.stroke(iconPath(name))
  g.restore()
}

interface Palette {
  badge: string
  badgeLine: string
  ink: string
  pill: string
  pillInk: string
  meterOff: string
}

const PALETTE: Record<CityTheme, Palette> = {
  day: { badge: '#FFFFFF', badgeLine: 'rgba(45,42,75,0.14)', ink: '#2D2A4B', pill: '#FFFFFF', pillInk: '#2D2A4B', meterOff: 'rgba(45,42,75,0.15)' },
  night: { badge: '#232737', badgeLine: 'rgba(255,255,255,0.14)', ink: '#F4F2EF', pill: '#232737', pillInk: '#F4F2EF', meterOff: 'rgba(255,255,255,0.18)' },
}

export interface SpriteImage {
  width: number
  height: number
  data: Uint8ClampedArray
}

function paint(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): SpriteImage {
  const c = document.createElement('canvas')
  c.width = Math.ceil(w * SPRITE_RATIO)
  c.height = Math.ceil(h * SPRITE_RATIO)
  const g = c.getContext('2d')!
  g.scale(SPRITE_RATIO, SPRITE_RATIO)
  draw(g)
  return { width: c.width, height: c.height, data: g.getImageData(0, 0, c.width, c.height).data }
}

const FONT = (weight: number, size: number) => `${weight} ${size}px Inter, system-ui, -apple-system, sans-serif`
let measureCtx: CanvasRenderingContext2D | null = null
function measure(text: string, font: string): number {
  measureCtx ??= document.createElement('canvas').getContext('2d')
  measureCtx!.font = font
  return Math.ceil(measureCtx!.measureText(text).width)
}

// ── Pin (el mascot) ──────────────────────────────────────────────────────
const PIN_BODY = 'M20 52C20 52 40 36 40 22C40 10 31 0 20 0C9 0 0 10 0 22C0 36 20 52 20 52Z'

function drawPin(g: CanvasRenderingContext2D, expr: string, ring: string, crown: boolean, network: boolean, selling: boolean) {
  g.save()
  g.translate(4, 4)

  // Anillo de confiabilidad (ICO) en la base: escala continua, nunca otra cara.
  if (ring !== 'none') {
    g.beginPath()
    const rx = ring === 'gold' ? 16 : ring === 'marked' ? 15 : 14
    g.ellipse(20, 51, rx, ring === 'gold' ? 4.5 : 4, 0, 0, Math.PI * 2)
    g.lineWidth = ring === 'gold' ? 3.2 : ring === 'marked' ? 2.5 : 1.5
    g.strokeStyle = ring === 'gold' ? '#FFC93C' : ring === 'marked' ? '#FF8C42' : 'rgba(148,163,184,0.85)'
    g.stroke()
  }

  const body = new Path2D(PIN_BODY)
  g.shadowColor = selling ? 'rgba(247,66,17,0.45)' : 'rgba(20,18,40,0.3)'
  g.shadowBlur = selling ? 9 : 6
  g.shadowOffsetY = 3
  if (expr === 'sleepy') {
    g.fillStyle = network ? '#A7ABB8' : '#C3C6CF'
  } else {
    const gr = g.createLinearGradient(0, 0, 0, 52)
    gr.addColorStop(0, '#FFB347')
    gr.addColorStop(0.5, '#FF8C42')
    gr.addColorStop(1, '#F74211')
    g.fillStyle = gr
  }
  g.fill(body)
  g.shadowColor = 'transparent'

  // Vende online: contorno blanco que lo despega del mapa.
  if (selling) {
    g.lineWidth = 2.4
    g.strokeStyle = '#FFFFFF'
    g.stroke(body)
  }

  g.beginPath()
  g.arc(20, 20, 12, 0, Math.PI * 2)
  g.fillStyle = '#FFFFFF'
  g.fill()

  g.strokeStyle = '#2D2A4B'
  g.fillStyle = '#2D2A4B'
  g.lineCap = 'round'
  if (expr === 'sleepy') {
    g.lineWidth = 1.5
    g.beginPath()
    g.moveTo(13.5, 16.5); g.lineTo(16.5, 16.5)
    g.moveTo(23.5, 16.5); g.lineTo(26.5, 16.5)
    g.moveTo(17.5, 21); g.lineTo(22.5, 21)
    g.stroke()
  } else {
    g.beginPath(); g.arc(15, 16, 1.8, 0, Math.PI * 2); g.fill()
    if (expr === 'wink') {
      g.lineWidth = 1.8
      g.beginPath(); g.moveTo(23, 15.5); g.quadraticCurveTo(25, 14, 27, 15.5); g.stroke()
    } else {
      g.beginPath(); g.arc(25, 16, 1.8, 0, Math.PI * 2); g.fill()
    }
    g.lineWidth = 1.6
    g.beginPath(); g.moveTo(17, 21); g.quadraticCurveTo(20, expr === 'wink' ? 25 : 24.5, 23, 21); g.stroke()
  }

  if (crown) {
    g.beginPath()
    g.moveTo(12, 4); g.lineTo(14.5, 8.5); g.lineTo(20, 2); g.lineTo(25.5, 8.5); g.lineTo(28, 4); g.lineTo(26.5, 11); g.lineTo(13.5, 11)
    g.closePath()
    g.fillStyle = '#F5C518'; g.fill()
    g.strokeStyle = '#B45309'; g.lineWidth = 0.8; g.stroke()
  }

  // Sello «vende online»: verde, en el hombro del pin.
  if (selling) {
    g.beginPath(); g.arc(34, 33, 6.2, 0, Math.PI * 2)
    g.fillStyle = '#12B76A'; g.fill()
    g.lineWidth = 1.6; g.strokeStyle = '#FFFFFF'; g.stroke()
    g.beginPath(); g.moveTo(31.4, 33.2); g.lineTo(33.3, 35); g.lineTo(36.7, 31.3)
    g.lineWidth = 1.7; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#FFFFFF'; g.stroke()
  }
  g.restore()
}

// ── Gadgets ──────────────────────────────────────────────────────────────
const SALON_FILL: Record<string, number> = { calm: 1, moving: 2, busy: 3, full: 4 }
const SALON_COLOR: Record<string, string> = { calm: '#12B76A', moving: '#12B76A', busy: '#F59E0B', full: '#EA580C' }
const SINGLE_ICON: Record<string, string> = {
  promo: 'tag', club: 'gift', bike: 'bike', new: 'new', closing: 'clock', 'g-cash': 'cash', 'g-mp': 'mp', 'g-transfer': 'transfer',
}

function drawGadget(g: CanvasRenderingContext2D, id: string, theme: CityTheme, w: number) {
  const P = PALETTE[theme]
  const h = GADGET_SIZE
  let bg = P.badge
  let ink = P.ink
  let line: string | null = P.badgeLine
  if (id === 'promo') { bg = theme === 'day' ? '#2D2A4B' : '#F4F2EF'; ink = theme === 'day' ? '#FFB347' : '#C2410C'; line = null }
  if (id === 'club') ink = theme === 'day' ? '#6941E0' : '#B39DFF'
  if (id === 'new') ink = theme === 'day' ? '#3F6FC0' : '#8FB4F0'
  if (id === 'closing') ink = '#D97706'

  g.save()
  g.translate(2, 2)
  g.shadowColor = 'rgba(20,18,40,0.22)'
  g.shadowBlur = 5
  g.shadowOffsetY = 2
  g.beginPath(); g.roundRect(0, 0, w, h, h / 2); g.fillStyle = bg; g.fill()
  g.shadowColor = 'transparent'
  if (line) { g.lineWidth = 1; g.strokeStyle = line; g.stroke() }

  if (id.startsWith('pay-')) {
    id.slice(4).split('-').forEach((k, i) => strokeIcon(g, k, 7 + i * 19, 6.5, 15, ink))
  } else if (id.startsWith('salon-')) {
    const level = id.slice(6)
    strokeIcon(g, 'users', 7, 6.5, 15, ink)
    for (let i = 0; i < 4; i++) {
      g.beginPath(); g.roundRect(27 + i * 5, 8, 3.2, 12, 1.6)
      g.fillStyle = i < (SALON_FILL[level] ?? 0) ? SALON_COLOR[level] : P.meterOff
      g.fill()
    }
  } else if (SINGLE_ICON[id]) {
    strokeIcon(g, SINGLE_ICON[id], (w - 15) / 2, 6.5, 15, ink)
  }
  g.restore()
}

// ── Carteles y grupos ────────────────────────────────────────────────────
const TONE_DOT: Record<string, string> = { live: '#12B76A', calm: '#12B76A', busy: '#F59E0B', warn: '#EA580C', rest: '#98A2B3', info: '#878CA0', promo: '#FFB347' }

function tagImage(text: string, tone: string, theme: CityTheme): SpriteImage {
  const P = PALETTE[theme]
  const promo = tone === 'promo'
  const font = FONT(700, 11)
  const w = measure(text, font) + 26
  return paint(w + 4, 26, g => {
    g.translate(2, 2)
    g.shadowColor = 'rgba(20,18,40,0.22)'
    g.shadowBlur = 5
    g.shadowOffsetY = 1.5
    g.beginPath(); g.roundRect(0, 0, w, 20, 10)
    g.fillStyle = promo ? (theme === 'day' ? '#2D2A4B' : '#F4F2EF') : P.pill
    g.fill()
    g.shadowColor = 'transparent'
    g.beginPath(); g.arc(10, 10, 3, 0, Math.PI * 2)
    g.fillStyle = promo && theme === 'night' ? '#C2410C' : TONE_DOT[tone] ?? TONE_DOT.info
    g.fill()
    g.font = font
    g.fillStyle = promo ? (theme === 'day' ? '#FFFFFF' : '#181A26') : tone === 'rest' ? '#70768A' : P.pillInk
    g.textBaseline = 'middle'
    g.fillText(text, 17, 10.5)
  })
}

function clusterImage(count: string, awake: boolean, theme: CityTheme): SpriteImage {
  const P = PALETTE[theme]
  return paint(48, 48, g => {
    g.beginPath(); g.arc(24, 24, 22, 0, Math.PI * 2)
    g.fillStyle = awake ? 'rgba(247,66,17,0.22)' : 'rgba(152,162,179,0.3)'
    g.fill()
    g.shadowColor = 'rgba(20,18,40,0.22)'; g.shadowBlur = 5; g.shadowOffsetY = 2
    g.beginPath(); g.arc(24, 24, 16, 0, Math.PI * 2); g.fillStyle = P.pill; g.fill()
    g.shadowColor = 'transparent'
    g.font = FONT(800, 14); g.fillStyle = P.pillInk; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText(count, 24, 25)
  })
}

const asTheme = (v: string | undefined): CityTheme => (v === 'night' ? 'night' : 'day')

/** Dibuja la imagen pedida por nombre, o null si el nombre no es nuestro. */
export function generateSprite(id: string): SpriteImage | null {
  const [kind, a, b, c, d, e] = id.split('|')
  switch (kind) {
    case 'pin':
      return paint(48, 62, g => drawPin(g, a, b, c === '1', d === '1', e === '1'))
    case 'g': {
      const w = Number(c) || GADGET_SIZE
      return paint(w + 4, GADGET_SIZE + 4, g => drawGadget(g, a, asTheme(b), w))
    }
    case 'tag':
      return tagImage(a, b, asTheme(c))
    case 'c':
      return clusterImage(a, b === '1', asTheme(c))
    default:
      return null
  }
}

/** El mismo dibujo de un gadget, en un <canvas> para usar fuera del mapa (burbujas). */
export function gadgetCanvas(id: string, theme: CityTheme, width = GADGET_SIZE): HTMLCanvasElement {
  const img = generateSprite(`g|${id}|${theme}|${width}`)!
  const c = document.createElement('canvas')
  c.width = img.width
  c.height = img.height
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0)
  c.style.width = `${img.width / SPRITE_RATIO}px`
  c.style.height = `${img.height / SPRITE_RATIO}px`
  return c
}
