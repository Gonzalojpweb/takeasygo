// ── Pin de la ciudad (HTML para los marcadores del mapa) ────────────────────
//
// El pin ES el mascot (Living City System): cara = presente, anillo = historia,
// corona = referente. Este archivo es la única fuente del pin dentro del mapa;
// el componente React equivalente es components/tgo/PuntoTGO.
//
// Lo nuevo es la ETIQUETA: una palabra pegada al pin («11 min», «Lleno»,
// «Promo») que hace que el mapa informe sin tener que tocar nada. Es una
// insignia: no cambia la cara ni el anillo.

import type { RestaurantCardData } from '@/types/restaurant-card'
import {
  cityOpportunity,
  cityStatus,
  isAwake,
  pinExpression,
  type PinExpression,
  type StatusTone,
} from '@/lib/city/signals'

const INK = '#2D2A4B'

function faceSvg(expression: PinExpression): string {
  if (expression === 'wink') {
    return `
      <circle cx="15" cy="16" r="1.8" fill="${INK}"/>
      <path d="M23 15.5 Q25 14 27 15.5" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" fill="none"/>
      <path d="M17 21 Q20 25 23 21" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" fill="none"/>`
  }
  if (expression === 'sleepy') {
    return `
      <path d="M13.5 16.5 L16.5 16.5" stroke="${INK}" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M23.5 16.5 L26.5 16.5" stroke="${INK}" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M17.5 21 L22.5 21" stroke="${INK}" stroke-width="1.5" stroke-linecap="round" fill="none"/>`
  }
  return `
      <circle cx="15" cy="16" r="1.8" fill="${INK}"/>
      <circle cx="25" cy="16" r="1.8" fill="${INK}"/>
      <path d="M17 21 Q20 24.5 23 21" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" fill="none"/>`
}

function ringSvg(ring: RestaurantCardData['icoRing']): string {
  if (ring === 'thin') {
    return `<ellipse cx="20" cy="50" rx="14" ry="3.5" fill="none" stroke="#94A3B8" stroke-width="1.5" opacity="0.8"/>`
  }
  if (ring === 'marked') {
    return `<ellipse cx="20" cy="50" rx="15" ry="4" fill="none" stroke="#FF8C42" stroke-width="2.5"/>`
  }
  if (ring === 'gold') {
    return `<ellipse cx="20" cy="50" rx="16" ry="4.5" fill="none" stroke="url(#cityPinGold)" stroke-width="3.2"/>`
  }
  return ''
}

const CROWN_SVG = `
  <g>
    <path d="M12 4 L14.5 8.5 L20 2 L25.5 8.5 L28 4 L26.5 11 L13.5 11 Z" fill="url(#cityPinCrown)" stroke="#B45309" stroke-width="0.8" stroke-linejoin="round"/>
    <circle cx="12" cy="3.5" r="0.9" fill="#FFF"/>
    <circle cx="20" cy="1.5" r="1.1" fill="#FFF"/>
    <circle cx="28" cy="3.5" r="0.9" fill="#FFF"/>
  </g>`

/** Definiciones SVG compartidas por todos los pines: se montan una sola vez. */
export const CITY_PIN_DEFS = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="cityPinFill" x1="20" y1="0" x2="20" y2="52" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#FFB347"/>
      <stop offset="50%" stop-color="#FF8C42"/>
      <stop offset="100%" stop-color="#F74211"/>
    </linearGradient>
    <linearGradient id="cityPinGold" x1="0" y1="49" x2="40" y2="49" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#FFE259"/>
      <stop offset="50%" stop-color="#FFA751"/>
      <stop offset="100%" stop-color="#FFD700"/>
    </linearGradient>
    <linearGradient id="cityPinCrown" x1="12" y1="2" x2="28" y2="11" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#FDE047"/>
      <stop offset="100%" stop-color="#CA8A04"/>
    </linearGradient>
  </defs>
</svg>`

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export interface PinModel {
  expression: PinExpression
  awake: boolean
  /** Texto de la etiqueta. Vacío = sin etiqueta. */
  tag: string
  tagTone: StatusTone | 'promo'
  ring: RestaurantCardData['icoRing']
  crown: boolean
  isNew: boolean
  network: boolean
  label: string
}

/** Todo lo que el pin muestra, derivado de las señales. */
export function pinModel(r: RestaurantCardData): PinModel {
  const network = r.type === 'network'
  const awake = isAwake(r)
  const status = cityStatus(r)
  const opportunity = cityOpportunity(r)

  // Etiqueta: si pasa algo que cambia la decisión (lleno, demora, cierre) va
  // eso; si no, la promo; si no, el tiempo.
  let tag = ''
  let tagTone: PinModel['tagTone'] = status.tone
  if (network) {
    const urgent = status.tone === 'warn' || status.tone === 'busy'
    if (awake && !urgent && opportunity?.kind === 'promo') {
      tag = 'Promo'
      tagTone = 'promo'
    } else {
      tag = status.short
    }
  }

  return {
    expression: network ? pinExpression(r) : 'sleepy',
    awake,
    tag,
    tagTone,
    ring: network ? (r.icoRing ?? 'none') : 'none',
    crown: network && r.hasCrown === true,
    isNew: network && r.isNew === true,
    network,
    label: `${r.name}. ${status.text}`,
  }
}

/** Clave estable: si no cambia, el marcador no se vuelve a dibujar. */
export function pinKey(r: RestaurantCardData, m: PinModel, withTag: boolean): string {
  return [r.id, m.expression, m.ring, m.crown, m.isNew, withTag ? `${m.tag}|${m.tagTone}` : ''].join('·')
}

export function pinHtml(m: PinModel, withTag: boolean): string {
  const size = m.network ? 40 : 30
  const height = Math.round(size * 1.35)
  const fill = m.expression === 'sleepy' ? (m.network ? '#A7ABB8' : '#C3C6CF') : 'url(#cityPinFill)'
  const tag =
    withTag && m.tag
      ? `<span class="city-pin__tag" data-tone="${m.tagTone}">${escapeHtml(m.tag)}</span>`
      : ''
  const dot = m.isNew ? '<span class="city-pin__new" aria-hidden="true"></span>' : ''

  return `
    <span class="city-pin__body${m.awake ? ' is-awake' : ''}">
      <svg width="${size}" height="${height}" viewBox="0 0 40 54" fill="none" aria-hidden="true">
        ${ringSvg(m.ring)}
        <path d="M20 52C20 52 40 36 40 22C40 10 31 0 20 0C9 0 0 10 0 22C0 36 20 52 20 52Z" fill="${fill}"/>
        <circle cx="20" cy="20" r="12" fill="white"/>
        ${faceSvg(m.expression)}
        ${m.crown ? CROWN_SVG : ''}
      </svg>
      ${dot}
    </span>
    ${tag}`
}

export function clusterHtml(count: number, awake: number): string {
  return `
    <span class="city-cluster__ring${awake > 0 ? ' is-awake' : ''}"></span>
    <span class="city-cluster__count">${count}</span>`
}

export const USER_PUCK_HTML = `
  <span class="city-puck__pulse"></span>
  <span class="city-puck__dot"></span>`
