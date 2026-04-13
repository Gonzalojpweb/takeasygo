'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { NearbyRestaurant } from '@/app/api/explore/nearby/route'
import 'leaflet/dist/leaflet.css'
import { ShoppingBag, MapPin, X, Clock, Phone, ExternalLink } from 'lucide-react'
import Link from 'next/link'

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

function pinSvg(fill: string, isNetwork: boolean, logoUrl?: string) {
  if (isNetwork && logoUrl) {
    return `
      <div style="position:relative; width:40px; height:40px; transform:translate(-20px, -40px)">
        <svg width="40" height="48" viewBox="0 0 40 48" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 4px 8px rgba(0,0,0,0.4))">
          <path d="M20 48C20 48 40 34 40 20C40 9.0 31.0 0 20 0C9.0 0 0 9.0 0 20C0 34 20 48 20 48Z" fill="${fill}"/>
        </svg>
        <div style="position:absolute; top:4px; left:4px; width:32px; height:32px; border-radius:50%; overflow:hidden; border:2px solid white; background:white">
          <img src="${logoUrl}" style="width:100%; height:100%; object-cover" />
        </div>
      </div>`
  }

  return `
    <div style="transform:translate(-14px, -36px)">
      <svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg"
           style="filter:drop-shadow(0 3px 6px rgba(0,0,0,0.3))">
        <path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 22 14 22S28 23.333 28 14C28 6.268 21.732 0 14 0z"
              fill="${fill}"/>
        <circle cx="14" cy="14" r="5" fill="white" fill-opacity="0.95"/>
      </svg>
    </div>`
}

function pulsePinSvg(fill: string) {
  return `
    <div style="position:relative;width:36px;height:36px;display:flex;align-items:center;justify-content:center;transform:translate(-18px, -18px)">
      <div style="
        position:absolute;width:36px;height:36px;border-radius:50%;
        background:${fill};opacity:0.25;
        animation:pulse 2s cubic-bezier(0.4,0,0.6,1) infinite;
      "></div>
      <div style="
        width:14px;height:14px;border-radius:50%;
        background:${fill};border:3px solid white;
        box-shadow:0 0 12px ${fill};
        position:relative;z-index:1;
      "></div>
    </div>
    <style>
      @keyframes pulse {
        0%,100%{transform:scale(1);opacity:0.25}
        50%{transform:scale(1.8);opacity:0}
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
  const cardW = 260
  const cardH = 150
  const gap = 20

  let left = pos.x + gap
  let top = pos.y - cardH / 2
  if (left + cardW > containerW - 12) left = pos.x - cardW - gap
  if (top < 12) top = 12
  if (top + cardH > containerH - 12) top = containerH - cardH - 12

  return (
    <div
      className="absolute z-[1000] pointer-events-none"
      style={{ left, top, width: cardW }}
    >
      <div className="glass-card-elevated rounded-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className={`h-1.5 w-full ${isNetwork ? 'bg-[#10b981]' : 'bg-[#5a524d]'}`} />
        <div className="p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${isNetwork ? 'bg-[#10b981]/20 text-[#10b981]' : 'bg-white/10 text-[#8a7f7a]'
              }`}>
              {isNetwork ? 'Red' : 'Directorio'}
            </span>
            <span className="text-[#8a7f7a] text-[10px] ml-auto">{distLabel(r.distanceM)}</span>
          </div>
          <p className="font-bold text-[#f7f4f2] text-sm leading-tight">{r.name}</p>
          <p className="text-[#5a524d] text-[11px] truncate">{r.address}</p>
          {isNetwork && r.estimatedPickupTime && (
            <p className="text-[#10b981] text-[11px] font-semibold flex items-center gap-1">
              <Clock size={10} /> ~{r.estimatedPickupTime} min
            </p>
          )}
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
      <div className="absolute inset-0 z-[900] bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 z-[1000] safe-area-bottom animate-slide-up">
        <div className="glass-card-elevated rounded-t-[32px] border-t border-white/10 shadow-2xl">
          <div className="flex justify-center pt-3 pb-2" onClick={onClose}>
            <div className="w-12 h-1.5 rounded-full bg-white/10" />
          </div>

          <div className="px-6 pt-2 pb-8 space-y-4">
            <div className="flex items-start gap-4">
              {isNetwork && r.logoUrl && (
                <div className="shrink-0 w-16 h-16 rounded-2xl overflow-hidden border border-white/10">
                  <img src={r.logoUrl} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${isNetwork ? 'bg-[#10b981]/20 text-[#10b981]' : 'bg-white/10 text-[#8a7f7a]'
                    }`}>
                    {isNetwork ? '● En Red' : '○ Directorio'}
                  </span>
                  <span className="text-[#8a7f7a] text-xs">{distLabel(r.distanceM)}</span>
                </div>
                <h3 className="font-bold text-[#f7f4f2] text-xl leading-tight truncate">{r.name}</h3>
                <p className="text-[#5a524d] text-sm mt-0.5 truncate">{r.address}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              {isNetwork ? (
                <button
                  onClick={onNavigate}
                  className="col-span-2 flex items-center justify-center gap-2.5 py-4 rounded-2xl text-white font-bold transition-transform active:scale-95"
                  style={{ background: 'linear-gradient(135deg, #f14722, #e03e1d)', boxShadow: '0 4px 16px rgba(241,71,34,0.3)' }}
                >
                  <ShoppingBag size={18} /> Ver menú y pedir
                </button>
              ) : (
                <>
                  {r.phone && (
                    <a
                      href={`tel:${r.phone}`}
                      className="flex items-center justify-center gap-2 py-4 rounded-2xl bg-white/5 text-white font-bold border border-white/10 active:scale-95"
                    >
                      <Phone size={16} /> Llamar
                    </a>
                  )}
                  <button
                    onClick={onNavigate}
                    className="flex items-center justify-center gap-2 py-4 rounded-2xl bg-white/5 text-white font-bold border border-white/10 active:scale-95"
                  >
                    <MapPin size={16} /> Detalle
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

// ── Main Component ────────────────────────────────────────────────────────────

export default function ExploreMap({ userLat, userLng, restaurants, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const hoveredRef = useRef<NearbyRestaurant | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [hovered, setHovered] = useState<NearbyRestaurant | null>(null)
  const [hoveredPos, setHoveredPos] = useState<CardPos | null>(null)
  const [tapped, setTapped] = useState<NearbyRestaurant | null>(null)
  const [containerSize, setContainerSize] = useState({ w: 600, h: 500 })

  const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

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
    }, 120)
  }, [])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    let cancelled = false

    import('leaflet').then(L => {
      if (cancelled || !containerRef.current || mapRef.current) return

      const map = L.map(containerRef.current!, {
        zoomControl: false, // Custom zoom? No, let's keep it simple for now or move it
        attributionControl: false,
      }).setView([userLat, userLng], 15)

      // Dark tiles
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
      }).addTo(map)

      // User location marker
      const userIcon = L.divIcon({
        className: '',
        html: pulsePinSvg('#f14722'),
        iconSize: [36, 36],
      })
      L.marker([userLat, userLng], { icon: userIcon }).addTo(map)

      // Restaurant markers
      restaurants.forEach(r => {
        const isNetwork = r.type === 'network'
        const isClosed = r.isOpenNow === false
        const fill = isNetwork ? '#10b981' : '#5a524d'

        const icon = L.divIcon({
          className: '',
          html: pinSvg(fill, isNetwork, r.logoUrl),
          iconSize: isNetwork ? [40, 48] : [28, 36],
        })

        const marker = L.marker([r.lat, r.lng], { icon }).addTo(map)

        if (!isTouch) {
          marker.on('mouseover', () => {
            const point = map.latLngToContainerPoint([r.lat, r.lng])
            showCard(r, { x: point.x, y: point.y })
          })
          marker.on('mouseout', hideCard)
          marker.on('click', () => onSelect(r))
        } else {
          marker.on('click', () => setTapped(r))
        }
      })

      mapRef.current = map

      const updateSize = () => {
        if (containerRef.current) {
          setContainerSize({
            w: containerRef.current.offsetWidth,
            h: containerRef.current.offsetHeight,
          })
        }
      }
      updateSize()
      window.addEventListener('resize', updateSize)
      return () => window.removeEventListener('resize', updateSize)
    })

    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [userLat, userLng, restaurants, onSelect, isTouch, showCard, hideCard])

  return (
    <div className="relative w-full h-full consumer-dark">
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

      {/* Zoom controls (overlay) */}
      <div className="absolute top-4 right-4 flex flex-col gap-2 z-[500]">
        <button
          onClick={() => mapRef.current?.zoomIn()}
          className="w-10 h-10 rounded-xl glass-card flex items-center justify-center text-white font-bold active:scale-95"
        >+</button>
        <button
          onClick={() => mapRef.current?.zoomOut()}
          className="w-10 h-10 rounded-xl glass-card flex items-center justify-center text-white font-bold active:scale-95"
        >-</button>
      </div>
    </div>
  )
}
