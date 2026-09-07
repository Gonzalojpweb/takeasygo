'use client'

// ── RestaurantDetail ─────────────────────────────────────────────────────────
//
// Ficha del Local — Living City System.
// Hero 200px + avatar + pin + anillo + info + mapa + reseñas + CTA fijo.

import { useEffect, useRef, useState } from 'react'
import type { RestaurantCardData } from '@/types/restaurant-card'
import {
  MapPin, Clock, Phone, Utensils, ArrowLeft, ShoppingBag, Share2,
  Star, Heart, Camera, ChevronDown, ChevronUp, ImageIcon,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import WeeklySchedule from './WeeklySchedule'
import { getClosingTime, getNextOpenTime } from '@/lib/service-hours'
import 'leaflet/dist/leaflet.css'
import { useHaptic } from '@/components/tgo/useHaptic'
import { microcopy } from '@/components/tgo/microcopy'
import PuntoTGO, { type LcsFaceExpression, type LcsRingScale } from '@/components/tgo/PuntoTGO'
import { HorizontalScroller } from '@/components/tgo'

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function getIcoRingLabel(ring: LcsRingScale): string | null {
  switch (ring) {
    case 'thin': return 'En formación'
    case 'marked': return 'Consolidando'
    case 'gold': return 'Referente'
    default: return null
  }
}

function getIcoRingColor(ring: LcsRingScale): string {
  switch (ring) {
    case 'thin': return 'var(--tgo-text-muted)'
    case 'marked': return '#FF8C42'
    case 'gold': return 'var(--tgo-state-discovery)'
    default: return 'var(--tgo-text-muted)'
  }
}

// ── MiniMap ──────────────────────────────────────────────────────────────────

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

      const cartoKey = process.env.NEXT_PUBLIC_CARTO_API_KEY || ''
      const tileUrl = cartoKey
        ? `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png?api_key=${cartoKey}`
        : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
      L.tileLayer(tileUrl, { maxZoom: 19 }).addTo(map)

      const icon = L.divIcon({
        className: '',
        html: '<div style="width:16px;height:16px;border-radius:50%;background:var(--tgo-brand,#F74211);border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>',
        iconSize: [16, 16], iconAnchor: [8, 8],
      })
      L.marker([lat, lng], { icon }).addTo(map)
      mapRef.current = map
    })
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null } }
  }, [lat, lng])

  return (
    <div
      ref={containerRef}
      className="w-full overflow-hidden"
      style={{ height: 130, borderRadius: 18, border: '1px solid var(--tgo-border)' }}
    />
  )
}

// ── Review Card ──────────────────────────────────────────────────────────────

interface ReviewData {
  _id: string
  stars: number
  comment: string
  createdAt: string
  customerName?: string
}

function ReviewCard({ review }: { review: ReviewData }) {
  const initials = review.customerName
    ? review.customerName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : 'U'

  return (
    <div
      className="shrink-0"
      style={{
        width: 220,
        padding: '14px',
        borderRadius: 18,
        backgroundColor: 'var(--tgo-surface-2)',
        border: '1px solid var(--tgo-border)',
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className="flex items-center justify-center shrink-0"
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            backgroundColor: 'var(--tgo-surface-1)',
            color: 'var(--tgo-text-muted)',
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="text-[11px] font-semibold truncate"
            style={{ color: 'var(--tgo-text-primary)' }}
          >
            {review.customerName || 'Anónimo'}
          </p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <Star size={10} className="fill-current" style={{ color: 'var(--tgo-state-warning)' }} />
          <span className="text-[11px] font-bold" style={{ color: 'var(--tgo-text-primary)' }}>
            {review.stars}
          </span>
        </div>
      </div>
      {review.comment && (
        <p
          className="text-[11px] leading-relaxed"
          style={{
            color: 'var(--tgo-text-secondary)',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {review.comment}
        </p>
      )}
    </div>
  )
}

// ── InfoRow ──────────────────────────────────────────────────────────────────

function InfoRow({
  icon,
  iconColor = 'var(--tgo-text-muted)',
  action,
  children,
}: {
  icon: React.ReactNode
  iconColor?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p
        className="flex items-center gap-2.5 flex-1 min-w-0"
        style={{ color: 'var(--tgo-text-primary)', fontSize: 13 }}
      >
        <span className="shrink-0" style={{ color: iconColor }}>{icon}</span>
        <span className="truncate">{children}</span>
      </p>
      {action}
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

interface Props {
  restaurant: RestaurantCardData
  reviews?: ReviewData[]
  icoScore?: number | null
  icoRing?: LcsRingScale
  hasCrown?: boolean
  gallery?: string[]
}

export default function RestaurantDetail({
  restaurant: r,
  reviews = [],
  icoScore = null,
  icoRing = 'none',
  hasCrown = false,
  gallery = [],
}: Props) {
  const router = useRouter()
  const isNetwork = r.type === 'network'
  const [isFavorite, setIsFavorite] = useState(false)
  const [showAllHours, setShowAllHours] = useState(false)
  const haptic = useHaptic()

  const hasIcoRing = icoRing !== 'none'
  const icoRingLabel = getIcoRingLabel(icoRing)
  const icoRingColor = getIcoRingColor(icoRing)

  const faceExpression: LcsFaceExpression = r.isOpenNow === true ? 'happy' : 'sleepy'

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--tgo-surface-0)' }}>
      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <div className="relative shrink-0" style={{ height: 200 }}>
        {r.heroImageUrl || r.heroImage ? (
          <>
            <img
              src={r.heroImageUrl || r.heroImage}
              alt={r.name}
              className="w-full h-full object-cover"
            />
            <div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(to top, var(--tgo-surface-0) 0%, rgba(0,0,0,0.2) 100%)' }}
            />
          </>
        ) : (
          <div
            className="w-full h-full"
            style={{
              background: isNetwork
                ? `linear-gradient(135deg, ${r.primaryColor || 'var(--tgo-brand)'} 0%, ${r.primaryColor || 'var(--tgo-brand)'}cc 100%)`
                : 'linear-gradient(135deg, var(--tgo-surface-1) 0%, var(--tgo-surface-2) 100%)',
            }}
          />
        )}

        {/* Floating nav buttons */}
        <div
          className="absolute top-0 left-0 right-0 flex items-center justify-between z-10"
          style={{
            padding: '12px 16px',
            paddingTop: 'max(12px, env(safe-area-inset-top))',
          }}
        >
          <button
            onClick={() => router.back()}
            aria-label="Volver"
            className="flex items-center justify-center"
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              backgroundColor: 'rgba(255,255,255,0.92)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
              color: 'var(--tgo-text-primary)',
            }}
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { haptic.selection(); setIsFavorite(v => !v) }}
              aria-label="Favorito"
              className="flex items-center justify-center"
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                backgroundColor: 'rgba(255,255,255,0.92)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                color: isFavorite ? 'var(--tgo-brand)' : 'var(--tgo-text-primary)',
              }}
            >
              <Heart size={17} fill={isFavorite ? 'var(--tgo-brand)' : 'none'} />
            </button>
            <button
              onClick={() => { haptic.impact('light'); handleShare(r.name, r.address, r.tenantSlug) }}
              aria-label="Compartir"
              className="flex items-center justify-center"
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                backgroundColor: 'rgba(255,255,255,0.92)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                color: 'var(--tgo-text-primary)',
              }}
            >
              <Share2 size={16} />
            </button>
          </div>
        </div>

        {/* Gallery chip */}
        {gallery.length > 0 && (
          <div
            className="absolute bottom-3 right-4 z-10 flex items-center gap-1"
            style={{
              padding: '5px 10px',
              borderRadius: 8,
              backgroundColor: 'rgba(0,0,0,0.65)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <ImageIcon size={13} color="#fff" />
            <span style={{ color: '#fff', fontSize: 11, fontWeight: 600 }}>
              {gallery.length} foto{gallery.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* ── SCROLLABLE CONTENT ────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ paddingBottom: 100 }}
      >
        {/* Avatar + Pin + Ring */}
        <div className="relative" style={{ marginTop: -38, paddingInline: 20 }}>
          <div className="relative inline-block">
            {/* Avatar */}
            <div
              className="flex items-center justify-center overflow-hidden"
              style={{
                width: 76,
                height: 76,
                borderRadius: 22,
                backgroundColor: r.primaryColor || 'var(--tgo-surface-2)',
                border: '3px solid var(--tgo-surface-0)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              }}
            >
              {r.logoUrl ? (
                <img src={r.logoUrl} alt={r.name} className="w-full h-full object-cover" />
              ) : (
                <span style={{ color: '#fff', fontSize: 24, fontWeight: 700 }}>
                  {r.name.charAt(0)}
                </span>
              )}
            </div>
            {/* PuntoTGO badge */}
            <div className="absolute" style={{ bottom: -4, right: -6 }}>
              <PuntoTGO
                expression={faceExpression}
                ring={icoRing}
                hasCrown={hasCrown}
                size="sm"
              />
            </div>
          </div>
        </div>

        {/* Name + Category */}
        <div style={{ paddingInline: 20, marginTop: 12 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--tgo-text-primary)', lineHeight: 1.2 }}>
            {r.name}
          </h1>
          {r.cuisineTypes && r.cuisineTypes.length > 0 && (
            <p style={{ fontSize: 12.5, color: 'var(--tgo-text-muted)', marginTop: 2 }}>
              {r.cuisineTypes[0]}{r.cuisineTypes.length > 1 ? ` · ${r.cuisineTypes[1]}` : ''}
            </p>
          )}
        </div>

        {/* Trust row — stars | ring | status */}
        <div
          className="flex items-center gap-0 flex-wrap"
          style={{ paddingInline: 20, marginTop: 12 }}
        >
          {/* Stars */}
          {r.averageRating != null && r.ratingCount != null && r.ratingCount > 0 && (
            <div className="flex items-center gap-1">
              <Star size={13} className="fill-current" style={{ color: 'var(--tgo-state-warning)' }} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--tgo-text-primary)' }}>
                {r.averageRating.toFixed(1)}
              </span>
              <span style={{ fontSize: 12, color: 'var(--tgo-text-muted)' }}>
                ({r.ratingCount} reseñas)
              </span>
            </div>
          )}

          {/* Divider */}
          {r.averageRating != null && hasIcoRing && (
            <div style={{ width: 1, height: 14, backgroundColor: 'var(--tgo-border)', margin: '0 8px' }} />
          )}

          {/* Ring label */}
          {hasIcoRing && icoRingLabel && (
            <div className="flex items-center gap-1">
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: icoRingColor,
                }}
              />
              <span style={{ fontSize: 12, fontWeight: 600, color: icoRingColor }}>
                {icoRingLabel}
              </span>
            </div>
          )}

          {/* Divider */}
          {((r.averageRating != null && r.ratingCount != null) || hasIcoRing) && (
            <div style={{ width: 1, height: 14, backgroundColor: 'var(--tgo-border)', margin: '0 8px' }} />
          )}

          {/* Status */}
          {r.isOpenNow === true && (
            <div className="flex items-center gap-1">
              <div
                className="animate-pulse"
                style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: 'var(--tgo-state-activity)' }}
              />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tgo-state-activity)' }}>
                Abierto ahora
              </span>
            </div>
          )}
          {r.isOpenNow === false && (
            <div className="flex items-center gap-1">
              <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: 'var(--tgo-text-muted)' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tgo-text-muted)' }}>
                Cerrado
              </span>
            </div>
          )}
        </div>

        {/* ── INFO CARD ────────────────────────────────────────────────── */}
        <div
          style={{
            marginInline: 20,
            marginTop: 20,
            padding: 16,
            borderRadius: 20,
            backgroundColor: 'var(--tgo-card)',
            border: '1px solid var(--tgo-border)',
          }}
        >
          <div className="space-y-3.5">
            {/* Address */}
            <InfoRow icon={<MapPin size={17} />}>
              {r.address}
            </InfoRow>

            {/* Hours */}
            {r.isOpenNow === true && r.serviceHours && (
              <InfoRow
                icon={<Clock size={17} />}
                iconColor="var(--tgo-state-activity)"
                action={
                  <button
                    onClick={() => setShowAllHours(v => !v)}
                    className="flex items-center gap-0.5 shrink-0"
                    style={{ color: 'var(--tgo-text-muted)', fontSize: 11, fontWeight: 600 }}
                  >
                    Ver horarios
                    {showAllHours ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                }
              >
                {(() => { const c = getClosingTime(r.serviceHours!); return c ? `Abierto — Cierra a las ${c}` : 'Abierto ahora' })()}
              </InfoRow>
            )}
            {r.isOpenNow === false && r.serviceHours && (
              <InfoRow icon={<Clock size={17} />} iconColor="var(--tgo-text-muted)">
                {(() => { const n = getNextOpenTime(r.serviceHours!); return n ? `Cierra — Abre ${n}` : 'Cerrado' })()}
              </InfoRow>
            )}
            {r.openingHours && !r.serviceHours && (
              <InfoRow icon={<Clock size={17} />}>{r.openingHours}</InfoRow>
            )}

            {/* Expanded schedule */}
            {showAllHours && r.serviceHours && (
              <div style={{ paddingLeft: 26 }}>
                <WeeklySchedule serviceHours={r.serviceHours} />
              </div>
            )}

            {/* Category */}
            {r.cuisineTypes && r.cuisineTypes.length > 0 && (
              <InfoRow icon={<Utensils size={17} />}>
                {r.cuisineTypes.join(' · ')}
              </InfoRow>
            )}

            {/* Phone */}
            {r.phone && (
              <InfoRow icon={<Phone size={17} />}>{r.phone}</InfoRow>
            )}

            {/* Prep time — in Brand color */}
            {isNetwork && r.estimatedPickupTime && (
              <InfoRow
                icon={<Clock size={17} />}
                iconColor="var(--tgo-brand)"
              >
                <span style={{ fontWeight: 600, color: 'var(--tgo-brand)' }}>
                  Listo en ~{r.estimatedPickupTime} min
                </span>
              </InfoRow>
            )}
          </div>
        </div>

        {/* ── MAP ──────────────────────────────────────────────────────── */}
        {typeof r.lat === 'number' && typeof r.lng === 'number' && (
          <div style={{ marginInline: 20, marginTop: 20 }}>
            <MiniMap lat={r.lat} lng={r.lng} />
          </div>
        )}

        {/* ── REVIEWS ──────────────────────────────────────────────────── */}
        {reviews.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div className="flex items-center justify-between" style={{ paddingInline: 20, marginBottom: 12 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--tgo-text-primary)' }}>
                Reseñas
              </h2>
              {reviews.length > 3 && (
                <button
                  style={{ fontSize: 12, fontWeight: 600, color: 'var(--tgo-brand)' }}
                >
                  Ver todas
                </button>
              )}
            </div>
            <HorizontalScroller>
              {reviews.slice(0, 3).map((review) => (
                <ReviewCard key={review._id} review={review} />
              ))}
            </HorizontalScroller>
          </div>
        )}

        {/* Bottom spacer */}
        <div style={{ height: 20 }} />
      </div>

      {/* ── FIXED CTA ──────────────────────────────────────────────────── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-[1000]"
        style={{
          padding: '12px 20px',
          paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
          background: 'linear-gradient(to top, var(--tgo-surface-0) 60%, transparent)',
        }}
      >
        {isNetwork ? (
          <Link
            href={`/${r.tenantSlug}/menu/${r.id}/takeaway?source=tgo-explore`}
            onClick={() => {
              haptic.impact('medium')
              trackEvent({ eventType: 'click_menu', restaurantId: r.id, tenantSlug: r.tenantSlug })
            }}
            className="flex items-center justify-center gap-2.5 w-full active:scale-[0.98] transition-transform"
            style={{
              padding: '16px 24px',
              borderRadius: 16,
              backgroundColor: 'var(--tgo-brand)',
              color: '#FFFFFF',
              fontSize: 15,
              fontWeight: 700,
              boxShadow: '0 4px 16px rgba(247,66,17,0.3)',
            }}
          >
            <ShoppingBag size={18} />
            Ver menú y pedir
          </Link>
        ) : (
          <div className="flex gap-3">
            {r.phone && (
              <a
                href={`tel:${r.phone}`}
                className="flex-1 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                style={{
                  padding: '14px 20px',
                  borderRadius: 16,
                  backgroundColor: 'var(--tgo-card)',
                  border: '1px solid var(--tgo-border)',
                  color: 'var(--tgo-text-primary)',
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                <Phone size={16} />
                Llamar
              </a>
            )}
            {r.externalMenuUrl && (
              <a
                href={r.externalMenuUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                style={{
                  padding: '14px 20px',
                  borderRadius: 16,
                  backgroundColor: 'var(--tgo-card)',
                  border: '1px solid var(--tgo-border)',
                  color: 'var(--tgo-text-primary)',
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                Ver carta
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
