'use client'

// ── CityMap ─────────────────────────────────────────────────────────────────
//
// El mapa vivo de TGO. Vectorial (MapLibre), con inclinación, edificios con
// volumen, paleta de día y de noche, y el anillo de «15 minutos a pie».
//
// Pines y gadgets se dibujan DENTRO del motor del mapa (capas de símbolos con
// imágenes generadas a pedido, ver ./map), no como elementos HTML: así escala
// a cientos de locales y el motor resuelve los choques entre gadgets.
//
// Niveles (lib/city/gadgets.ts):
//   Barrio → pines chicos y grupos · Cuadras → un gadget · Tu cuadra → órbita.
//
// Reglas del Living City System que se mantienen:
//   · el pin es el protagonista; los gadgets son insignias chicas;
//   · el único movimiento ambiental es el brillo de los despiertos;
//   · el mapa manda el primer vistazo (`bottomInset` corre el centro).

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { Map as MapLibreMap, Marker, GeoJSONSource, MapMouseEvent } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { RestaurantCardData } from '@/types/restaurant-card'
import { CITY_15_RADIUS_M, type CityLayer } from '@/lib/city/signals'
import { ZOOM_BLOCKS, ZOOM_STREET, GADGET_SIZE } from '@/lib/city/gadgets'
import { buildCityStyle, circlePolygon, cityMapBackground, type CityTheme } from '@/lib/city/map-style'
import { SPRITE_RATIO, gadgetCanvas, generateSprite } from './map/sprites'
import {
  CITY_HIT_LAYERS,
  addCityLayers,
  buildSources,
  SPRITE_THEME,
  showSelected,
  updateCitySources,
} from './map/layers'

export interface CityMapHandle {
  recenter: () => void
  focus: (place: RestaurantCardData) => void
  /** Encuadra al usuario y a estos lugares (al encender una capa). */
  fitTo: (places: RestaurantCardData[]) => void
  /** Novedad que sale del pin (solo hechos reales, una a la vez). */
  bubble: (place: RestaurantCardData, text: string, gadget: string, width?: number) => void
}

const FIT_MAX_PLACES = 6

interface Props {
  center: { lat: number; lng: number }
  places: RestaurantCardData[]
  selectedId: string | null
  onSelect: (place: RestaurantCardData | null) => void
  theme: CityTheme
  tilted: boolean
  /** Capa encendida: los que no cumplen quedan tenues y los que sí muestran su gadget. */
  layer?: CityLayer | null
  /** Píxeles del borde inferior tapados por el sheet o la ficha. */
  bottomInset: number
  /** Píxeles del borde superior tapados por el encabezado. */
  topInset: number
  /**
   * false = «ventana a la ciudad» (Inicio): el mapa se mira, no se maneja.
   * Sin gestos; el contenedor decide qué hace el toque.
   */
  interactive?: boolean
}

const HOME_ZOOM = 15.4
const TILT = 50

const PUCK_HTML = `
  <span class="city-puck__pulse"></span>
  <span class="city-puck__dot"></span>`

/** Corre `fn` ya, o cuando termine la animación de cámara en curso. */
function afterMove(map: MapLibreMap, fn: () => void) {
  if (map.isMoving()) map.once('moveend', fn)
  else fn()
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const CityMap = forwardRef<CityMapHandle, Props>(function CityMap(
  { center, places, selectedId, onSelect, theme, tilted, layer = null, bottomInset, topInset, interactive = true },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const libRef = useRef<typeof import('maplibre-gl') | null>(null)
  const puckRef = useRef<Marker | null>(null)
  const bubbleRef = useRef<Marker | null>(null)
  const centeredRef = useRef<string | null>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  const valid = useMemo(() => places.filter(p => p.lat != null && p.lng != null), [places])
  const byId = useMemo(() => new Map(valid.map(p => [p.id, p])), [valid])
  const sources = useMemo(() => buildSources(valid, layer), [valid, layer])

  // Valores vivos para los listeners del mapa (se registran una sola vez).
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const byIdRef = useRef(byId)
  byIdRef.current = byId
  const sourcesRef = useRef(sources)
  sourcesRef.current = sources
  const layerRef = useRef(layer)
  layerRef.current = layer
  const selectedRef = useRef(selectedId)
  selectedRef.current = selectedId
  const centerRef = useRef(center)
  centerRef.current = center
  const themeRef = useRef(theme)
  const tiltedRef = useRef(tilted)
  tiltedRef.current = tilted
  const interactiveRef = useRef(interactive)
  const insetRef = useRef({ top: topInset, bottom: bottomInset })
  insetRef.current = { top: topInset, bottom: bottomInset }
  // Lo último que el mapa ya tiene aplicado: los efectos solo animan cambios
  // reales, así no pisan la animación de entrada.
  const appliedRef = useRef({ tilted, top: topInset, bottom: bottomInset, lat: center.lat, lng: center.lng })

  // Encuadre pedido antes de que el mapa terminara de cargar.
  const pendingFitRef = useRef<RestaurantCardData[] | null>(null)
  const fitRef = useRef<(places: RestaurantCardData[], duration: number) => boolean>(() => false)
  fitRef.current = (targets, duration) => {
    const map = mapRef.current
    const lib = libRef.current
    if (!map || !lib) return false
    const c = centerRef.current
    const points = targets
      .filter(p => p.lat != null && p.lng != null)
      .sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity))
      .slice(0, FIT_MAX_PLACES)
    if (points.length === 0) return false
    const bounds = new lib.LngLatBounds([c.lng, c.lat], [c.lng, c.lat])
    for (const p of points) bounds.extend([p.lng as number, p.lat as number])
    map.fitBounds(bounds, {
      // El margen del encabezado y del panel ya está en el padding del mapa
      // (fitBounds lo suma): acá va solo el aire extra.
      padding: { top: 48, bottom: 40, left: 44, right: 44 },
      maxZoom: HOME_ZOOM,
      pitch: tiltedRef.current ? TILT : 0,
      bearing: tiltedRef.current ? -14 : 0,
      duration,
    })
    return true
  }

  /** Agrega las capas de la ciudad al estilo actual (al cargar y al cambiar de tema). */
  const mountCityRef = useRef<(map: MapLibreMap) => void>(() => {})
  mountCityRef.current = map => {
    addCityLayers(map, themeRef.current, sourcesRef.current, layerRef.current)
    const selected = selectedRef.current ? byIdRef.current.get(selectedRef.current) ?? null : null
    showSelected(map, selected, false)
  }

  // ── Crear el mapa (una sola vez) ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    let map: MapLibreMap | null = null
    let raf = 0

    import('maplibre-gl')
      .then(lib => {
        if (cancelled || !containerRef.current) return
        libRef.current = lib
        // El worker del mapa se sirve desde nuestro propio dominio (el
        // empaquetador no resuelve el archivo que trae la librería). La
        // carpeta lleva la versión: ver public/vendor/maplibre/LEEME.md.
        lib.setWorkerUrl(`/vendor/maplibre/${lib.getVersion()}/maplibre-gl-worker.mjs`)
        const start = centerRef.current
        const animateIn = !prefersReducedMotion()

        map = new lib.Map({
          container: containerRef.current,
          style: buildCityStyle(themeRef.current, start),
          center: [start.lng, start.lat],
          zoom: animateIn ? HOME_ZOOM - 1.6 : HOME_ZOOM,
          pitch: animateIn ? 0 : tiltedRef.current ? TILT : 0,
          bearing: 0,
          maxPitch: 62,
          minZoom: 10,
          maxZoom: 18.5,
          attributionControl: false,
          // El mapa no se inclina con dos dedos por accidente: la inclinación
          // se cambia con el botón 3D.
          touchPitch: false,
          dragRotate: false,
          interactive: interactiveRef.current,
          fadeDuration: 180,
        })
        mapRef.current = map
        // Solo en desarrollo: acceso desde la consola para depurar el mapa.
        if (process.env.NODE_ENV !== 'production') {
          ;(window as unknown as { __tgoMap?: MapLibreMap }).__tgoMap = map
        }

        // Dibujos a pedido: el motor pide cada imagen por nombre la primera vez.
        // (MapLibre 6: tiene que ser el «resolver»; un listener del evento
        // styleimagemissing llega tarde para la tesela que la pidió.)
        map.setMissingStyleImageResolver(id => {
          if (!map || map.hasImage(id)) return
          const sprite = generateSprite(id)
          if (sprite) map.addImage(id, sprite, { pixelRatio: SPRITE_RATIO })
        })

        // Atribución abajo a la izquierda y plegada: no pelea con los controles.
        map.addControl(new lib.AttributionControl({ compact: true }), 'bottom-left')
        const collapseAttribution = () =>
          containerRef.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show')
        collapseAttribution()

        const puckEl = document.createElement('div')
        puckEl.className = 'city-puck'
        puckEl.innerHTML = PUCK_HTML
        puckRef.current = new lib.Marker({ element: puckEl, anchor: 'center' }).setLngLat([start.lng, start.lat]).addTo(map)

        if (interactiveRef.current) {
          const hitLayers = () => CITY_HIT_LAYERS.filter(id => map?.getLayer(id))
          map.on('click', (event: MapMouseEvent) => {
            if (!map) return
            const cluster = map.queryRenderedFeatures(event.point, { layers: map.getLayer('city-clusters') ? ['city-clusters'] : [] })[0]
            if (cluster) {
              const source = map.getSource('city-active') as GeoJSONSource
              const coords = (cluster.geometry as GeoJSON.Point).coordinates as [number, number]
              source
                .getClusterExpansionZoom(cluster.properties?.cluster_id)
                .then(zoom => map?.easeTo({ center: coords, zoom: Math.min(zoom + 0.6, 18), duration: 600 }))
                .catch(() => {})
              return
            }
            const hit = map.queryRenderedFeatures(event.point, { layers: hitLayers() })[0]
            const place = hit?.properties?.id ? byIdRef.current.get(String(hit.properties.id)) : undefined
            onSelectRef.current(place ?? null)
          })
          map.on('mousemove', event => {
            if (!map) return
            const over = map.queryRenderedFeatures(event.point, { layers: [...hitLayers(), ...(map.getLayer('city-clusters') ? ['city-clusters'] : [])] })
            map.getCanvas().style.cursor = over.length ? 'pointer' : ''
          })
        }

        map.on('load', () => {
          if (cancelled || !map) return
          collapseAttribution()
          mountCityRef.current(map)
          const inset = insetRef.current
          const padding = { top: inset.top, bottom: inset.bottom, left: 0, right: 0 }
          const c = centerRef.current
          appliedRef.current = { tilted: tiltedRef.current, top: inset.top, bottom: inset.bottom, lat: c.lat, lng: c.lng }
          map.setPadding(padding)
          setReady(true)
          const pendingFit = pendingFitRef.current
          pendingFitRef.current = null
          if (pendingFit && fitRef.current(pendingFit, animateIn ? 1600 : 0)) {
            // Se abrió con una capa: el encuadre reemplaza la entrada.
          } else if (animateIn) {
            // «Entrar a la ciudad»: un único gesto al abrir, después el mapa
            // se queda quieto.
            map.easeTo({
              center: [c.lng, c.lat],
              zoom: HOME_ZOOM,
              pitch: tiltedRef.current ? TILT : 0,
              bearing: tiltedRef.current ? -14 : 0,
              padding,
              duration: 1800,
              easing: t => 1 - Math.pow(1 - t, 3),
            })
          }
          // Brillo de los despiertos: respira lento en la base del pin.
          if (animateIn) {
            const pulse = (t: number) => {
              if (!map || cancelled) return
              if (map.getLayer('city-halo')) {
                const k = (t % 2600) / 2600
                map.setPaintProperty('city-halo', 'circle-radius', ['case', ['==', ['get', 'pro'], 1], 12 + 18 * k, 10 + 14 * k])
                map.setPaintProperty('city-halo', 'circle-opacity', 0.26 * (1 - k))
              }
              raf = requestAnimationFrame(pulse)
            }
            raf = requestAnimationFrame(pulse)
          }
        })
        map.on('error', event => {
          const message = String(event?.error?.message ?? event?.error ?? '')
          // Sin WebGL el constructor no llega a `load`; el resto son teselas
          // sueltas que fallan y no rompen la experiencia, pero se registran.
          if (!mapRef.current?.loaded() && message.includes('WebGL')) setFailed(true)
          console.warn('[TGO mapa]', message)
        })

        // El contenedor puede cambiar de tamaño (o nacer en 0 mientras carga
        // el CSS): el mapa se reacomoda solo.
        const container = containerRef.current
        if (typeof ResizeObserver !== 'undefined' && container) {
          const observer = new ResizeObserver(() => map?.resize())
          observer.observe(container)
          map.once('remove', () => observer.disconnect())
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      bubbleRef.current?.remove()
      bubbleRef.current = null
      puckRef.current?.remove()
      puckRef.current = null
      try {
        map?.remove()
      } catch {}
      mapRef.current = null
    }
  }, [])

  // ── Lugares o capa cambiaron ─────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !map.getSource('city-active')) return
    updateCitySources(map, sources, layer)
  }, [sources, layer, ready])

  // ── Pin seleccionado ─────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const place = selectedId ? byId.get(selectedId) ?? null : null
    showSelected(map, place, !prefersReducedMotion())
    if (!place) {
      centeredRef.current = null
      return
    }
    bubbleRef.current?.remove()
    // Centrar el pin elegido una sola vez por selección (no en cada refresco
    // de datos), ya con el espacio que tapa la ficha (bottomInset).
    if (centeredRef.current === place.id || !interactiveRef.current) return
    centeredRef.current = place.id
    const inset = insetRef.current
    appliedRef.current.top = inset.top
    appliedRef.current.bottom = inset.bottom
    map.easeTo({
      center: [place.lng as number, place.lat as number],
      zoom: Math.max(map.getZoom(), 16.2),
      padding: { top: inset.top, bottom: inset.bottom, left: 0, right: 0 },
      duration: prefersReducedMotion() ? 0 : 700,
    })
  }, [selectedId, byId, ready])

  // ── Tema día / noche ─────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || themeRef.current === theme) return
    themeRef.current = theme
    // Día y noche comparten las mismas capas y solo cambian colores: se
    // repintan en el lugar. Un setStyle completo recargaba todas las teselas
    // (y en MapLibre 6 a veces quedaban pendientes, con el mapa vacío).
    const next = buildCityStyle(theme, centerRef.current)
    for (const layer of next.layers) {
      if (!map.getLayer(layer.id) || !('paint' in layer) || !layer.paint) continue
      for (const [key, value] of Object.entries(layer.paint)) {
        map.setPaintProperty(layer.id, key as never, value as never)
      }
    }
    if (next.light) map.setLight(next.light)
  }, [theme, ready])

  // ── Inclinación 3D / plano ───────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || appliedRef.current.tilted === tilted) return
    appliedRef.current.tilted = tilted
    map.easeTo({ pitch: tilted ? TILT : 0, bearing: tilted ? -14 : 0, duration: 700 })
  }, [tilted, ready])

  // ── Espacio que tapan el encabezado y el sheet ───────────────────────────
  useEffect(() => {
    const map = mapRef.current
    const applied = appliedRef.current
    if (!map || !ready || (applied.top === topInset && applied.bottom === bottomInset)) return
    applied.top = topInset
    applied.bottom = bottomInset
    // Si hay una animación en curso (entrada, encuadre de capa), no se la
    // corta: el ajuste espera a que termine y usa el valor más reciente.
    afterMove(map, () => {
      const inset = insetRef.current
      map.easeTo({ padding: { top: inset.top, bottom: inset.bottom, left: 0, right: 0 }, duration: 350 })
    })
  }, [bottomInset, topInset, ready])

  // ── El usuario se movió (llegó el GPS real) ──────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    const applied = appliedRef.current
    if (!map || !ready || (applied.lat === center.lat && applied.lng === center.lng)) return
    applied.lat = center.lat
    applied.lng = center.lng
    puckRef.current?.setLngLat([center.lng, center.lat])
    const source = map.getSource('walk15') as GeoJSONSource | undefined
    source?.setData(circlePolygon(center, CITY_15_RADIUS_M))
    afterMove(map, () => {
      const c = centerRef.current
      map.easeTo({ center: [c.lng, c.lat], duration: 900 })
    })
  }, [center.lat, center.lng, ready]) // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(
    ref,
    () => ({
      recenter: () => {
        const c = centerRef.current
        mapRef.current?.easeTo({
          center: [c.lng, c.lat],
          zoom: HOME_ZOOM,
          pitch: tiltedRef.current ? TILT : 0,
          bearing: tiltedRef.current ? -14 : 0,
          duration: 800,
        })
      },
      fitTo: targets => {
        if (!mapRef.current?.loaded()) {
          pendingFitRef.current = targets
          return
        }
        fitRef.current(targets, 800)
      },
      focus: place => {
        const map = mapRef.current
        if (!map || place.lat == null || place.lng == null) return
        // Un cuadro después: para entonces la ficha ya avisó cuánto tapa
        // (bottomInset) y el pin queda centrado en el espacio libre, no detrás.
        requestAnimationFrame(() => {
          const inset = insetRef.current
          appliedRef.current.top = inset.top
          appliedRef.current.bottom = inset.bottom
          map.easeTo({
            center: [place.lng as number, place.lat as number],
            zoom: Math.max(map.getZoom(), 16.2),
            padding: { top: inset.top, bottom: inset.bottom, left: 0, right: 0 },
            duration: 700,
          })
        })
      },
      bubble: (place, text, gadget, width = GADGET_SIZE) => {
        const map = mapRef.current
        const lib = libRef.current
        if (!map || !lib || place.lat == null || place.lng == null || selectedRef.current) return
        if (!map.getBounds().contains([place.lng, place.lat])) return
        bubbleRef.current?.remove()
        const el = document.createElement('div')
        el.className = 'city-bubble'
        el.setAttribute('aria-hidden', 'true')
        const inner = document.createElement('div')
        inner.className = 'city-bubble__in'
        const icon = gadgetCanvas(gadget, SPRITE_THEME, width)
        icon.style.width = `${(width + 4) * 0.8}px`
        icon.style.height = `${(GADGET_SIZE + 4) * 0.8}px`
        const label = document.createElement('span')
        label.textContent = text
        inner.append(icon, label)
        const tail = document.createElement('div')
        tail.className = 'city-bubble__tail'
        el.append(inner, tail)
        const zoom = map.getZoom()
        const scale = zoom < ZOOM_BLOCKS ? 0.72 : zoom < ZOOM_STREET ? 0.85 : 1
        const marker = new lib.Marker({ element: el, anchor: 'bottom', offset: [0, -60 * scale] })
          .setLngLat([place.lng, place.lat])
          .addTo(map)
        bubbleRef.current = marker
        window.setTimeout(() => {
          if (bubbleRef.current === marker) {
            marker.remove()
            bubbleRef.current = null
          }
        }, 4300)
      },
    }),
    []
  )

  return (
    <div className="city-map" style={{ backgroundColor: cityMapBackground(theme) }}>
      <div ref={containerRef} className="city-map__canvas" />
      {failed && (
        <div className="city-map__fallback" role="status">
          No pudimos dibujar el mapa en este dispositivo. La lista de lugares sigue disponible abajo.
        </div>
      )}
    </div>
  )
})

export default CityMap
