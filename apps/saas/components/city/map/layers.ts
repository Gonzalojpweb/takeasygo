// ── Capas de la ciudad sobre el mapa ────────────────────────────────────────
//
// Lugares → GeoJSON (fuentes) y las capas que los dibujan por nivel de zoom.
// Los dibujos salen de ./sprites (a pedido) y las reglas de lib/city/gadgets.

import type { Map as MapLibreMap, GeoJSONSource, ExpressionSpecification } from 'maplibre-gl'
import type { RestaurantCardData } from '@/types/restaurant-card'
import { isAwake, matchesLayer, pinExpression, type CityLayer } from '@/lib/city/signals'
import {
  ORBIT_MAX,
  PIN_HEAD_Y,
  ZOOM_BLOCKS,
  ZOOM_STREET,
  isSellingOnline,
  layerGadget,
  orbitGadgets,
  orbitKey,
  orbitOffsets,
  pinTag,
  primaryGadget,
} from '@/lib/city/gadgets'
import type { CityTheme } from '@/lib/city/map-style'

type Feature = GeoJSON.Feature<GeoJSON.Point, Record<string, string | number>>
const collection = (features: Feature[]): GeoJSON.FeatureCollection<GeoJSON.Point> => ({ type: 'FeatureCollection', features })
const point = (p: RestaurantCardData, properties: Record<string, string | number>): Feature => ({
  type: 'Feature',
  properties,
  geometry: { type: 'Point', coordinates: [p.lng as number, p.lat as number] },
})

/** Tema de los dibujos sobre el mapa (fijo: ver addCityLayers). */
export const SPRITE_THEME: CityTheme = 'day'

/** Cuánto más grande se ve el pin de un local que vende online. */
export const SELLING_SCALE = 1.16

export function pinSprite(p: RestaurantCardData): string {
  const network = p.type === 'network'
  return [
    'pin',
    network ? pinExpression(p) : 'sleepy',
    network ? p.icoRing ?? 'none' : 'none',
    network && p.hasCrown ? 1 : 0,
    network ? 1 : 0,
    isSellingOnline(p) ? 1 : 0,
  ].join('|')
}

/** Orden de dibujo y de prioridad: vende online, despierto, red, directorio; después cercanía. */
function sortKey(p: RestaurantCardData): number {
  const rank = isSellingOnline(p) && isAwake(p) ? 0 : isAwake(p) ? 10 : p.type === 'network' ? 20 : 30
  return rank + Math.min(p.distanceM ?? 9999, 9999) / 10000
}

export interface CitySources {
  active: Feature[]
  dim: Feature[]
  halos: Feature[]
  primary: Feature[]
  orbit: Feature[]
  tags: Feature[]
}

export function buildSources(places: RestaurantCardData[], layer: CityLayer | null): CitySources {
  const out: CitySources = { active: [], dim: [], halos: [], primary: [], orbit: [], tags: [] }
  for (const p of places) {
    if (p.lat == null || p.lng == null) continue
    const sort = sortKey(p)
    const pro = isSellingOnline(p) ? 1 : 0
    const awake = isAwake(p) ? 1 : 0
    const base = { id: p.id, pin: pinSprite(p), sort, pro, awake }
    if (layer && !matchesLayer(p, layer)) {
      out.dim.push(point(p, base))
      continue
    }
    out.active.push(point(p, base))
    if (awake) out.halos.push(point(p, { id: p.id, pro }))

    const tag = pinTag(p)
    if (tag) out.tags.push(point(p, { id: p.id, text: tag.text, tone: tag.tone, tier: tag.tier, sort, pro }))

    const primary = layer ? layerGadget(layer, p) : primaryGadget(p)
    if (primary) out.primary.push(point(p, { id: p.id, g: primary.id, w: primary.width, sort, pro }))

    const items = orbitGadgets(p).slice(0, ORBIT_MAX)
    items.forEach((item, i) =>
      out.orbit.push(point(p, { id: p.id, g: item.id, w: item.width, k: orbitKey(items.length, i), sort: sort + i / 100, pro }))
    )
  }
  return out
}

// ── Estilo ───────────────────────────────────────────────────────────────

/** Tamaño por zoom; el pin que vende online va un poco más grande, siempre. */
function scaled(stops: Array<[number, number]>): ExpressionSpecification {
  const k: ExpressionSpecification = ['case', ['==', ['get', 'pro'], 1], SELLING_SCALE, 1]
  const expr: unknown[] = ['interpolate', ['linear'], ['zoom']]
  for (const [z, v] of stops) expr.push(z, ['*', v, k])
  return expr as ExpressionSpecification
}
const PIN_SIZE = scaled([[12, 0.5], [ZOOM_BLOCKS, 0.72], [ZOOM_STREET, 0.92], [17.5, 1]])
const SELECTED_SIZE = scaled([[12, 0.62], [ZOOM_STREET, 1.12], [17.5, 1.2]])

function orbitOffsetExpr(): ExpressionSpecification {
  const expr: unknown[] = ['match', ['get', 'k']]
  for (let n = 1; n <= ORBIT_MAX; n++) {
    orbitOffsets(n).forEach((off, i) => expr.push(orbitKey(n, i), ['literal', off]))
  }
  expr.push(['literal', [0, PIN_HEAD_Y]])
  return expr as ExpressionSpecification
}

const gadgetImage = (theme: CityTheme): ExpressionSpecification =>
  ['concat', 'g|', ['get', 'g'], '|', theme, '|', ['to-string', ['get', 'w']]]

export const CITY_SOURCES = ['city-active', 'city-select', 'city-dim', 'city-halos', 'city-primary', 'city-orbit', 'city-tags'] as const

/**
 * El elegido se marca con estado por lugar (feature-state), no con filtros ni
 * datos: cambiar un estado no reconstruye teselas, así que es instantáneo y no
 * se pierde si coincide con un movimiento de cámara.
 */
const SELECTED: ExpressionSpecification = ['boolean', ['feature-state', 'selected'], false]
/**
 * Fuentes que llevan el estado «elegido» (id del lugar promovido a id del
 * rasgo). `city-select` es la gemela sin agrupar de `city-active`: en una
 * fuente con clustering el motor asigna sus propios ids y el estado caería en
 * otro pin.
 */
const SELECTABLE_SOURCES = ['city-select', 'city-primary', 'city-orbit'] as const
/** Capas que responden al toque (en orden de prioridad). */
export const CITY_HIT_LAYERS = ['city-pins', 'city-primary', 'city-orbit', 'city-tags-2', 'city-tags-3']

export function addCityLayers(map: MapLibreMap, _theme: CityTheme, data: CitySources, layer: CityLayer | null) {
  // Gadgets, carteles y grupos usan el mismo dibujo de día y de noche (pastillas
  // claras, legibles sobre los dos mapas). Así cambiar de tema no toca ninguna
  // propiedad de diseño de estas capas (que obligaría a rehacer las teselas).
  const theme: CityTheme = SPRITE_THEME
  map.addSource('city-active', {
    type: 'geojson',
    data: collection(data.active),
    cluster: true,
    clusterMaxZoom: 13,
    clusterRadius: 44,
    clusterProperties: { awakeN: ['+', ['get', 'awake']] },
  })
  map.addSource('city-select', { type: 'geojson', data: collection(data.active), promoteId: 'id' })
  map.addSource('city-dim', { type: 'geojson', data: collection(data.dim) })
  map.addSource('city-halos', { type: 'geojson', data: collection(data.halos) })
  map.addSource('city-primary', { type: 'geojson', data: collection(data.primary), promoteId: 'id' })
  map.addSource('city-orbit', { type: 'geojson', data: collection(data.orbit), promoteId: 'id' })
  map.addSource('city-tags', { type: 'geojson', data: collection(data.tags) })

  // Brillo en la base de los despiertos: el único movimiento ambiental.
  map.addLayer({
    id: 'city-halo',
    type: 'circle',
    source: 'city-halos',
    minzoom: 12.5,
    paint: {
      'circle-color': '#FF8C42',
      'circle-opacity': 0.18,
      'circle-radius': ['case', ['==', ['get', 'pro'], 1], 16, 12],
      'circle-blur': 0.6,
      'circle-pitch-alignment': 'map',
    },
  })
  map.addLayer({
    id: 'city-sel-ground',
    type: 'circle',
    source: 'city-select',
    paint: {
      'circle-color': '#F74211',
      'circle-opacity': ['case', SELECTED, 0.16, 0],
      'circle-radius': 26,
      'circle-stroke-color': '#F74211',
      'circle-stroke-opacity': ['case', SELECTED, 0.5, 0],
      'circle-stroke-width': 1.5,
      'circle-pitch-alignment': 'map',
    },
  })
  map.addLayer({
    id: 'city-dim-pins',
    type: 'symbol',
    source: 'city-dim',
    minzoom: ZOOM_BLOCKS,
    layout: { 'icon-image': ['get', 'pin'], 'icon-anchor': 'bottom', 'icon-size': PIN_SIZE, 'icon-allow-overlap': true },
    paint: { 'icon-opacity': 0.28 },
  })
  map.addLayer({
    id: 'city-clusters',
    type: 'symbol',
    source: 'city-active',
    filter: ['has', 'point_count'],
    layout: {
      'icon-image': ['concat', 'c|', ['to-string', ['get', 'point_count']], '|', ['case', ['>', ['get', 'awakeN'], 0], '1', '0'], '|', theme],
      'icon-allow-overlap': true,
    },
  })
  map.addLayer({
    id: 'city-pins',
    type: 'symbol',
    source: 'city-active',
    filter: ['!', ['has', 'point_count']],
    layout: {
      'icon-image': ['get', 'pin'],
      'icon-anchor': 'bottom',
      'icon-size': PIN_SIZE,
      'icon-allow-overlap': true,
      'symbol-sort-key': ['get', 'sort'],
      'symbol-z-order': 'source',
    },
  })
  // Cartel bajo el pin: promo y urgentes desde Cuadras, el tiempo desde Tu cuadra.
  const tagLayout = {
    'icon-image': ['concat', 'tag|', ['get', 'text'], '|', ['get', 'tone'], '|', theme] as ExpressionSpecification,
    'icon-anchor': 'top' as const,
    'icon-offset': [0, 3] as [number, number],
    'icon-size': PIN_SIZE,
    'symbol-sort-key': ['get', 'sort'] as ExpressionSpecification,
  }
  map.addLayer({ id: 'city-tags-2', type: 'symbol', source: 'city-tags', minzoom: ZOOM_BLOCKS, filter: ['==', ['get', 'tier'], 2], layout: tagLayout })
  map.addLayer({ id: 'city-tags-3', type: 'symbol', source: 'city-tags', minzoom: ZOOM_STREET, filter: ['==', ['get', 'tier'], 3], layout: tagLayout })
  // Nivel 2: un gadget. Nivel 3: la órbita. Si chocan, el motor esconde uno.
  map.addLayer({
    id: 'city-primary',
    type: 'symbol',
    source: 'city-primary',
    minzoom: ZOOM_BLOCKS,
    maxzoom: layer ? 24 : ZOOM_STREET,
    layout: {
      'icon-image': gadgetImage(theme),
      'icon-offset': [19, PIN_HEAD_Y - 14],
      'icon-size': PIN_SIZE,
      'symbol-sort-key': ['get', 'sort'],
    },
    paint: { 'icon-opacity': ['case', SELECTED, 0, 1] },
  })
  map.addLayer({
    id: 'city-orbit',
    type: 'symbol',
    source: 'city-orbit',
    minzoom: layer ? 24 : ZOOM_STREET,
    layout: {
      'icon-image': gadgetImage(theme),
      'icon-offset': orbitOffsetExpr(),
      'icon-size': PIN_SIZE,
      'symbol-sort-key': ['get', 'sort'],
    },
    paint: { 'icon-opacity': ['case', SELECTED, 0, 1] },
  })
  // El pin elegido: más grande y con su órbita completa, a cualquier zoom.
  map.addLayer({
    id: 'city-sel-pin',
    type: 'symbol',
    source: 'city-select',
    layout: {
      'icon-image': ['get', 'pin'],
      'icon-anchor': 'bottom',
      'icon-size': SELECTED_SIZE,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: { 'icon-opacity': ['case', SELECTED, 1, 0] },
  })
  map.addLayer({
    id: 'city-sel-orbit',
    type: 'symbol',
    source: 'city-orbit',
    layout: {
      'icon-image': gadgetImage(theme),
      'icon-offset': orbitOffsetExpr(),
      'icon-size': SELECTED_SIZE,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: { 'icon-opacity': ['case', SELECTED, 1, 0], 'icon-translate': [0, 0] },
  })
}

/**
 * Genera por adelantado todos los dibujos que estas fuentes van a pedir.
 * No depende del resolver de imágenes a pedido (en el build de producción no
 * se disparaba y los pines no aparecían); el resolver queda como respaldo.
 */
export function ensureSprites(map: MapLibreMap, data: CitySources, generate: (id: string) => { width: number; height: number; data: Uint8ClampedArray } | null, ratio: number) {
  const ids = new Set<string>()
  for (const f of [...data.active, ...data.dim]) ids.add(String(f.properties.pin))
  for (const f of [...data.primary, ...data.orbit]) ids.add(`g|${f.properties.g}|${SPRITE_THEME}|${f.properties.w}`)
  for (const f of data.tags) ids.add(`tag|${f.properties.text}|${f.properties.tone}|${SPRITE_THEME}`)
  for (let n = 2; n <= Math.max(2, data.active.length); n++) {
    ids.add(`c|${n}|0|${SPRITE_THEME}`)
    ids.add(`c|${n}|1|${SPRITE_THEME}`)
  }
  for (const id of ids) {
    if (map.hasImage(id)) continue
    const sprite = generate(id)
    if (sprite) map.addImage(id, sprite, { pixelRatio: ratio })
  }
}

export function updateCitySources(map: MapLibreMap, data: CitySources, layer: CityLayer | null) {
  const set = (id: string, features: Feature[]) => (map.getSource(id) as GeoJSONSource | undefined)?.setData(collection(features))
  set('city-active', data.active)
  set('city-select', data.active)
  set('city-dim', data.dim)
  set('city-halos', data.halos)
  set('city-primary', data.primary)
  set('city-orbit', data.orbit)
  set('city-tags', data.tags)
  // Con una capa encendida: el gadget de la capa en todos los niveles, sin órbita.
  if (map.getLayer('city-primary')) map.setLayerZoomRange('city-primary', ZOOM_BLOCKS, layer ? 24 : ZOOM_STREET)
  if (map.getLayer('city-orbit')) map.setLayerZoomRange('city-orbit', layer ? 24 : ZOOM_STREET, 24)
}

const selectedByMap = new WeakMap<MapLibreMap, string>()

/**
 * Marca el pin elegido: más grande, con su suelo y su órbita completa que
 * «sale» del pin (sube unos píxeles). Su gadget y órbita normales se ocultan.
 */
export function showSelected(map: MapLibreMap, place: RestaurantCardData | null, animate: boolean) {
  if (!map.getLayer('city-sel-orbit')) return
  const previous = selectedByMap.get(map)
  if (previous) {
    for (const source of SELECTABLE_SOURCES) {
      if (map.getSource(source)) map.removeFeatureState({ source, id: previous }, 'selected')
    }
    selectedByMap.delete(map)
  }
  if (!place) return
  for (const source of SELECTABLE_SOURCES) {
    if (map.getSource(source)) map.setFeatureState({ source, id: place.id }, { selected: true })
  }
  selectedByMap.set(map, place.id)

  if (!animate) return
  map.setPaintProperty('city-sel-orbit', 'icon-translate-transition', { duration: 0 })
  map.setPaintProperty('city-sel-orbit', 'icon-translate', [0, 10])
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      map.setPaintProperty('city-sel-orbit', 'icon-translate-transition', { duration: 320 })
      map.setPaintProperty('city-sel-orbit', 'icon-translate', [0, 0])
    })
  )
}
