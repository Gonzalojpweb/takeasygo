'use client'

// ── HomeMapHero ──────────────────────────────────────────────────────────────
//
// Mapa vivo en Home estilo Waze.
// Ocupa la parte superior del Home, con overlay de saludo y métricas.
// Los pines se muestran en vivo con PuntoTGO.

import { useEffect, useRef, useState } from 'react'
import type { RestaurantCardData } from '@/types/restaurant-card'
import 'leaflet/dist/leaflet.css'
import { useHaptic } from '@/components/tgo/useHaptic'
import Supercluster from 'supercluster'
import { type NetworkStatus } from '@/components/tgo/PuntoTGO'
import { SmartGreeting } from '@/components/tgo'
import { useSession } from 'next-auth/react'
import Image from 'next/image'
import { Sun, Moon, Navigation, ChevronRight } from 'lucide-react'

interface Props {
  userLat: number
  userLng: number
  restaurants: RestaurantCardData[]
  onSelect: (r: RestaurantCardData) => void
  openCount: number
  onSeeAll?: () => void
}

// ── PuntoTGO to HTML string (for L.divIcon) ──────────────────────────────────

function renderPuntoTGOToHTML({
  expression = 'happy',
  ring = 'none',
  hasCrown = false,
  isNew = false,
  size = 36,
}: {
  expression?: 'happy' | 'sleepy' | 'wink'
  ring?: 'none' | 'thin' | 'marked' | 'gold'
  hasCrown?: boolean
  isNew?: boolean
  size?: number
}) {
  const height = Math.round(size * 1.3)
  const isSleepy = expression === 'sleepy'
  const pinFill = isSleepy ? '#9CA3AF' : 'url(#puntoTgoGradientHome)'

  let faceSvg = ''
  if (expression === 'wink') {
    faceSvg = `
      <circle cx="15" cy="16" r="1.8" fill="#2D2A4B"/>
      <path d="M23 15.5 Q25 14 27 15.5" stroke="#2D2A4B" stroke-width="1.8" stroke-linecap="round" fill="none"/>
      <path d="M17 21 Q20 25 23 21" stroke="#2D2A4B" stroke-width="1.6" stroke-linecap="round" fill="none"/>
    `
  } else if (expression === 'sleepy') {
    faceSvg = `
      <path d="M13.5 16.5 L16.5 16.5" stroke="#2D2A4B" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M23.5 16.5 L26.5 16.5" stroke="#2D2A4B" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M17.5 21 L22.5 21" stroke="#2D2A4B" stroke-width="1.5" stroke-linecap="round" fill="none"/>
    `
  } else {
    faceSvg = `
      <circle cx="15" cy="16" r="1.8" fill="#2D2A4B"/>
      <circle cx="25" cy="16" r="1.8" fill="#2D2A4B"/>
      <path d="M17 21 Q20 24.5 23 21" stroke="#2D2A4B" stroke-width="1.6" stroke-linecap="round" fill="none"/>
    `
  }

  let ringSvg = ''
  if (ring === 'thin') {
    ringSvg = `<ellipse cx="20" cy="49" rx="14" ry="3.5" fill="none" stroke="#94A3B8" stroke-width="1.5" opacity="0.8"/>`
  } else if (ring === 'marked') {
    ringSvg = `<ellipse cx="20" cy="49" rx="15" ry="4" fill="none" stroke="#FF8C42" stroke-width="2.5"/>`
  } else if (ring === 'gold') {
    ringSvg = `<ellipse cx="20" cy="49" rx="16" ry="4.5" fill="none" stroke="url(#puntoTgoGoldRingHomeHero)" stroke-width="3.2" style="filter:drop-shadow(0 0 3px rgba(255, 215, 0, 0.7));"/>`
  }

  let crownSvg = ''
  if (hasCrown) {
    crownSvg = `
      <g style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
        <path d="M12 4 L14.5 8.5 L20 2 L25.5 8.5 L28 4 L26.5 11 L13.5 11 Z" fill="url(#puntoTgoCrownHomeHero)" stroke="#B45309" stroke-width="0.8" stroke-linejoin="round"/>
        <circle cx="12" cy="3.5" r="0.9" fill="#FFF"/>
        <circle cx="20" cy="1.5" r="1.1" fill="#FFF"/>
        <circle cx="28" cy="3.5" r="0.9" fill="#FFF"/>
      </g>
    `
  }

  const breatheStyle = !isSleepy ? 'animation: punto-tgo-breathe 2.5s ease-in-out infinite;' : ''

  return `
    <div style="transform:translate(-${size / 2}px, -${height}px); ${breatheStyle}">
      <svg width="${size}" height="${height}" viewBox="0 0 40 54" fill="none" xmlns="http://www.w3.org/2000/svg"
           style="filter:drop-shadow(0 4px 8px rgba(0,0,0,0.25)); overflow:visible;">
        <defs>
          <linearGradient id="puntoTgoGradientHome" x1="20" y1="0" x2="20" y2="52" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#FFB347"/>
            <stop offset="50%" stop-color="#FF8C42"/>
            <stop offset="100%" stop-color="#F74211"/>
          </linearGradient>
          <linearGradient id="puntoTgoGoldRingHomeHero" x1="0" y1="49" x2="40" y2="49" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#FFE259"/>
            <stop offset="50%" stop-color="#FFA751"/>
            <stop offset="100%" stop-color="#FFD700"/>
          </linearGradient>
          <linearGradient id="puntoTgoCrownHomeHero" x1="12" y1="2" x2="28" y2="11" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#FDE047"/>
            <stop offset="100%" stop-color="#CA8A04"/>
          </linearGradient>
        </defs>

        ${ringSvg}

        <path d="M20 52C20 52 40 36 40 22C40 10 31 0 20 0C9 0 0 10 0 22C0 36 20 52 20 52Z" fill="${pinFill}"/>

        <circle cx="20" cy="20" r="12" fill="white"/>

        ${faceSvg}
        ${crownSvg}
      </svg>
    </div>`
}

export default function HomeMapHero({
  userLat,
  userLng,
  restaurants,
  onSelect,
  openCount,
  onSeeAll,
}: Props) {
  const { data: session } = useSession()
  const haptic = useHaptic()
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const [mapReady, setMapReady] = useState(false)

  const hour = new Date().getHours()
  const isDay = hour >= 6 && hour < 19

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return

    let cancelled = false

    const init = async () => {
      const L = (await import('leaflet')).default

      if (cancelled || !mapRef.current) return

      const CARTO_API_KEY = process.env.NEXT_PUBLIC_CARTO_API_KEY
      const tileUrl = CARTO_API_KEY
        ? `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png?api_key=${CARTO_API_KEY}`
        : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

      const map = L.map(mapRef.current, {
        center: [userLat, userLng],
        zoom: 15,
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: false,
        dragging: false,
        doubleClickZoom: false,
        touchZoom: false,
      })

      L.tileLayer(tileUrl, {
        maxZoom: 19,
        errorTileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      }).addTo(map)

      mapInstanceRef.current = map
      setMapReady(true)
    }

    init()

    return () => {
      cancelled = true
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [userLat, userLng])

  // Add markers when restaurants change
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return
    const L = require('leaflet')
    const map = mapInstanceRef.current

    // Clear existing markers
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    if (restaurants.length === 0) return

    const valid = restaurants.filter(r => r.lat !== null && r.lng !== null)
    if (valid.length === 0) return

    const cluster = new Supercluster({ radius: 60, maxZoom: 17 })
    cluster.load(
      valid.map((r) => ({
        type: 'Feature' as const,
        properties: { id: r.id, type: r.type },
        geometry: {
          type: 'Point' as const,
          coordinates: [r.lng!, r.lat!],
        },
      })) as any
    )

    const bounds = map.getBounds()
    const bbox: [number, number, number, number] = [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
    ]

    let features: any[]
    try {
      features = cluster.getClusters(bbox, map.getZoom())
    } catch {
      features = valid.map((r) => ({
        type: 'Feature' as const,
        properties: { id: r.id, type: r.type },
        geometry: { type: 'Point' as const, coordinates: [r.lng!, r.lat!] },
      }))
    }

    features.forEach((f: any) => {
      const isCluster = f.properties.cluster
      const r = valid.find(
        (rest) => rest.id === (isCluster ? null : f.properties.id)
      )

      if (isCluster) {
        const count = f.properties.point_count
        const size = count < 10 ? 44 : 56
        const fontSize = count < 10 ? 16 : 14
        const ox = count < 10 ? -22 : -28
        const oy = count < 10 ? -22 : -28

        const html = `
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

        const icon = L.divIcon({
          html,
          className: '',
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        })

        const marker = L.marker(
          [f.geometry.coordinates[1], f.geometry.coordinates[0]],
          { icon }
        ).addTo(map)

        marker.on('click', () => {
          map.flyTo(
            [f.geometry.coordinates[1], f.geometry.coordinates[0]],
            Math.min(map.getZoom() + 2, 18),
            { duration: 0.8 }
          )
        })

        markersRef.current.push(marker)
        return
      }

      if (!r) return

      const isNetwork = r.type === 'network'
      const isOperational = r.isOperational ?? true
      const isClosed = r.isOpenNow === false

      // LCS v1.0 Face Expression Derivation
      const hasWink = r.hasWinkOffer === true || r.loyaltyInfo?.hasActivePromo === true
      const isResting = isClosed || !isOperational || !r.acceptsOrders || !isNetwork
      const expression = isResting ? 'sleepy' : (hasWink ? 'wink' : 'happy')

      const html = renderPuntoTGOToHTML({
        expression,
        ring: r.icoRing ?? 'none',
        hasCrown: r.hasCrown ?? false,
        isNew: r.isNew ?? false,
        size: 36,
      })

      const icon = L.divIcon({
        html,
        className: '',
        iconSize: [36, 47],
        iconAnchor: [18, 47],
      })

      const marker = L.marker([r.lat, r.lng], { icon }).addTo(map)
      marker.on('click', () => {
        haptic.impact('light')
        onSelect(r)
      })

      markersRef.current.push(marker)
    })
  }, [restaurants, mapReady, onSelect, haptic])

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{
        height: '45vh',
        minHeight: 280,
        maxHeight: 400,
        borderRadius: 'var(--tgo-radius-2xl)',
        margin: '0 var(--tgo-page-padding)',
        width: 'calc(100% - 2 * var(--tgo-page-padding, 20px))',
      }}
    >
      {/* Map container */}
      <div
        ref={mapRef}
        className="absolute inset-0"
        style={{ borderRadius: 'var(--tgo-radius-2xl)' }}
      />

      {/* Gradient overlay top */}
      <div
        className="absolute inset-x-0 top-0 pointer-events-none"
        style={{
          height: 100,
          background: 'linear-gradient(to bottom, var(--tgo-surface-0) 0%, transparent 100%)',
          borderRadius: 'var(--tgo-radius-2xl) var(--tgo-radius-2xl) 0 0',
        }}
      />

      {/* Top bar: TGO icon + Avatar */}
      <div
        className="absolute inset-x-0 top-0 flex items-center justify-between pointer-events-none"
        style={{
          padding: '12px var(--tgo-page-padding)',
          zIndex: 10,
        }}
      >
        <div className="pointer-events-auto">
          <Image src="/tgoicon.png" alt="TGO" width={28} height={28} unoptimized />
        </div>
        <button
          className="pointer-events-auto"
          onClick={() => window.location.href = '/app/profile'}
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            overflow: 'hidden',
            border: '2px solid white',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            background: session?.user?.image ? 'transparent' : 'var(--tgo-brand)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          {session?.user?.image ? (
            <Image
              src={session.user.image}
              alt=""
              width={36}
              height={36}
              className="object-cover"
              unoptimized
            />
          ) : (
            <span style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 700, lineHeight: 1 }}>
              {session?.user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </span>
          )}
        </button>
      </div>

      {/* Center: Greeting overlay */}
      <div
        className="absolute inset-x-0 top-14 flex flex-col items-center pointer-events-none"
        style={{ zIndex: 10 }}
      >
        <div
          className="flex items-center gap-2 px-4 py-2"
          style={{
            backgroundColor: 'rgba(255,255,255,0.92)',
            borderRadius: 'var(--tgo-radius-pill)',
            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
            backdropFilter: 'blur(12px)',
          }}
        >
          {isDay ? (
            <Sun size={14} style={{ color: 'var(--tgo-brand)' }} />
          ) : (
            <Moon size={14} style={{ color: 'var(--tgo-state-trust)' }} />
          )}
          <SmartGreeting
            userName={session?.user?.name?.split(' ')[0] || ''}
            interval={10000}
          />
        </div>
      </div>

      {/* Bottom: Live count badge */}
      <div
        className="absolute inset-x-0 bottom-0 pointer-events-none"
        style={{
          padding: '0 var(--tgo-page-padding) 12px',
          zIndex: 10,
        }}
      >
        <div className="flex justify-center">
          <div
            className="flex items-center gap-2 px-3 py-1.5 pointer-events-auto cursor-pointer"
            onClick={() => {
              haptic.impact('light')
              onSeeAll?.()
            }}
            style={{
              backgroundColor: 'rgba(255,255,255,0.95)',
              borderRadius: 'var(--tgo-radius-pill)',
              boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <Navigation size={12} style={{ color: 'var(--tgo-brand)' }} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--tgo-text-primary)',
              }}
            >
              {openCount} abiertos cerca
            </span>
            <ChevronRight size={12} style={{ color: 'var(--tgo-text-muted)' }} />
          </div>
        </div>
      </div>
    </div>
  )
}
