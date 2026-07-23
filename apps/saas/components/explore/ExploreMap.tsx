'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { RestaurantCardData } from '@/types/restaurant-card'
import 'leaflet/dist/leaflet.css'
import { ShoppingBag, MapPinIcon, X, Clock, Phone, ExternalLink } from 'lucide-react'
import Link from 'next/link'

interface Props {
  userLat: number
  userLng: number
  restaurants: RestaurantCardData[]
  onSelect: (r: RestaurantCardData) => void
}

function distLabel(m: number | null) {
  if (m === null) return ''
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`
}

// ── SVG pin shapes ────────────────────────────────────────────────────────────

function pinSvg(fill: string, isNetwork: boolean, logoUrl?: string, opacity = 1) {
  if (isNetwork && logoUrl) {
    return `
      <div style="position:relative; width:40px; height:40px; transform:translate(-20px, -40px); opacity:${opacity}">
        <svg width="40" height="48" viewBox="0 0 40 48" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 4px 8px rgba(0,0,0,0.4))">
          <path d="M20 48C20 48 40 34 40 20C40 9.0 31.0 0 20 0C9.0 0 0 9.0 0 20C0 34 20 48 20 48Z" fill="${fill}"/>
        </svg>
        <div style="position:absolute; top:4px; left:4px; width:32px; height:32px; border-radius:50%; overflow:hidden; border:2px solid white; background:white">
          <img src="${logoUrl}" style="width:100%; height:100%; object-cover" />
        </div>
      </div>`
  }

  return `
    <div style="transform:translate(-14px, -36px); opacity:${opacity}">
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
  r: RestaurantCardData
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
      <div
        className="rounded-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200"
        style={{
          backgroundColor: 'var(--tgo-surface-1)',
          border: '1px solid var(--tgo-border)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
        }}
      >
        <div
          className="h-1.5 w-full"
          style={{ backgroundColor: isNetwork ? 'var(--tgo-state-success)' : 'var(--tgo-text-muted)' }}
        />
        <div className="p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span
              className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: isNetwork ? 'var(--tgo-state-success-soft)' : 'var(--tgo-surface-2)',
                color: isNetwork ? 'var(--tgo-state-success)' : 'var(--tgo-text-muted)',
              }}
            >
              {isNetwork ? 'Red' : 'Directorio'}
            </span>
            <span style={{ color: 'var(--tgo-text-muted)' }} className="text-[10px] ml-auto">{distLabel(r.distanceM)}</span>
          </div>
          <p className="font-bold text-sm leading-tight" style={{ color: 'var(--tgo-text-primary)' }}>{r.name}</p>
          <p className="text-[11px] truncate" style={{ color: 'var(--tgo-text-muted)' }}>{r.address}</p>
          {isNetwork && r.estimatedPickupTime && (
            <p className="text-[11px] font-semibold flex items-center gap-1" style={{ color: 'var(--tgo-state-success)' }}>
              <Clock size={10} /> ~{r.estimatedPickupTime} min
            </p>
          )}
          {r.isOpenNow === true && (
            <p className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: 'var(--tgo-state-success)' }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--tgo-state-success)' }} />
              Abierto ahora
            </p>
          )}
          {r.isOpenNow === false && (
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--tgo-state-danger)' }}>
              Cerrado ahora
            </p>
          )}
          {isNetwork && r.isOperational === false && (
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--tgo-state-warning)' }}>
              Catálogo / Próximamente
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Bottom sheet (mobile) ─────────────────────────────────────────────────────

function BottomSheet({ r, onClose, onNavigate }: {
  r: RestaurantCardData
  onClose: () => void
  onNavigate: () => void
}) {
  const isNetwork = r.type === 'network'

  return (
    <>
      <div className="absolute inset-0 z-[900]" style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div className="absolute bottom-[84px] left-0 right-0 z-[1100] animate-slide-up px-4">
        <div
          className="rounded-[24px] shadow-2xl overflow-hidden"
          style={{
            backgroundColor: 'var(--tgo-surface-1)',
            border: '1px solid var(--tgo-border)',
          }}
        >
          <div className="flex justify-center pt-3 pb-2" onClick={onClose}>
            <div className="w-12 h-1.5 rounded-full" style={{ backgroundColor: 'var(--tgo-border)' }} />
          </div>

          <div className="px-6 pt-2 pb-8 space-y-4">
            <div className="flex items-start gap-4">
              {isNetwork && r.logoUrl && (
                <div
                  className="shrink-0 w-16 h-16 rounded-2xl overflow-hidden"
                  style={{ border: '1px solid var(--tgo-border)' }}
                >
                  <img src={r.logoUrl} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: isNetwork
                        ? (r.isOperational === false ? 'var(--tgo-state-warning-soft)' : 'var(--tgo-state-success-soft)')
                        : 'var(--tgo-surface-2)',
                      color: isNetwork
                        ? (r.isOperational === false ? 'var(--tgo-state-warning)' : 'var(--tgo-state-success)')
                        : 'var(--tgo-text-muted)',
                    }}
                  >
                    {isNetwork 
                      ? (r.isOperational === false ? 'Catálogo' : 'En Red') 
                      : 'Directorio'}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--tgo-text-muted)' }}>{distLabel(r.distanceM)}</span>
                </div>
                <h3 className="font-bold text-xl leading-tight truncate" style={{ color: 'var(--tgo-text-primary)' }}>{r.name}</h3>
                <p className="text-sm mt-0.5 truncate" style={{ color: 'var(--tgo-text-muted)' }}>{r.address}</p>
                {r.isOpenNow === true && (
                  <p className="text-[10px] font-bold uppercase tracking-wider mt-1 flex items-center gap-1" style={{ color: 'var(--tgo-state-success)' }}>
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--tgo-state-success)' }} />
                    Abierto ahora
                  </p>
                )}
                {r.isOpenNow === false && (
                  <p className="text-[10px] font-bold uppercase tracking-wider mt-1" style={{ color: 'var(--tgo-state-danger)' }}>
                    Cerrado ahora
                  </p>
                )}
                {isNetwork && r.isOperational === false && (
                   <p className="text-[10px] font-black uppercase tracking-widest mt-1 animate-pulse" style={{ color: 'var(--tgo-state-warning)' }}>
                     Proximamente takeaway
                   </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              {isNetwork ? (
                <button
                  onClick={onNavigate}
                  className="col-span-2 flex items-center justify-center gap-2.5 py-4 rounded-2xl text-white font-bold transition-transform active:scale-95"
                  style={{
                    backgroundColor: r.isOperational === false ? 'var(--tgo-surface-3)' : 'var(--tgo-state-interactive)',
                    color: r.isOperational === false ? 'var(--tgo-text-muted)' : 'var(--tgo-text-on-interactive)',
                    boxShadow: r.isOperational === false ? 'none' : '0 4px 16px var(--tgo-state-interactive-soft)',
                  }}
                >
                  {r.isOperational === false ? (
                    <>Ver carta (Proximamente)</>
                  ) : (
                    <><ShoppingBag size={18} /> Ver menu y pedir</>
                  )}
                </button>
              ) : (
                <>
                  {r.phone && (
                    <a
                      href={`tel:${r.phone}`}
                      className="flex items-center justify-center gap-2 py-4 rounded-2xl font-bold active:scale-95"
                      style={{
                        backgroundColor: 'var(--tgo-surface-2)',
                        color: 'var(--tgo-text-primary)',
                        border: '1px solid var(--tgo-border)',
                      }}
                    >
                      <Phone size={16} /> Llamar
                    </a>
                  )}
                  <button
                    onClick={onNavigate}
                    className="flex items-center justify-center gap-2 py-4 rounded-2xl font-bold active:scale-95"
                    style={{
                      backgroundColor: 'var(--tgo-surface-2)',
                      color: 'var(--tgo-text-primary)',
                      border: '1px solid var(--tgo-border)',
                    }}
                  >
                    <MapPinIcon size={16} /> Detalle
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
  const hoveredRef = useRef<RestaurantCardData | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [hovered, setHovered] = useState<RestaurantCardData | null>(null)
  const [hoveredPos, setHoveredPos] = useState<CardPos | null>(null)
  const [tapped, setTapped] = useState<RestaurantCardData | null>(null)
  const [containerSize, setContainerSize] = useState({ w: 600, h: 500 })

  const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

  const showCard = useCallback((r: RestaurantCardData, pos: CardPos) => {
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

      // Restaurant markers (skip those without coordinates)
      restaurants.filter(r => r.lat !== null && r.lng !== null).forEach(r => {
        const isNetwork = r.type === 'network'
        const isOperational = r.isOperational ?? true
        const isClosed = r.isOpenNow === false
        const fill = isNetwork 
          ? (isOperational ? '#10b981' : '#f59e0b') 
          : '#a78bfa'
        const opacity = isClosed ? 0.55 : 1
        const pinColor = isClosed ? '#5a524d' : fill

        const icon = L.divIcon({
          className: '',
          html: pinSvg(pinColor, isNetwork, r.logoUrl, opacity),
          iconSize: isNetwork ? [40, 48] : [28, 36],
        })

        const marker = L.marker([r.lat!, r.lng!], { icon }).addTo(map)

        if (!isTouch) {
          marker.on('mouseover', () => {
            const point = map.latLngToContainerPoint([r.lat!, r.lng!])
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
    <div className="relative w-full h-full" style={{ backgroundColor: 'var(--tgo-surface-0)' }}>
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
          className="w-10 h-10 rounded-xl flex items-center justify-center font-bold active:scale-95"
          style={{
            backgroundColor: 'var(--tgo-surface-1)',
            color: 'var(--tgo-text-primary)',
            border: '1px solid var(--tgo-border)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          }}
        >+</button>
        <button
          onClick={() => mapRef.current?.zoomOut()}
          className="w-10 h-10 rounded-xl flex items-center justify-center font-bold active:scale-95"
          style={{
            backgroundColor: 'var(--tgo-surface-1)',
            color: 'var(--tgo-text-primary)',
            border: '1px solid var(--tgo-border)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          }}
        >-</button>
      </div>
    </div>
  )
}
