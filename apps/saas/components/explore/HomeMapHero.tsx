'use client'

// ── HomeMapHero ──────────────────────────────────────────────────────────────
//
// Mapa como protagonista de Home (Doc 01 §1.1).
// El mapa ocupa la parte superior de la pantalla, con contenido scrollable debajo.

import { useEffect, useRef, useState } from 'react'
import type { RestaurantCardData } from '@/types/restaurant-card'
import 'leaflet/dist/leaflet.css'
import { useHaptic } from '@/components/tgo/useHaptic'
import PuntoTGO, { type NetworkStatus } from '@/components/tgo/PuntoTGO'

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

// PuntoTGO to HTML string for Leaflet divIcon
function renderPinToHTML({
  networkStatus,
  isOperational = true,
  size = 36,
}: {
  networkStatus: NetworkStatus
  isOperational?: boolean
  size?: number
}) {
  const isLive = networkStatus === 'live' && isOperational
  const height = Math.round(size * 1.3)
  const useGradient = isLive
  const pinFill = useGradient ? 'url(#heroPinGradient)' : 'var(--tgo-network-dormant, #9CA3AF)'
  const eyeY = isLive ? 16 : 17
  const eyeRadius = isLive ? 1.8 : 1.5
  const mouthPath = isLive
    ? 'M17 21 Q20 24 23 21'
    : 'M17 22 L23 22'
  const pulseStyle = isLive
    ? 'animation: punto-tgo-pulse 2s ease-in-out infinite;'
    : ''

  return `
    <div style="transform:translate(-${size / 2}px, -${height}px); ${pulseStyle}">
      <svg width="${size}" height="${height}" viewBox="0 0 40 52" fill="none" xmlns="http://www.w3.org/2000/svg"
           style="filter:drop-shadow(0 3px 6px rgba(0,0,0,0.25));">
        <defs>
          <linearGradient id="heroPinGradient" x1="20" y1="0" x2="20" y2="52" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#FFB347"/>
            <stop offset="50%" stop-color="#FF8C42"/>
            <stop offset="100%" stop-color="#F74211"/>
          </linearGradient>
        </defs>
        <path d="M20 52C20 52 40 36 40 22C40 10 31 0 20 0C9 0 0 10 0 22C0 36 20 52 20 52Z" fill="${pinFill}"/>
        <circle cx="20" cy="20" r="12" fill="white"/>
        <circle cx="15" cy="${eyeY}" r="${eyeRadius}" fill="#2D2A4B"/>
        <circle cx="25" cy="${eyeY}" r="${eyeRadius}" fill="#2D2A4B"/>
        <path d="${mouthPath}" stroke="#2D2A4B" stroke-width="1.5" stroke-linecap="round" fill="none"/>
      </svg>
    </div>`
}

// User location pulse
function userPulseSvg() {
  return `
    <div style="position:relative;width:28px;height:28px;display:flex;align-items:center;justify-content:center;transform:translate(-14px,-14px)">
      <div style="position:absolute;width:28px;height:28px;border-radius:50%;background:var(--tgo-brand);opacity:0.25;animation:pulse 2s cubic-bezier(0.4,0,0.6,1) infinite;"></div>
      <div style="width:12px;height:12px;border-radius:50%;background:var(--tgo-brand);border:2.5px solid white;box-shadow:0 0 10px var(--tgo-brand);position:relative;z-index:1;"></div>
    </div>
    <style>@keyframes pulse{0%,100%{transform:scale(1);opacity:0.25}50%{transform:scale(1.8);opacity:0}}</style>`
}

export default function HomeMapHero({ userLat, userLng, restaurants, onSelect, metrics }: Props) {
  const haptic = useHaptic()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    let cancelled = false

    import('leaflet').then(L => {
      if (cancelled || !containerRef.current || mapRef.current) return

      const map = L.map(containerRef.current!, {
        zoomControl: false,
        attributionControl: false,
      }).setView([userLat, userLng], 15)

      // CartoDB Voyager with API key
      const cartoKey = process.env.NEXT_PUBLIC_CARTO_API_KEY || ''
      const tileUrl = cartoKey
        ? `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png?api_key=${cartoKey}`
        : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
      L.tileLayer(tileUrl, {
        maxZoom: 19,
        crossOrigin: true,
      }).addTo(map)

      // User location
      const userIcon = L.divIcon({
        className: '',
        html: userPulseSvg(),
        iconSize: [28, 28],
      })
      L.marker([userLat, userLng], { icon: userIcon }).addTo(map)

      // Activity dots from metrics
      if (metrics && (metrics.openCount > 0 || metrics.promoCount > 0)) {
        const totalDots = Math.min(metrics.openCount + metrics.promoCount, 8)
        const activityIcon = L.divIcon({
          className: '',
          html: `<div style="width:6px;height:6px;border-radius:50%;background:var(--tgo-network-live);opacity:0.5;animation:pulse 2s ease-in-out infinite;"></div>`,
          iconSize: [6, 6],
        })
        const seed = userLat * 1000 + userLng
        for (let i = 0; i < totalDots; i++) {
          const angle = (seed + i * 137.508) * (Math.PI / 180)
          const radius = 0.0015 + (i * 0.0004)
          L.marker([
            userLat + Math.cos(angle) * radius,
            userLng + Math.sin(angle) * radius,
          ], { icon: activityIcon, interactive: false }).addTo(map)
        }
      }

      // Restaurant pins
      const valid = restaurants.filter(r => r.lat !== null && r.lng !== null)
      valid.forEach(r => {
        const isNetwork = r.type === 'network'
        const isOperational = r.isOperational ?? true
        const isClosed = r.isOpenNow === false

        if (!isNetwork) return // Only show network pins in hero

        const icon = L.divIcon({
          className: '',
          html: renderPinToHTML({
            networkStatus: isOperational ? 'live' : 'dormant',
            isOperational,
            size: 36,
          }),
          iconSize: [36, 48],
        })

        const marker = L.marker([r.lat!, r.lng!], { icon }).addTo(map)
        marker.on('click', () => {
          haptic.impact('light')
          onSelect(r)
        })
        markersRef.current.push(marker)
      })

      mapRef.current = map
    })

    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [userLat, userLng, restaurants, onSelect, metrics, haptic])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        minHeight: 280,
        borderRadius: 'var(--tgo-radius-xl)',
        overflow: 'hidden',
        border: '1px solid var(--tgo-border)',
      }}
    />
  )
}
