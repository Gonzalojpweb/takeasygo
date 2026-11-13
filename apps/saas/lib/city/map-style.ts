// ── Estilo del mapa de TGO (Living City) ────────────────────────────────────
//
// Estilo vectorial propio sobre el esquema OpenMapTiles (teselas de
// OpenFreeMap, sin clave). El mapa es el escenario, no el protagonista:
// colores apagados y cálidos para que lo único saturado sean los pines.
//
// Dos paletas —día y noche— con la MISMA estructura de capas, y el anillo de
// «tu ciudad de 15 minutos» dibujado como parte del estilo, así sobrevive al
// cambio de tema sin volver a agregarse.

import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl'
import { CITY_15_RADIUS_M } from './signals'

export type CityTheme = 'day' | 'night'

const TILES_URL = 'https://tiles.openfreemap.org/planet'
const GLYPHS_URL = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf'

interface Palette {
  land: string
  green: string
  park: string
  water: string
  waterLine: string
  path: string
  roadCasing: string
  roadMinor: string
  roadMajor: string
  rail: string
  building: string
  buildingTop: string
  buildingOutline: string
  labelStreet: string
  labelPlace: string
  labelHalo: string
  ring: string
  ringFill: string
  ringLabel: string
}

const PALETTES: Record<CityTheme, Palette> = {
  day: {
    land: '#F3F0EA',
    green: '#E2EBD6',
    park: '#D2E7C4',
    water: '#BCDDEA',
    waterLine: '#A9D2E2',
    path: '#DDD6CB',
    roadCasing: '#E4DED4',
    roadMinor: '#FFFFFF',
    roadMajor: '#FFFFFF',
    rail: '#D3CDC3',
    building: '#E9E4DB',
    buildingTop: '#EFEBE3',
    buildingOutline: '#DDD7CC',
    labelStreet: '#8B8798',
    labelPlace: '#4E5067',
    labelHalo: '#F3F0EA',
    ring: '#2D2A4B',
    ringFill: 'rgba(247, 66, 17, 0.045)',
    ringLabel: '#4E5067',
  },
  night: {
    land: '#14161F',
    green: '#17211F',
    park: '#182823',
    water: '#0D1E2C',
    waterLine: '#12293B',
    path: '#262A38',
    roadCasing: '#10121A',
    roadMinor: '#252938',
    roadMajor: '#30364A',
    rail: '#222633',
    building: '#1B1E2A',
    buildingTop: '#232737',
    buildingOutline: '#2A2F42',
    labelStreet: '#7C8299',
    labelPlace: '#B7BDD3',
    labelHalo: '#14161F',
    ring: '#FFB347',
    ringFill: 'rgba(255, 140, 66, 0.06)',
    ringLabel: '#C9CEE0',
  },
}

/** Color de fondo del contenedor mientras cargan las teselas. */
export function cityMapBackground(theme: CityTheme): string {
  return PALETTES[theme].land
}

/** Polígono circular (GeoJSON) de `radiusM` metros alrededor de un punto. */
export function circlePolygon(
  center: { lat: number; lng: number },
  radiusM: number,
  steps = 96
): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: [number, number][] = []
  const latRad = (center.lat * Math.PI) / 180
  const dLat = radiusM / 111_320
  const dLng = radiusM / (111_320 * Math.cos(latRad))
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI
    coords.push([center.lng + dLng * Math.cos(angle), center.lat + dLat * Math.sin(angle)])
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } }
}

const NOT_TUNNEL: ExpressionSpecification = ['!=', ['get', 'brunnel'], 'tunnel']

function roadWidth(base: number): unknown {
  // Ancho que crece con el zoom: fino de lejos, calle real de cerca.
  return ['interpolate', ['exponential', 1.6], ['zoom'], 10, base * 0.35, 14, base, 17, base * 4.5, 19, base * 10]
}

export function buildCityStyle(
  theme: CityTheme,
  center: { lat: number; lng: number }
): StyleSpecification {
  const c = PALETTES[theme]

  const layers: LayerSpecification[] = [
    { id: 'land', type: 'background', paint: { 'background-color': c.land } },
    {
      id: 'green',
      type: 'fill',
      source: 'city',
      'source-layer': 'landcover',
      filter: ['in', ['get', 'class'], ['literal', ['grass', 'wood', 'farmland']]],
      paint: { 'fill-color': c.green, 'fill-opacity': 0.8 },
    },
    {
      id: 'landuse-green',
      type: 'fill',
      source: 'city',
      'source-layer': 'landuse',
      filter: ['in', ['get', 'class'], ['literal', ['pitch', 'playground', 'cemetery', 'stadium', 'track']]],
      paint: { 'fill-color': c.green },
    },
    { id: 'park', type: 'fill', source: 'city', 'source-layer': 'park', paint: { 'fill-color': c.park } },
    { id: 'water', type: 'fill', source: 'city', 'source-layer': 'water', paint: { 'fill-color': c.water } },
    {
      id: 'waterway',
      type: 'line',
      source: 'city',
      'source-layer': 'waterway',
      paint: { 'line-color': c.waterLine, 'line-width': 1.2 },
    },

    // ── Calles ────────────────────────────────────────────────────────────
    {
      id: 'path',
      type: 'line',
      source: 'city',
      'source-layer': 'transportation',
      minzoom: 15,
      filter: ['all', ['in', ['get', 'class'], ['literal', ['path', 'track']]], NOT_TUNNEL],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': c.path, 'line-width': 1.4, 'line-dasharray': [1.5, 1.5] },
    },
    {
      id: 'rail',
      type: 'line',
      source: 'city',
      'source-layer': 'transportation',
      minzoom: 12,
      filter: ['all', ['==', ['get', 'class'], 'rail'], NOT_TUNNEL],
      paint: { 'line-color': c.rail, 'line-width': 1.2 },
    },
    {
      id: 'road-minor-casing',
      type: 'line',
      source: 'city',
      'source-layer': 'transportation',
      minzoom: 13,
      filter: ['all', ['in', ['get', 'class'], ['literal', ['minor', 'service', 'tertiary']]], NOT_TUNNEL],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': c.roadCasing, 'line-width': roadWidth(2.6) as number },
    },
    {
      id: 'road-major-casing',
      type: 'line',
      source: 'city',
      'source-layer': 'transportation',
      filter: [
        'all',
        ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary']]],
        NOT_TUNNEL,
      ],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': c.roadCasing, 'line-width': roadWidth(4.4) as number },
    },
    {
      id: 'road-minor',
      type: 'line',
      source: 'city',
      'source-layer': 'transportation',
      minzoom: 12,
      filter: ['all', ['in', ['get', 'class'], ['literal', ['minor', 'service', 'tertiary']]], NOT_TUNNEL],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': c.roadMinor, 'line-width': roadWidth(1.8) as number },
    },
    {
      id: 'road-major',
      type: 'line',
      source: 'city',
      'source-layer': 'transportation',
      filter: [
        'all',
        ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary']]],
        NOT_TUNNEL,
      ],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': c.roadMajor, 'line-width': roadWidth(3.4) as number },
    },

    // ── Tu ciudad de 15 minutos ───────────────────────────────────────────
    { id: 'walk15-fill', type: 'fill', source: 'walk15', paint: { 'fill-color': c.ringFill } },
    {
      id: 'walk15-line',
      type: 'line',
      source: 'walk15',
      layout: { 'line-cap': 'round' },
      paint: {
        'line-color': c.ring,
        'line-opacity': theme === 'night' ? 0.55 : 0.32,
        'line-width': 1.6,
        'line-dasharray': [0.2, 3],
      },
    },

    // ── Edificios ─────────────────────────────────────────────────────────
    {
      id: 'building-flat',
      type: 'fill',
      source: 'city',
      'source-layer': 'building',
      minzoom: 13,
      maxzoom: 15,
      paint: { 'fill-color': c.building, 'fill-outline-color': c.buildingOutline },
    },
    {
      id: 'building-3d',
      type: 'fill-extrusion',
      source: 'city',
      'source-layer': 'building',
      minzoom: 15,
      paint: {
        'fill-extrusion-color': c.buildingTop,
        // Altura contenida: la ciudad tiene volumen, pero no tapa los pines.
        'fill-extrusion-height': [
          'interpolate', ['linear'], ['zoom'],
          15, 0,
          16, ['*', 0.55, ['coalesce', ['get', 'render_height'], 6]],
        ],
        'fill-extrusion-base': ['*', 0.55, ['coalesce', ['get', 'render_min_height'], 0]],
        'fill-extrusion-opacity': theme === 'night' ? 0.85 : 0.9,
        'fill-extrusion-vertical-gradient': true,
      },
    },

    // ── Texto ─────────────────────────────────────────────────────────────
    {
      id: 'walk15-label',
      type: 'symbol',
      source: 'walk15',
      minzoom: 13,
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 520,
        'text-field': '15 MIN A PIE',
        'text-font': ['Noto Sans Bold'],
        'text-size': 10,
        'text-letter-spacing': 0.18,
        'text-keep-upright': true,
      },
      paint: {
        'text-color': c.ringLabel,
        'text-halo-color': c.labelHalo,
        'text-halo-width': 2,
        'text-opacity': 0.85,
      },
    },
    {
      id: 'street-label',
      type: 'symbol',
      source: 'city',
      'source-layer': 'transportation_name',
      minzoom: 14.5,
      layout: {
        'symbol-placement': 'line',
        'text-field': ['coalesce', ['get', 'name:es'], ['get', 'name']],
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 14.5, 10, 18, 13],
        'text-letter-spacing': 0.02,
      },
      paint: { 'text-color': c.labelStreet, 'text-halo-color': c.labelHalo, 'text-halo-width': 1.6 },
    },
    {
      id: 'neighbourhood-label',
      type: 'symbol',
      source: 'city',
      'source-layer': 'place',
      minzoom: 12,
      maxzoom: 16.5,
      filter: ['in', ['get', 'class'], ['literal', ['suburb', 'neighbourhood', 'quarter']]],
      layout: {
        'text-field': ['coalesce', ['get', 'name:es'], ['get', 'name']],
        'text-font': ['Noto Sans Bold'],
        'text-size': 11,
        'text-transform': 'uppercase',
        'text-letter-spacing': 0.14,
        'text-max-width': 8,
      },
      paint: {
        'text-color': c.labelPlace,
        'text-opacity': 0.7,
        'text-halo-color': c.labelHalo,
        'text-halo-width': 1.8,
      },
    },
    {
      id: 'city-label',
      type: 'symbol',
      source: 'city',
      'source-layer': 'place',
      maxzoom: 12,
      filter: ['in', ['get', 'class'], ['literal', ['city', 'town']]],
      layout: {
        'text-field': ['coalesce', ['get', 'name:es'], ['get', 'name']],
        'text-font': ['Noto Sans Bold'],
        'text-size': 14,
      },
      paint: { 'text-color': c.labelPlace, 'text-halo-color': c.labelHalo, 'text-halo-width': 2 },
    },
  ]

  return {
    version: 8,
    name: `TGO ${theme}`,
    glyphs: GLYPHS_URL,
    sources: {
      city: {
        type: 'vector',
        url: TILES_URL,
        attribution:
          '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> · © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
      },
      walk15: { type: 'geojson', data: circlePolygon(center, CITY_15_RADIUS_M) },
    },
    layers,
    // Luz suave y fija para los edificios: volumen sin dramatismo.
    light: { anchor: 'viewport', color: '#ffffff', intensity: theme === 'night' ? 0.18 : 0.3 },
  }
}
