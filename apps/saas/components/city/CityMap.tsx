'use client'

// ── CityMap ─────────────────────────────────────────────────────────────────
//
// El mapa vivo de TGO. Vectorial (MapLibre), con inclinación, edificios con
// volumen, paleta de día y de noche, y el anillo de «15 minutos a pie».
//
// Reglas del Living City System que este componente cuida:
//   · el único movimiento ambiental es la respiración del pin despierto;
//   · el mapa manda el primer vistazo: `bottomInset` corre el centro para
//     que el sheet nunca tape al usuario;
//   · las estrellas no viven acá.

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { Map as MapLibreMap, Marker, GeoJSONSource } from 'maplibre-gl'
import Supercluster from 'supercluster'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { RestaurantCardData } from '@/types/restaurant-card'
import { isAwake } from '@/lib/city/signals'
import { buildCityStyle, circlePolygon, cityMapBackground, type CityTheme } from '@/lib/city/map-style'
import { CITY_15_RADIUS_M } from '@/lib/city/signals'
import { CITY_PIN_DEFS, USER_PUCK_HTML, clusterHtml, pinHtml, pinKey, pinModel } from './pin'

export interface CityMapHandle {
  recenter: () => void
  focus: (place: RestaurantCardData) => void
}

interface Props {
  center: { lat: number; lng: number }
  places: RestaurantCardData[]
  selectedId: string | null
  onSelect: (place: RestaurantCardData | null) => void
  theme: CityTheme
  tilted: boolean
  /** Píxeles del borde inferior tapados por el sheet o la ficha. */
  bottomInset: number
  /** Píxeles del borde superior tapados por el encabezado. */
  topInset: number
}

const HOME_ZOOM = 15.4
const TAG_MIN_ZOOM = 14.2
const TILT = 50

type ClusterProps = { awake: number }
type PointProps = { placeId: string; awake: number }

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const CityMap = forwardRef<CityMapHandle, Props>(function CityMap(
  { center, places, selectedId, onSelect, theme, tilted, bottomInset, topInset },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const libRef = useRef<typeof import('maplibre-gl') | null>(null)
  const markersRef = useRef(new Map<string, { marker: Marker; placeId: string | null }>())
  const puckRef = useRef<Marker | null>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  // Valores vivos para los listeners del mapa (se registran una sola vez).
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const selectedRef = useRef(selectedId)
  selectedRef.current = selectedId
  const centerRef = useRef(center)
  centerRef.current = center
  const themeRef = useRef(theme)
  const tiltedRef = useRef(tilted)
  tiltedRef.current = tilted
  const insetRef = useRef({ top: topInset, bottom: bottomInset })
  insetRef.current = { top: topInset, bottom: bottomInset }
  // Lo último que el mapa ya tiene aplicado: los efectos solo animan cambios
  // reales, así no pisan la animación de entrada.
  const appliedRef = useRef({
    tilted,
    top: topInset,
    bottom: bottomInset,
    lat: center.lat,
    lng: center.lng,
  })

  const valid = useMemo(() => places.filter(p => p.lat != null && p.lng != null), [places])
  const byId = useMemo(() => new Map(valid.map(p => [p.id, p])), [valid])

  const index = useMemo(() => {
    const sc = new Supercluster<PointProps, ClusterProps>({
      radius: 46,
      maxZoom: 16,
      map: props => ({ awake: props.awake }),
      reduce: (acc, props) => {
        acc.awake += props.awake
      },
    })
    sc.load(
      valid.map(p => ({
        type: 'Feature' as const,
        properties: { placeId: p.id, awake: isAwake(p) ? 1 : 0 },
        geometry: { type: 'Point' as const, coordinates: [p.lng as number, p.lat as number] },
      }))
    )
    return sc
  }, [valid])

  const renderRef = useRef<() => void>(() => {})
  renderRef.current = () => {
    const map = mapRef.current
    const lib = libRef.current
    if (!map || !lib) return

    const zoom = map.getZoom()
    const withTags = zoom >= TAG_MIN_ZOOM
    const b = map.getBounds()
    const features = index.getClusters(
      [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
      Math.floor(zoom)
    )

    const wanted = new Set<string>()
    for (const f of features) {
      const [lng, lat] = f.geometry.coordinates
      const props = f.properties as Partial<Supercluster.ClusterProperties & ClusterProps & PointProps>

      if (props.cluster) {
        const count = props.point_count ?? 0
        const awake = props.awake ?? 0
        const key = `cluster·${f.id}·${count}·${awake > 0}`
        wanted.add(key)
        if (markersRef.current.has(key)) continue
        const el = document.createElement('button')
        el.type = 'button'
        el.className = 'city-cluster'
        el.setAttribute('aria-label', `${count} lugares en esta zona. Acercar`)
        el.innerHTML = clusterHtml(count, awake)
        const clusterId = props.cluster_id as number
        el.addEventListener('click', event => {
          event.stopPropagation()
          const nextZoom = Math.min(index.getClusterExpansionZoom(clusterId) + 0.4, 18)
          map.easeTo({ center: [lng, lat], zoom: nextZoom, duration: 600 })
        })
        const marker = new lib.Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(map)
        markersRef.current.set(key, { marker, placeId: null })
        continue
      }

      const place = props.placeId ? byId.get(props.placeId) : undefined
      if (!place) continue
      const model = pinModel(place)
      const key = pinKey(place, model, withTags)
      wanted.add(key)
      if (markersRef.current.has(key)) continue

      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'city-pin'
      el.dataset.network = String(model.network)
      el.setAttribute('aria-label', model.label)
      el.innerHTML = pinHtml(model, withTags)
      if (place.id === selectedRef.current) el.classList.add('is-selected')
      el.style.zIndex = model.awake ? '3' : model.network ? '2' : '1'
      el.addEventListener('click', event => {
        event.stopPropagation()
        onSelectRef.current(place)
      })
      const marker = new lib.Marker({ element: el, anchor: 'bottom' }).setLngLat([lng, lat]).addTo(map)
      markersRef.current.set(key, { marker, placeId: place.id })
    }

    for (const [key, entry] of markersRef.current) {
      if (!wanted.has(key)) {
        entry.marker.remove()
        markersRef.current.delete(key)
      }
    }
  }

  // ── Crear el mapa (una sola vez) ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    let map: MapLibreMap | null = null
    const markers = markersRef.current

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
          // El mapa no se arrastra con dos dedos hacia arriba por accidente:
          // la inclinación se cambia con el botón 3D.
          touchPitch: false,
          fadeDuration: 180,
        })
        mapRef.current = map

        // Atribución abajo a la izquierda y plegada: no pelea con los controles.
        map.addControl(new lib.AttributionControl({ compact: true }), 'bottom-left')
        const collapseAttribution = () =>
          containerRef.current
            ?.querySelector('.maplibregl-ctrl-attrib')
            ?.classList.remove('maplibregl-compact-show')
        collapseAttribution()

        const puckEl = document.createElement('div')
        puckEl.className = 'city-puck'
        puckEl.innerHTML = USER_PUCK_HTML
        puckRef.current = new lib.Marker({ element: puckEl, anchor: 'center' })
          .setLngLat([start.lng, start.lat])
          .addTo(map)

        map.on('click', () => onSelectRef.current(null))
        map.on('moveend', () => renderRef.current())
        map.on('load', () => {
          if (cancelled || !map) return
          collapseAttribution()
          const inset = insetRef.current
          const padding = { top: inset.top, bottom: inset.bottom, left: 0, right: 0 }
          const c = centerRef.current
          appliedRef.current = {
            tilted: tiltedRef.current,
            top: inset.top,
            bottom: inset.bottom,
            lat: c.lat,
            lng: c.lng,
          }
          map.setPadding(padding)
          setReady(true)
          renderRef.current()
          if (animateIn) {
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
        })
        map.on('error', event => {
          // Sin WebGL el constructor no llega a `load`; el resto son teselas
          // sueltas que fallan y no rompen la experiencia.
          if (!mapRef.current?.loaded() && String(event?.error?.message ?? '').includes('WebGL')) {
            setFailed(true)
          }
        })
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
      for (const entry of markers.values()) entry.marker.remove()
      markers.clear()
      puckRef.current?.remove()
      puckRef.current = null
      try {
        map?.remove()
      } catch {}
      mapRef.current = null
    }
  }, [])

  // ── Redibujar pines cuando cambian los lugares ───────────────────────────
  useEffect(() => {
    if (ready) renderRef.current()
  }, [ready, index, byId])

  // ── Pin seleccionado ─────────────────────────────────────────────────────
  useEffect(() => {
    for (const entry of markersRef.current.values()) {
      if (!entry.placeId) continue
      entry.marker.getElement().classList.toggle('is-selected', entry.placeId === selectedId)
    }
  }, [selectedId, ready])

  // ── Tema día / noche ─────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || themeRef.current === theme) return
    themeRef.current = theme
    map.setStyle(buildCityStyle(theme, centerRef.current))
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
    map.easeTo({ padding: { top: topInset, bottom: bottomInset, left: 0, right: 0 }, duration: 350 })
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
    map.easeTo({ center: [center.lng, center.lat], duration: 900 })
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
      focus: place => {
        const map = mapRef.current
        if (!map || place.lat == null || place.lng == null) return
        map.easeTo({
          center: [place.lng, place.lat],
          zoom: Math.max(map.getZoom(), 16.2),
          duration: 700,
        })
      },
    }),
    []
  )

  return (
    <div className="city-map" style={{ backgroundColor: cityMapBackground(theme) }}>
      <div dangerouslySetInnerHTML={{ __html: CITY_PIN_DEFS }} />
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
