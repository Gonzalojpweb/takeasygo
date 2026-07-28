'use client'

import { useEffect, useRef, useState } from 'react'
import type { RestaurantCardData } from '@/types/restaurant-card'
import { MapPin, Clock, Phone, Utensils, ExternalLink, ArrowLeft, ShoppingBag, Share2, Navigation, Star, ClockAlert, Heart } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import WeeklySchedule from './WeeklySchedule'
import { getClosingTime, getNextOpenTime } from '@/lib/service-hours'
import { Chip } from '@/components/tgo'
import 'leaflet/dist/leaflet.css'
import { useHaptic } from '@/components/tgo/useHaptic'
import { microcopy } from '@/components/tgo/microcopy'

function getOrCreateSessionId(): string {
  const key = 'tgo_explore_session'
  let sid = sessionStorage.getItem(key)
  if (!sid) { sid = crypto.randomUUID(); sessionStorage.setItem(key, sid) }
  return sid
}

function trackEvent(payload: Record<string, any>) {
  const sid = getOrCreateSessionId()
  fetch('/api/explore/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-session-id': sid },
    body: JSON.stringify({ sessionId: sid, ...payload }),
  }).catch(() => {})
}

function distLabel(m: number | null) {
  if (m === null) return ''
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`
}

async function handleShare(name: string, address: string, tenantSlug?: string) {
  const url = window.location.href
  if (navigator.share) {
    await navigator.share({ title: name, text: `${name} — ${address}`, url })
  } else {
    await navigator.clipboard.writeText(url)
  }
  trackEvent({ eventType: 'share', tenantSlug })
}

function MiniMap({ lat, lng }: { lat: number; lng: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    let cancelled = false
    import('leaflet').then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return
      if ((containerRef.current as any)._leaflet_id) return
      const map = L.map(containerRef.current!, {
        zoomControl: false, attributionControl: false, dragging: false,
        scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false,
      }).setView([lat, lng], 16)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map)
      const icon = L.divIcon({
        className: '',
        html: '<div style="width:16px;height:16px;border-radius:50%;background:#12B76A;border:3px solid #fff;box-shadow:0 0 0 3px rgba(18,183,106,0.4),0 0 16px rgba(18,183,106,0.3)"></div>',
        iconSize: [16, 16], iconAnchor: [8, 8],
      })
      L.marker([lat, lng], { icon }).addTo(map)
      mapRef.current = map
    })
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null } }
  }, [lat, lng])

  return (
    <div ref={containerRef} className="w-full overflow-hidden" style={{ height: 180, borderRadius: 'var(--tgo-radius-lg)', border: '1px solid var(--tgo-border)' }} />
  )
}

interface Props { restaurant: RestaurantCardData }

export default function RestaurantDetail({ restaurant: r }: Props) {
  const router = useRouter()
  const isNetwork = r.type === 'network'
  const [isFavorite, setIsFavorite] = useState(false)
  const haptic = useHaptic()

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--tgo-surface-0)' }}>
      {/* Hero */}
      <div className="relative shrink-0">
        {r.heroImage ? (
          <div className="relative" style={{ height: 280 }}>
            <img src={r.heroImage} alt={r.name} className="w-full h-full object-cover" />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, var(--tgo-surface-0) 0%, rgba(26,26,26,0.6) 40%, transparent 100%)' }} />
          </div>
        ) : (
          <div style={{ height: 200, background: isNetwork ? `linear-gradient(135deg, var(--tgo-surface-0) 0%, ${r.primaryColor || 'var(--tgo-surface-2)'} 50%, var(--tgo-surface-0) 100%)` : 'linear-gradient(135deg, var(--tgo-surface-1) 0%, var(--tgo-surface-2) 100%)' }} />
        )}

        {/* Nav */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between" style={{ padding: 'var(--tgo-safe-top) var(--tgo-page-padding) 0', paddingTop: 'calc(var(--tgo-safe-top) + 16px)' }}>
          <button onClick={() => router.back()} aria-label={microcopy.nav.back} className="flex items-center justify-center" style={{ width: 40, height: 40, borderRadius: 'var(--tgo-radius-md)', backgroundColor: 'rgba(26,26,26,0.48)', backdropFilter: 'blur(12px)', color: 'var(--tgo-text-inverse)' }}>
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-2">
            <button onClick={() => { haptic.selection(); setIsFavorite(v => !v) }} aria-label={isFavorite ? microcopy.restaurant.unfavorite : microcopy.restaurant.favorite} className="flex items-center justify-center" style={{ width: 40, height: 40, borderRadius: 'var(--tgo-radius-md)', backgroundColor: 'rgba(26,26,26,0.48)', backdropFilter: 'blur(12px)', color: isFavorite ? 'var(--tgo-brand-primary)' : 'var(--tgo-text-inverse)' }}>
              <Heart size={18} fill={isFavorite ? 'var(--tgo-brand-primary)' : 'none'} />
            </button>
            <button onClick={() => { haptic.impact('light'); handleShare(r.name, r.address, r.tenantSlug) }} aria-label={microcopy.restaurant.share} className="flex items-center justify-center" style={{ width: 40, height: 40, borderRadius: 'var(--tgo-radius-md)', backgroundColor: 'rgba(26,26,26,0.48)', backdropFilter: 'blur(12px)', color: 'var(--tgo-text-inverse)' }}>
              <Share2 size={17} />
            </button>
          </div>
        </div>

        {/* Logo + Name */}
        <div className="absolute bottom-0 left-0 right-0" style={{ padding: '0 var(--tgo-page-padding) var(--tgo-space-4)' }}>
          <div className="flex items-end gap-3">
            {isNetwork && r.logoUrl && (
              <div className="shrink-0 overflow-hidden" style={{ width: 56, height: 56, borderRadius: 'var(--tgo-radius-md)', border: '3px solid var(--tgo-surface-0)', boxShadow: 'var(--tgo-elevation-floating)' }}>
                <img src={r.logoUrl} alt={r.name} className="w-full h-full object-cover" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 style={{ color: 'var(--tgo-text-inverse)', fontSize: 'var(--tgo-type-title)', fontWeight: 700, lineHeight: 1.2, textShadow: '0 1px 4px rgba(0,0,0,0.3)' }}>{r.name}</h1>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto" style={{ paddingInline: 'var(--tgo-page-padding)', paddingTop: 'var(--tgo-space-4)', paddingBottom: 120 }}>
        {/* Badges */}
        <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 'var(--tgo-space-4)' }}>
          {r.averageRating != null && r.ratingCount != null && r.ratingCount > 0 && (
            <Chip variant="brand" size="sm" icon={<Star size={10} className="fill-current" />}>
              {r.averageRating.toFixed(1)} ({r.ratingCount})
            </Chip>
          )}
          <Chip variant={isNetwork ? 'active' : 'default'} size="sm">
            {isNetwork ? microcopy.restaurant.inNetwork : microcopy.restaurant.directory}
          </Chip>
          {r.isOpenNow === true && (
            <Chip variant="active" size="sm" icon={<span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--tgo-state-success)' }} />}>
              {microcopy.restaurant.open}
            </Chip>
          )}
          {r.isOpenNow === false && (
            <Chip variant="danger" size="sm">{microcopy.restaurant.closed}</Chip>
          )}
          {r.distanceM != null && r.distanceM > 0 && (
            <span style={{ color: 'var(--tgo-text-muted)', fontSize: 'var(--tgo-type-body-sm)' }}>{distLabel(r.distanceM)}</span>
          )}
        </div>

        {/* Info card */}
        <div style={{ padding: 'var(--tgo-card-padding)', borderRadius: 'var(--tgo-radius-xl)', backgroundColor: 'var(--tgo-surface-card)', border: '1px solid var(--tgo-border)', boxShadow: 'var(--tgo-elevation-card)', marginBottom: 'var(--tgo-space-4)' }}>
          <div className="space-y-3">
            <InfoRow icon={<MapPin size={14} />} color="var(--tgo-text-muted)">{r.address}</InfoRow>
            {r.isOpenNow === true && r.serviceHours && (
              <InfoRow icon={<Clock size={14} />} color="var(--tgo-state-success)">
                {(() => { const c = getClosingTime(r.serviceHours!); return c ? microcopy.restaurant.openUntil(c) : microcopy.restaurant.openNow })()}
              </InfoRow>
            )}
            {r.isOpenNow === false && r.serviceHours && (
              <InfoRow icon={<ClockAlert size={14} />} color="var(--tgo-state-danger)">
                {(() => { const n = getNextOpenTime(r.serviceHours!); return n ? microcopy.restaurant.closedUntil(n) : microcopy.restaurant.closedNow })()}
              </InfoRow>
            )}
            {r.openingHours && !r.serviceHours && (
              <InfoRow icon={<Clock size={14} />} color="var(--tgo-text-muted)">{r.openingHours}</InfoRow>
            )}
            {r.serviceHours && (
              <div style={{ paddingLeft: 26 }}>
                <WeeklySchedule serviceHours={r.serviceHours} />
              </div>
            )}
            {r.cuisineTypes && r.cuisineTypes.length > 0 && (
              <InfoRow icon={<Utensils size={14} />} color="var(--tgo-text-muted)">{r.cuisineTypes.join(' · ')}</InfoRow>
            )}
            {r.phone && (
              <InfoRow icon={<Phone size={14} />} color="var(--tgo-text-muted)">{r.phone}</InfoRow>
            )}
            {isNetwork && r.estimatedPickupTime && (
              <InfoRow icon={<Clock size={14} />} color="var(--tgo-state-success)">
                <span style={{ fontWeight: 600 }}>{microcopy.restaurant.readyIn(r.estimatedPickupTime)}</span>
              </InfoRow>
            )}
          </div>
        </div>

        {/* Mini map */}
        {typeof r.lat === 'number' && typeof r.lng === 'number' && (
          <div className="relative" style={{ marginBottom: 'var(--tgo-space-4)' }}>
            <MiniMap lat={r.lat} lng={r.lng} />
            <a href={`https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}`} target="_blank" rel="noopener noreferrer" className="absolute bottom-3 right-3 flex items-center gap-1.5" style={{ padding: '8px 12px', borderRadius: 'var(--tgo-radius-md)', backgroundColor: 'rgba(26,26,26,0.64)', backdropFilter: 'blur(12px)', color: 'var(--tgo-text-inverse)', fontSize: 'var(--tgo-type-caption)', fontWeight: 600 }}>
              <Navigation size={12} />
              {microcopy.restaurant.directions}
            </a>
          </div>
        )}

        {/* Conversion CTA (directory only) */}
        {!isNetwork && (
          <div style={{ padding: 'var(--tgo-space-5)', borderRadius: 'var(--tgo-radius-xl)', backgroundColor: 'var(--tgo-surface-card)', border: '1px solid var(--tgo-border)', textAlign: 'center' }}>
            <p style={{ color: 'var(--tgo-text-primary)', fontSize: 'var(--tgo-type-body-sm)', fontWeight: 600 }}>{microcopy.restaurant.isOwner}</p>
            <p style={{ color: 'var(--tgo-text-muted)', fontSize: 'var(--tgo-type-caption)', lineHeight: 1.5, marginTop: 4 }}>{microcopy.restaurant.ownerPitch}</p>
            <Link href="/#pricing" className="inline-flex items-center gap-1.5 mt-3" style={{ padding: '8px 20px', borderRadius: 'var(--tgo-radius-md)', border: '1.5px solid var(--tgo-state-trust)', color: 'var(--tgo-state-trust)', backgroundColor: 'transparent', fontSize: 'var(--tgo-type-caption)', fontWeight: 700 }}>
              {microcopy.restaurant.ownerCta}
            </Link>
          </div>
        )}
      </div>

      {/* Fixed CTA */}
      <div className="fixed bottom-0 left-0 right-0" style={{ padding: '0 var(--tgo-page-padding) var(--tgo-space-6)', paddingTop: 16, zIndex: 'var(--tgo-z-nav)', background: 'linear-gradient(to top, var(--tgo-surface-0) 60%, transparent)' }}>
        {isNetwork ? (
          <Link href={`/${r.tenantSlug}/menu/${r.id}/takeaway?source=tgo-explore`} onClick={() => { haptic.impact('medium'); trackEvent({ eventType: 'click_menu', restaurantId: r.id, tenantSlug: r.tenantSlug }) }} className="flex items-center justify-center gap-2.5 w-full active:scale-[0.98]" style={{ padding: '16px 24px', borderRadius: 'var(--tgo-radius-lg)', backgroundColor: 'var(--tgo-state-action)', color: 'var(--tgo-text-inverse)', fontSize: 'var(--tgo-type-body)', fontWeight: 700, boxShadow: 'var(--tgo-elevation-floating)', transition: 'transform var(--tgo-duration-fast) var(--tgo-ease-standard)' }}>
            <ShoppingBag size={18} />
            {microcopy.restaurant.viewMenuAndOrder}
          </Link>
        ) : (
          <div className="flex gap-3">
            {r.phone && (
              <a href={`tel:${r.phone}`} className="flex-1 flex items-center justify-center gap-2 active:scale-[0.98]" style={{ padding: '16px 24px', borderRadius: 'var(--tgo-radius-lg)', backgroundColor: 'var(--tgo-surface-card)', border: '1px solid var(--tgo-border)', color: 'var(--tgo-text-primary)', fontSize: 'var(--tgo-type-body-sm)', fontWeight: 700, boxShadow: 'var(--tgo-elevation-card)' }}>
                <Phone size={16} />
                {microcopy.restaurant.call}
              </a>
            )}
            {r.externalMenuUrl && (
              <a href={r.externalMenuUrl} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-2 active:scale-[0.98]" style={{ padding: '16px 24px', borderRadius: 'var(--tgo-radius-lg)', backgroundColor: 'var(--tgo-surface-card)', border: '1px solid var(--tgo-border)', color: 'var(--tgo-text-primary)', fontSize: 'var(--tgo-type-body-sm)', fontWeight: 700, boxShadow: 'var(--tgo-elevation-card)' }}>
                <ExternalLink size={16} />
                {microcopy.restaurant.viewCard}
              </a>
            )}
            {!r.phone && !r.externalMenuUrl && (
              <div className="flex-1 text-center" style={{ padding: '16px 24px', borderRadius: 'var(--tgo-radius-lg)', backgroundColor: 'var(--tgo-surface-2)', color: 'var(--tgo-text-muted)', fontSize: 'var(--tgo-type-body-sm)' }}>
                {microcopy.restaurant.noContact}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function InfoRow({ icon, color, children }: { icon: React.ReactNode; color: string; children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2.5" style={{ color: 'var(--tgo-text-primary)', fontSize: 'var(--tgo-type-body-sm)' }}>
      <span className="shrink-0 mt-0.5" style={{ color }}>{icon}</span>
      {children}
    </p>
  )
}
