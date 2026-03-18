'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { NearbyRestaurant } from '@/app/api/explore/nearby/route'
import 'leaflet/dist/leaflet.css'
import { ShoppingBag, MapPin, X, Clock, Phone } from 'lucide-react'

interface Props {
  userLat: number
  userLng: number
  restaurants: NearbyRestaurant[]
  onSelect: (r: NearbyRestaurant) => void
}

function distLabel(m: number) {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`
}

// ── SVG pin shapes ────────────────────────────────────────────────────────────

function pinSvg(fill: string, opacity = 1) {
  return `
    <svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg"
         style="filter:drop-shadow(0 3px 6px rgba(0,0,0,0.25));opacity:${opacity}">
      <path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 22 14 22S28 23.333 28 14C28 6.268 21.732 0 14 0z"
            fill="${fill}"/>
      <circle cx="14" cy="14" r="6" fill="white" fill-opacity="0.95"/>
    </svg>`
}

function pulsePinSvg(fill: string) {
  // Marcador de usuario con anillo pulsante
  return `
    <div style="position:relative;width:36px;height:36px;display:flex;align-items:center;justify-content:center">
      <div style="
        position:absolute;width:36px;height:36px;border-radius:50%;
        background:${fill};opacity:0.2;
        animation:pulse 2s cubic-bezier(0.4,0,0.6,1) infinite;
      "></div>
      <div style="
        width:18px;height:18px;border-radius:50%;
        background:${fill};border:3px solid white;
        box-shadow:0 2px 8px rgba(0,0,0,0.3);
        position:relative;z-index:1;
      "></div>
    </div>
    <style>
      @keyframes pulse {
        0%,100%{transform:scale(1);opacity:0.2}
        50%{transform:scale(1.5);opacity:0}
      }
    </style>`
}

// ── Hover card (desktop) ──────────────────────────────────────────────────────

interface CardPos { x: number; y: number }

function HoverCard({ r, pos, containerW, containerH }: {
  r: NearbyRestaurant
  pos: CardPos
  containerW: number
  containerH: number
}) {
  const isNetwork = r.type === 'network'
  const cardW = 248
  const cardH = 170
  const gap = 18

  // Posicionar sin salirse del mapa
  let left = pos.x + gap
  let top  = pos.y - cardH / 2
  if (left + cardW > containerW - 8) left = pos.x - cardW - gap
  if (top < 8) top = 8
  if (top + cardH > containerH - 8) top = containerH - cardH - 8

  return (
    <div
      className="absolute z-[1000] pointer-events-none"
      style={{ left, top, width: cardW }}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-zinc-100/80 overflow-hidden
                      animate-in fade-in zoom-in-95 duration-150 ease-out">
        {/* Franja de color superior */}
        <div className={`h-1 w-full ${isNetwork ? 'bg-emerald-500' : 'bg-zinc-300'}`} />

        <div className="p-3.5 space-y-1.5">
          {/* Badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
              isNetwork
                ? 'bg-emerald-50 text-emerald-600'
                : 'bg-zinc-100 text-zinc-500'
            }`}>
              {isNetwork ? '● Red' : '○ Directorio'}
            </span>
            {r.isOpenNow === true && (
              <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                Abierto
              </span>
            )}
            {r.isOpenNow === false && (
              <span className="text-[9px] font-black text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">
                Cerrado
              </span>
            )}
          </div>

          {/* Nombre */}
          <p className="font-bold text-zinc-900 text-sm leading-snug">{r.name}</p>

          {/* Distancia + dirección */}
          <p className="text-zinc-400 text-[11px] leading-snug line-clamp-2">{distLabel(r.distanceM)} · {r.address}</p>

          {/* Tiempo estimado */}
          {isNetwork && r.estimatedPickupTime && (
            <p className="text-emerald-600 text-[11px] font-semibold flex items-center gap-1">
              <Clock size={10} /> ~{r.estimatedPickupTime} min
            </p>
          )}

          {/* Tipos de cocina */}
          {r.cuisineTypes?.length > 0 && (
            <p className="text-zinc-300 text-[10px] truncate">{r.cuisineTypes.join(' · ')}</p>
          )}
        </div>

        <div className="px-3.5 pb-3.5">
          <p className="text-[10px] text-zinc-300 font-medium">Click para ver detalle →</p>
        </div>
      </div>
    </div>
  )
}

// ── Bottom sheet (mobile) ─────────────────────────────────────────────────────

function BottomSheet({ r, onClose, onNavigate }: {
  r: NearbyRestaurant
  onClose: () => void
  onNavigate: () => void
}) {
  const isNetwork = r.type === 'network'

  return (
    <>
      {/* Backdrop */}
      <div
        className="absolute inset-0 z-[900]"
        onClick={onClose}
      />
      {/* Sheet */}
      <div className="absolute bottom-0 left-0 right-0 z-[1000]
                      animate-in slide-in-from-bottom duration-300 ease-out">
        <div className="bg-white rounded-t-3xl shadow-2xl border-t border-zinc-100">
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-9 h-1 rounded-full bg-zinc-200" />
          </div>

          <div className="px-5 pt-1 pb-6 space-y-3">
            {/* Header */}
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                  <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    isNetwork
                      ? 'bg-emerald-50 text-emerald-600'
                      : 'bg-zinc-100 text-zinc-500'
                  }`}>
                    {isNetwork ? '● En Red TakeasyGO' : '○ Directorio'}
                  </span>
                  {r.isOpenNow === true && (
                    <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Abierto</span>
                  )}
                  {r.isOpenNow === false && (
                    <span className="text-[10px] font-black text-red-500 bg-red-50 px-2 py-0.5 rounded-full">Cerrado</span>
                  )}
                </div>
                <p className="font-bold text-zinc-900 text-lg leading-tight">{r.name}</p>
                <p className="text-zinc-400 text-sm mt-0.5 leading-snug">{distLabel(r.distanceM)} · {r.address}</p>
              </div>
              <button
                onClick={onClose}
                className="shrink-0 w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center transition-colors">
                <X size={14} className="text-zinc-500" />
              </button>
            </div>

            {/* Extras */}
            {isNetwork && r.estimatedPickupTime && (
              <p className="text-emerald-600 text-sm font-semibold flex items-center gap-1.5">
                <Clock size={13} /> Listo en ~{r.estimatedPickupTime} min
              </p>
            )}
            {r.cuisineTypes?.length > 0 && (
              <p className="text-zinc-400 text-xs">{r.cuisineTypes.join(' · ')}</p>
            )}
            {!isNetwork && r.phone && (
              <p className="text-zinc-500 text-sm flex items-center gap-1.5">
                <Phone size={13} className="text-zinc-400" /> {r.phone}
              </p>
            )}

            {/* CTAs */}
            <div className="flex gap-2 pt-1">
              {isNetwork ? (
                <button
                  onClick={onNavigate}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl
                             bg-emerald-500 active:bg-emerald-600 text-white text-sm font-bold transition-colors">
                  <ShoppingBag size={16} /> Ver menú y pedir
                </button>
              ) : (
                <>
                  {r.phone && (
                    <a
                      href={`tel:${r.phone}`}
                      className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl
                                 bg-zinc-800 active:bg-zinc-900 text-white text-sm font-bold transition-colors">
                      <Phone size={15} /> Llamar
                    </a>
                  )}
                  <button
                    onClick={onNavigate}
                    className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl
                               bg-zinc-100 active:bg-zinc-200 text-zinc-800 text-sm font-bold transition-colors">
                    <MapPin size={15} /> Ver detalle
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ExploreMap({ userLat, userLng, restaurants, onSelect }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const mapRef        = useRef<any>(null)
  const hoveredRef    = useRef<NearbyRestaurant | null>(null) // para evitar flicker mouseout→mouseover
  const hideTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [hovered, setHovered]   = useState<NearbyRestaurant | null>(null)
  const [hoveredPos, setHoveredPos] = useState<CardPos | null>(null)
  const [tapped, setTapped]     = useState<NearbyRestaurant | null>(null)
  const [containerSize, setContainerSize] = useState({ w: 600, h: 500 })

  // Detectar si es touch device
  const isTouch = typeof window !== 'undefined'
    ? window.matchMedia('(pointer: coarse)').matches
    : false

  const showCard = useCallback((r: NearbyRestaurant, pos: CardPos) => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hoveredRef.current = r
    setHovered(r)
    setHoveredPos(pos)
  }, [])

  const hideCard = useCallback(() => {
    hideTimerRef.current = setTimeout(() => {
      hoveredRef.current = null
      setHovered(null)
      setHoveredPos(null)
    }, 120) // pequeño delay para evitar flicker al mover el mouse
  }, [])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    let cancelled = false

    import('leaflet').then(L => {
      if (cancelled || !containerRef.current || mapRef.current) return
      if ((containerRef.current as any)._leaflet_id) {
        delete (containerRef.current as any)._leaflet_id
      }

      const map = L.map(containerRef.current!, {
        zoomControl: true,
        attributionControl: true,
      }).setView([userLat, userLng], 15)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      // ── Marcador usuario ──────────────────────────────────────────────────
      const userIcon = L.divIcon({
        className: '',
        html: pulsePinSvg('#3b82f6'),
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      })
      L.marker([userLat, userLng], { icon: userIcon })
        .addTo(map)
        .bindTooltip('Tu ubicación', { permanent: false, direction: 'top', offset: [0, -20] })

      // ── Marcadores de restaurantes ────────────────────────────────────────
      restaurants.forEach(r => {
        const isNetwork = r.type === 'network'
        const isClosed  = r.isOpenNow === false

        const fill =
          isNetwork && !isClosed ? '#10b981' :  // red abierto
          isNetwork && isClosed  ? '#6ee7b7' :  // red cerrado (apagado)
          '#a1a1aa'                              // directorio

        const opacity = isClosed ? 0.7 : 1

        const icon = L.divIcon({
          className: '',
          html: pinSvg(fill, opacity),
          iconSize:   [28, 36],
          iconAnchor: [14, 36],   // base del pin en la coordenada
          popupAnchor:[0, -36],
        })

        const marker = L.marker([r.lat, r.lng], { icon }).addTo(map)

        if (!isTouch) {
          // Desktop: hover para preview card
          marker.on('mouseover', () => {
            const point = map.latLngToContainerPoint([r.lat, r.lng])
            const { offsetWidth: w, offsetHeight: h } = containerRef.current!
            setContainerSize({ w, h })
            showCard(r, { x: point.x, y: point.y })
          })
          marker.on('mouseout', () => {
            hideCard()
          })
          marker.on('click', () => {
            onSelect(r)
          })
        } else {
          // Mobile: tap para bottom sheet
          marker.on('click', () => {
            setTapped(r)
          })
        }
      })

      mapRef.current = map

      // Tamaño inicial del contenedor
      if (containerRef.current) {
        setContainerSize({
          w: containerRef.current.offsetWidth,
          h: containerRef.current.offsetHeight,
        })
      }
    })

    return () => {
      cancelled = true
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      if (containerRef.current) {
        delete (containerRef.current as any)._leaflet_id
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />

      {/* Hover card — desktop */}
      {!isTouch && hovered && hoveredPos && (
        <HoverCard
          r={hovered}
          pos={hoveredPos}
          containerW={containerSize.w}
          containerH={containerSize.h}
        />
      )}

      {/* Bottom sheet — mobile */}
      {isTouch && tapped && (
        <BottomSheet
          r={tapped}
          onClose={() => setTapped(null)}
          onNavigate={() => { onSelect(tapped); setTapped(null) }}
        />
      )}
    </div>
  )
}
