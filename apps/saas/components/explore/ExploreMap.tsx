'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { RestaurantCardData } from '@/types/restaurant-card'
import 'leaflet/dist/leaflet.css'
import { ShoppingBag, MapPinIcon, X, Clock, Phone, ExternalLink, BookOpen } from 'lucide-react'
import Link from 'next/link'
import { useHaptic } from '@/components/tgo/useHaptic'
import Supercluster from 'supercluster'
import MapCapsule from './MapCapsule'
import PuntoTGO, { type OrderStatus, type NetworkStatus } from '@/components/tgo/PuntoTGO'

interface Props {
  userLat: number
  userLng: number
  restaurants: RestaurantCardData[]
  onSelect: (r: RestaurantCardData) => void
  metrics?: {
    openCount: number
    promoCount: number
    newCount: number
  }
}

function distLabel(m: number | null) {
  if (m === null) return ''
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`
}

// ── PuntoTGO to HTML string (for L.divIcon) ──────────────────────────────────
// Matches PuntoTGO.tsx exactly — pin (teardrop) shape per Doc 01 §3.2.
// Reference: tgoicon.PNG

function renderPuntoTGOToHTML({
  networkStatus,
  isOperational = true,
  size = 40,
}: {
  networkStatus: NetworkStatus
  isOperational?: boolean
  size?: number
}) {
  const isLive = networkStatus === 'live' && isOperational
  const height = Math.round(size * 1.3)

  // Pin color: gradient for live, solid grey for dormant
  const useGradient = isLive
  const pinFill = useGradient ? 'url(#puntoTgoGradientMap)' : 'var(--tgo-network-dormant, #9CA3AF)'

  // Expression: happy for live, sleepy for dormant (flat line mouth)
  const eyeY = isLive ? 16 : 17
  const eyeRadius = isLive ? 1.8 : 1.5
  const mouthPath = isLive
    ? 'M17 21 Q20 24 23 21'  // smile
    : 'M17 22 L23 22'        // flat line (sleepy/dormant)

  // Pulse animation for live
  const pulseStyle = isLive
    ? 'animation: punto-tgo-pulse 2s ease-in-out infinite;'
    : ''

  return `
    <div style="transform:translate(-${size / 2}px, -${height}px); ${pulseStyle}">
      <svg width="${size}" height="${height}" viewBox="0 0 40 52" fill="none" xmlns="http://www.w3.org/2000/svg"
           style="filter:drop-shadow(0 4px 8px rgba(0,0,0,0.25));">
        <defs>
          <linearGradient id="puntoTgoGradientMap" x1="20" y1="0" x2="20" y2="52" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#FFB347"/>
            <stop offset="50%" stop-color="#FF8C42"/>
            <stop offset="100%" stop-color="#F74211"/>
          </linearGradient>
        </defs>

        <!-- Pin body (teardrop) -->
        <path d="M20 52C20 52 40 36 40 22C40 10 31 0 20 0C9 0 0 10 0 22C0 36 20 52 20 52Z"
              fill="${pinFill}"/>

        <!-- White circle for face -->
        <circle cx="20" cy="20" r="12" fill="white"/>

        <!-- Eyes -->
        <circle cx="15" cy="${eyeY}" r="${eyeRadius}" fill="#2D2A4B"/>
        <circle cx="25" cy="${eyeY}" r="${eyeRadius}" fill="#2D2A4B"/>

        <!-- Mouth -->
        <path d="${mouthPath}" stroke="#2D2A4B" stroke-width="1.5" stroke-linecap="round" fill="none"/>
      </svg>
    </div>`
}

// ── SVG pin shapes ────────────────────────────────────────────────────────────

function pinSvg(fill: string, isNetwork: boolean, logoUrl?: string, opacity = 1, isActive = false) {
  const glowFilter = isActive
    ? 'filter:drop-shadow(0 4px 8px rgba(0,0,0,0.4)) drop-shadow(0 0 6px rgba(16,185,129,0.3))'
    : 'filter:drop-shadow(0 4px 8px rgba(0,0,0,0.4))'
  const glowFilterSm = isActive
    ? 'filter:drop-shadow(0 3px 6px rgba(0,0,0,0.3)) drop-shadow(0 0 4px rgba(16,185,129,0.2))'
    : 'filter:drop-shadow(0 3px 6px rgba(0,0,0,0.3))'

  if (isNetwork && logoUrl) {
    return `
      <div style="position:relative; width:40px; height:40px; transform:translate(-20px, -40px); opacity:${opacity}">
        <svg width="40" height="48" viewBox="0 0 40 48" fill="none" xmlns="http://www.w3.org/2000/svg" style="${glowFilter}">
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
           style="${glowFilterSm}">
        <path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 22 14 22S28 23.333 28 14C28 6.268 21.732 0 14 0z"
              fill="${fill}"/>
        <circle cx="14" cy="14" r="5" fill="white" fill-opacity="0.95"/>
      </svg>
    </div>`
}

// Hitbox: invisible larger area behind the pin for easier touch/click
function hitboxSvg(isNetwork: boolean) {
  const w = isNetwork ? 56 : 44
  const h = isNetwork ? 64 : 52
  const ox = isNetwork ? -28 : -22
  const oy = isNetwork ? -56 : -48
  return `
    <div style="position:absolute; width:${w}px; height:${h}px; transform:translate(${ox}px, ${oy}px); cursor:pointer;">
      <div style="width:100%; height:100%;"></div>
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

// ── Cluster marker SVG ────────────────────────────────────────────────────────

function clusterSvg(count: number, isSingleDigit: boolean) {
  const size = isSingleDigit ? 44 : 56
  const fontSize = isSingleDigit ? 16 : 14
  const ox = isSingleDigit ? -22 : -28
  const oy = isSingleDigit ? -22 : -28
  return `
    <div style="transform:translate(${ox}px, ${oy}px); cursor:pointer;">
      <div style="
        width:${size}px; height:${size}px; border-radius:50%;
        background: var(--tgo-brand);
        color: white;
        display: flex; align-items: center; justify-content: center;
        font-weight: 900; font-size: ${fontSize}px;
        border: 3px solid white;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        font-family: system-ui, sans-serif;
      ">${count}</div>
    </div>`
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
          style={{ backgroundColor: isNetwork ? (r.isOperational === false ? 'var(--tgo-state-discovery)' : 'var(--tgo-brand-primary)') : 'var(--tgo-state-inactive)' }}
        />
        <div className="p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span
              className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-[1px] rounded-full"
              style={{
                backgroundColor: isNetwork
                  ? (r.isOperational === false ? 'var(--tgo-state-discovery-soft)' : 'var(--tgo-brand-primary-soft)')
                  : 'var(--tgo-state-inactive-soft)',
                color: isNetwork
                  ? (r.isOperational === false ? 'var(--tgo-state-discovery)' : 'var(--tgo-brand-primary)')
                  : 'var(--tgo-state-inactive)',
              }}
            >
              {isNetwork
                ? (r.isOperational === false ? 'Catálogo' : 'En Red')
                : 'Directorio'}
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
            <p className="text-[9px] font-semibold uppercase tracking-wider flex items-center gap-1" style={{ color: 'var(--tgo-state-success)' }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--tgo-state-success)' }} />
              Abierto ahora
            </p>
          )}
          {r.isOpenNow === false && (
            <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: 'var(--tgo-state-inactive)' }}>
              Cerrado ahora
            </p>
          )}
          {isNetwork && r.isOperational === false && (
            <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: 'var(--tgo-state-discovery)' }}>
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
  const haptic = useHaptic()

  return (
    <>
      <div className="absolute inset-0 z-[900]" style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} onClick={() => { haptic.impact('light'); onClose() }} role="button" aria-label="Cerrar mapa" />
      <div className="absolute bottom-[84px] left-0 right-0 z-[1100] animate-slide-up px-4">
        <div
          className="rounded-[24px] shadow-2xl overflow-hidden"
          style={{
            backgroundColor: 'var(--tgo-surface-1)',
            border: '1px solid var(--tgo-border)',
          }}
        >
          <div className="flex justify-center pt-3 pb-2" onClick={onClose} role="button" aria-label="Cerrar">
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
                    className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-[1px] rounded-full"
                    style={{
                      backgroundColor: isNetwork
                        ? (r.isOperational === false ? 'var(--tgo-state-discovery-soft)' : 'var(--tgo-brand-primary-soft)')
                        : 'var(--tgo-state-inactive-soft)',
                      color: isNetwork
                        ? (r.isOperational === false ? 'var(--tgo-state-discovery)' : 'var(--tgo-brand-primary)')
                        : 'var(--tgo-state-inactive)',
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
                  <p className="text-[9px] font-semibold uppercase tracking-wider mt-1 flex items-center gap-1" style={{ color: 'var(--tgo-state-success)' }}>
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--tgo-state-success)' }} />
                    Abierto ahora
                  </p>
                )}
                {r.isOpenNow === false && (
                  <p className="text-[9px] font-semibold uppercase tracking-wider mt-1" style={{ color: 'var(--tgo-state-inactive)' }}>
                    Cerrado ahora
                  </p>
                )}
                {isNetwork && r.isOperational === false && (
                   <p className="text-[9px] font-semibold uppercase tracking-wider mt-1 animate-pulse" style={{ color: 'var(--tgo-state-discovery)' }}>
                     Proximamente takeaway
                   </p>
                )}
                {r.isNew && (
                  <div className="flex items-center gap-1.5 mt-2 px-2 py-1 rounded-full" style={{ backgroundColor: 'var(--tgo-state-discovery-soft)' }}>
                    <span className="text-[10px]">✨</span>
                    <span className="text-[10px] font-bold" style={{ color: 'var(--tgo-state-discovery)' }}>
                      Nuevo para vos
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              {isNetwork ? (
                r.isOperational === false ? (
                  <button
                    onClick={onNavigate}
                    className="col-span-2 flex items-center justify-center gap-2 py-4 rounded-2xl font-bold active:scale-95 transition-transform"
                    style={{
                      backgroundColor: 'transparent',
                      color: '#854F0B',
                      border: '1.5px solid var(--tgo-state-discovery)',
                    }}
                  >
                    <BookOpen size={16} /> Ver carta
                  </button>
                ) : (
                  <button
                    onClick={onNavigate}
                    className="col-span-2 flex items-center justify-center gap-2.5 py-4 rounded-2xl text-white font-bold transition-transform active:scale-95"
                    style={{
                      backgroundColor: 'var(--tgo-state-action)',
                      boxShadow: '0 4px 16px var(--tgo-state-action-soft)',
                    }}
                  >
                    <ShoppingBag size={18} /> Ver menú y pedir
                  </button>
                )
              ) : (
                <>
                  {r.phone && (
                    <a
                      href={`tel:${r.phone}`}
                      className="flex items-center justify-center gap-2 py-4 rounded-2xl font-bold active:scale-95"
                      style={{
                        backgroundColor: 'var(--tgo-state-trust)',
                        color: 'var(--tgo-text-inverse)',
                        border: '1px solid var(--tgo-state-trust)',
                      }}
                    >
                      <Phone size={16} /> Llamar
                    </a>
                  )}
                  <button
                    onClick={onNavigate}
                    className="flex items-center justify-center gap-2 py-4 rounded-2xl font-bold active:scale-95"
                    style={{
                      backgroundColor: 'transparent',
                      color: 'var(--tgo-state-trust)',
                      border: '1.5px solid var(--tgo-state-trust)',
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

// Zoom thresholds for visual priority
const ZOOM_CLUSTER = 14   // Below this: clusters dominate
const ZOOM_FULL = 16      // Above this: all pins visible

export default function ExploreMap({ userLat, userLng, restaurants, onSelect, metrics }: Props) {
  const haptic = useHaptic()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const hoveredRef = useRef<RestaurantCardData | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const markersRef = useRef<any[]>([])
  const superclusterRef = useRef<Supercluster | null>(null)

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

  // Clear all markers from the map
  const clearMarkers = useCallback(() => {
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
  }, [])

  // Render markers based on current zoom level
  const renderMarkers = useCallback((map: any, L: any, restaurants: RestaurantCardData[]) => {
    clearMarkers()

    const zoom = map.getZoom()

    // Filter restaurants with valid coordinates
    const valid = restaurants.filter(r => r.lat !== null && r.lng !== null)

    if (valid.length === 0) return

    // Build supercluster index
    const sc = new Supercluster({
      radius: 60,
      maxZoom: 17,
      reduce: (acc: any) => acc, // No aggregation needed for our use case
    })

    const points = valid.map(r => ({
      type: 'Feature' as const,
      properties: { restaurantId: r.id, cluster: false, restaurant: r },
      geometry: {
        type: 'Point' as const,
        coordinates: [r.lng!, r.lat!],
      },
    }))

    sc.load(points as any)
    superclusterRef.current = sc

    // Get clusters for current bounds and zoom
    const bounds = map.getBounds()
    const bbox: [number, number, number, number] = [
      bounds.getWest(), bounds.getSouth(),
      bounds.getEast(), bounds.getNorth(),
    ]
    const clusters = sc.getClusters(bbox, Math.floor(zoom))

    clusters.forEach((feature: any) => {
      const [lng, lat] = feature.geometry.coordinates
      const isCluster = feature.properties.cluster

      if (isCluster) {
        // ── Cluster marker ──
        const count = feature.properties.point_count
        const isSingleDigit = count < 10
        const icon = L.divIcon({
          className: '',
          html: clusterSvg(count, isSingleDigit),
          iconSize: isSingleDigit ? [44, 44] : [56, 56],
        })
        const marker = L.marker([lat, lng], { icon }).addTo(map)

        // Click on cluster: zoom in to expand
        marker.on('click', () => {
          const expansionZoom = sc.getClusterExpansionZoom(feature.properties.cluster_id)
          map.setView([lat, lng], Math.min(expansionZoom, 18), { animate: true })
        })

        markersRef.current.push(marker)
      } else {
        // ── Individual restaurant marker ──
        const r: RestaurantCardData = feature.properties.restaurant
        const isNetwork = r.type === 'network'
        const isOperational = r.isOperational ?? true
        const isClosed = r.isOpenNow === false

        // Zoom-based priority: at low zoom, only show network operational pins
        if (zoom < ZOOM_CLUSTER && !isNetwork) return
        if (zoom < ZOOM_FULL && isNetwork && !isOperational) return

        // Use PuntoTGO for network restaurants
        const html = isNetwork
          ? renderPuntoTGOToHTML({
              networkStatus: isOperational ? 'live' : 'dormant',
              isOperational,
              size: 40,
            })
          : pinSvg(
              'var(--tgo-surface-1)',
              false,
              undefined,
              isClosed ? 0.55 : 1,
              false
            )

        const icon = L.divIcon({
          className: '',
          html,
          iconSize: isNetwork ? [40, 40] : [28, 36],
        })

        const marker = L.marker([lat, lng], { icon }).addTo(map)

        if (!isTouch) {
          marker.on('mouseover', () => {
            const point = map.latLngToContainerPoint([lat, lng])
            showCard(r, { x: point.x, y: point.y })
          })
          marker.on('mouseout', hideCard)
          marker.on('click', () => onSelect(r))
        } else {
          marker.on('click', () => setTapped(r))
        }

        markersRef.current.push(marker)
      }
    })
  }, [clearMarkers, isTouch, showCard, hideCard, onSelect])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    let cancelled = false

    import('leaflet').then(L => {
      if (cancelled || !containerRef.current || mapRef.current) return

      const map = L.map(containerRef.current!, {
        zoomControl: false,
        attributionControl: false,
      }).setView([userLat, userLng], 15)

      // CartoDB Voyager with API key (required since 2024)
      // @2x tiles for sharper labels and icons on HiDPI screens
      const cartoKey = process.env.NEXT_PUBLIC_CARTO_API_KEY || ''
      const tileUrl = cartoKey
        ? `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png?api_key=${cartoKey}`
        : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
      const tileLayer = L.tileLayer(tileUrl, {
        maxZoom: 19,
        attribution: cartoKey
          ? '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        crossOrigin: true,
      }).addTo(map)

      // Fallback: if tiles fail, show neutral grey background
      tileLayer.on('tileerror', (e: any) => {
        const tile = e.tile
        if (tile && !tile.dataset.errorHandled) {
          tile.dataset.errorHandled = 'true'
          tile.style.background = 'var(--tgo-surface-2, #f3f4f6)'
          tile.style.opacity = '0.5'
        }
      })

      // User location marker
      const userIcon = L.divIcon({
        className: '',
        html: pulsePinSvg('var(--tgo-brand)'),
        iconSize: [36, 36],
      })
      L.marker([userLat, userLng], { icon: userIcon }).addTo(map)

      // Activity indicators from LiveCityMetrics (Doc 01 §1.2)
      // Small pulsing dots representing live activity in the area
      if (metrics && (metrics.openCount > 0 || metrics.promoCount > 0 || metrics.newCount > 0)) {
        const totalDots = Math.min(metrics.openCount + metrics.promoCount + metrics.newCount, 12)
        const activityIcon = L.divIcon({
          className: '',
          html: `
            <div style="width:8px;height:8px;border-radius:50%;background:var(--tgo-network-live);opacity:0.6;animation:punto-tgo-pulse-dot 2s ease-in-out infinite;"></div>
          `,
          iconSize: [8, 8],
        })

        // Place dots in a random pattern around user location
        const seed = userLat * 1000 + userLng
        for (let i = 0; i < totalDots; i++) {
          const angle = (seed + i * 137.508) * (Math.PI / 180) // Golden angle for distribution
          const radius = 0.002 + (i * 0.0005) // Spread dots outward
          const dotLat = userLat + Math.cos(angle) * radius
          const dotLng = userLng + Math.sin(angle) * radius
          L.marker([dotLat, dotLng], { icon: activityIcon, interactive: false }).addTo(map)
        }
      }

      // Initial render
      renderMarkers(map, L, restaurants)

      // Re-render on zoom/end (handles clustering dynamically)
      map.on('zoomend moveend', () => {
        renderMarkers(map, L, restaurants)
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
  }, [userLat, userLng, restaurants, isTouch, showCard, hideCard, onSelect, renderMarkers])

  return (
    <div className="relative w-full h-full" style={{ backgroundColor: 'var(--tgo-bg)' }}>
      <div ref={containerRef} className="w-full h-full" />

      {/* Contextual capsule — top of map */}
      <MapCapsule restaurants={restaurants} userLat={userLat} userLng={userLng} />

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
          onClick={() => { haptic.selection(); mapRef.current?.zoomIn() }}
          aria-label="Acercar"
          className="w-10 h-10 rounded-xl flex items-center justify-center font-bold active:scale-95"
          style={{
            backgroundColor: 'var(--tgo-surface-1)',
            color: 'var(--tgo-text-primary)',
            border: '1px solid var(--tgo-border)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          }}
        >+</button>
        <button
          onClick={() => { haptic.selection(); mapRef.current?.zoomOut() }}
          aria-label="Alejar"
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
