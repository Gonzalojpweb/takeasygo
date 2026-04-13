'use client'

import { useEffect, useRef } from 'react'
import type { NearbyRestaurant } from '@/app/api/explore/nearby/route'
import { MapPin, Clock, Phone, Utensils, ExternalLink, ArrowLeft, ShoppingBag, Share2, Navigation } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BlurFade } from '@/components/ui/blur-fade'
import 'leaflet/dist/leaflet.css'

interface Props {
  restaurant: NearbyRestaurant
}

function distLabel(m: number) {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`
}

function MiniMap({ lat, lng, name }: { lat: number; lng: number; name: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    let cancelled = false

    import('leaflet').then(L => {
      if (cancelled || !containerRef.current || mapRef.current) return
      if ((containerRef.current as any)._leaflet_id) return

      const map = L.map(containerRef.current!, {
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: false,
      }).setView([lat, lng], 16)

      // Dark tile layer for coherence
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
      }).addTo(map)

      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width:16px;height:16px;border-radius:50%;
          background:#10b981;border:3px solid #0d0b0a;
          box-shadow:0 0 0 3px rgba(16,185,129,0.4), 0 0 16px rgba(16,185,129,0.3);
        "></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      })
      L.marker([lat, lng], { icon }).addTo(map)

      mapRef.current = map
    })

    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={containerRef}
      className="w-full rounded-2xl overflow-hidden border border-[var(--c-border)]"
      style={{ height: 180 }}
    />
  )
}

async function handleShare(name: string, address: string) {
  const url = window.location.href
  if (navigator.share) {
    await navigator.share({ title: name, text: `${name} — ${address}`, url })
  } else {
    await navigator.clipboard.writeText(url)
  }
}

export default function RestaurantDetail({ restaurant: r }: Props) {
  const router = useRouter()
  const isNetwork = r.type === 'network'
  const hasCoords = typeof r.lat === 'number' && typeof r.lng === 'number'

  return (
    <div className="flex flex-col h-full consumer-dark">

      {/* ── Hero area / Top bar ─────────────────────────────────────── */}
      <div className="relative shrink-0">
        {/* Background */}
        {r.heroImage ? (
          <div className="relative h-48">
            <img src={r.heroImage} alt={r.name} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0d0b0a] via-[#0d0b0a]/60 to-transparent" />
          </div>
        ) : (
          <div className="h-32" style={{
            background: isNetwork
              ? `linear-gradient(135deg, #0d0b0a 0%, ${r.primaryColor || '#1a1816'} 50%, #0d0b0a 100%)`
              : 'linear-gradient(135deg, #1a1816, #242220)'
          }} />
        )}

        {/* Top buttons */}
        <div className="absolute top-0 left-0 right-0 safe-area-top px-4 pt-4 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="flex items-center justify-center w-9 h-9 rounded-xl cursor-pointer transition-colors"
            style={{ background: 'rgba(13,11,10,0.6)', backdropFilter: 'blur(12px)' }}
          >
            <ArrowLeft size={16} className="text-white" />
          </button>
          <button
            onClick={() => handleShare(r.name, r.address)}
            className="flex items-center justify-center w-9 h-9 rounded-xl cursor-pointer transition-colors"
            style={{ background: 'rgba(13,11,10,0.6)', backdropFilter: 'blur(12px)' }}
            title="Compartir"
          >
            <Share2 size={15} className="text-white" />
          </button>
        </div>

        {/* Name overlay */}
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-4">
          <div className="flex items-end gap-3">
            {isNetwork && r.logoUrl && (
              <div className="shrink-0 w-14 h-14 rounded-xl overflow-hidden border-2 border-[var(--c-bg)] shadow-lg">
                <img src={r.logoUrl} alt={r.name} className="w-full h-full object-cover" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="font-bold text-white text-xl leading-tight drop-shadow-md">{r.name}</h1>
            </div>
          </div>
        </div>
      </div>

      {/* ── Scrollable content ─────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-28">

        {/* Badges */}
        <BlurFade delay={0.05} inView>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${
              isNetwork
                ? 'bg-[#10b981]/10 text-[#10b981] border-[#10b981]/25'
                : 'bg-white/5 text-[#8a7f7a] border-white/10'
            }`}>
              {isNetwork ? '● En Red TakeasyGO' : '○ Directorio'}
            </span>
            {r.isOpenNow === true && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/25">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse mr-1 align-middle" />
                Abierto ahora
              </span>
            )}
            {r.isOpenNow === false && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/25">
                Cerrado ahora
              </span>
            )}
            {r.distanceM > 0 && (
              <span className="text-xs text-[#8a7f7a] font-medium">{distLabel(r.distanceM)}</span>
            )}
          </div>
        </BlurFade>

        {/* Info card */}
        <BlurFade delay={0.1} inView>
          <div className="glass-card rounded-2xl p-4 space-y-3">
            <p className="text-[#f7f4f2] text-sm flex items-start gap-2.5">
              <MapPin size={14} className="shrink-0 mt-0.5 text-[#5a524d]" />
              {r.address}
            </p>
            {r.openingHours && (
              <p className="text-[#f7f4f2] text-sm flex items-start gap-2.5">
                <Clock size={14} className="shrink-0 mt-0.5 text-[#5a524d]" />
                {r.openingHours}
              </p>
            )}
            {r.cuisineTypes && r.cuisineTypes.length > 0 && (
              <p className="text-[#8a7f7a] text-sm flex items-start gap-2.5">
                <Utensils size={14} className="shrink-0 mt-0.5 text-[#5a524d]" />
                {r.cuisineTypes.join(' · ')}
              </p>
            )}
            {r.phone && (
              <p className="text-[#8a7f7a] text-sm flex items-start gap-2.5">
                <Phone size={14} className="shrink-0 mt-0.5 text-[#5a524d]" />
                {r.phone}
              </p>
            )}
            {isNetwork && r.estimatedPickupTime && (
              <p className="text-[#10b981] text-sm font-semibold flex items-start gap-2.5">
                <Clock size={14} className="shrink-0 mt-0.5" />
                Listo en ~{r.estimatedPickupTime} min
              </p>
            )}
          </div>
        </BlurFade>

        {/* Mini map */}
        {hasCoords && (
          <BlurFade delay={0.15} inView>
            <div className="relative">
              <MiniMap lat={r.lat} lng={r.lng} name={r.name} />
              {/* Directions button */}
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white cursor-pointer transition-colors"
                style={{ background: 'rgba(13,11,10,0.7)', backdropFilter: 'blur(12px)' }}
              >
                <Navigation size={12} />
                Cómo llegar
              </a>
            </div>
          </BlurFade>
        )}

        {/* Conversion CTA (directory only) */}
        {!isNetwork && (
          <BlurFade delay={0.2} inView>
            <div className="glass-card rounded-2xl p-5 text-center space-y-3" style={{ borderColor: 'rgba(16,185,129,0.15)' }}>
              <p className="text-[#f7f4f2] text-sm font-bold">¿Sos el dueño de este restaurante?</p>
              <p className="text-[#8a7f7a] text-xs leading-relaxed">
                Sumate a la red TakeasyGO y recibí pedidos en tiempo real, sin comisiones por pedido.
              </p>
              <Link
                href="/#pricing"
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all duration-200 cursor-pointer"
                style={{
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  boxShadow: '0 4px 16px rgba(16,185,129,0.25)',
                }}
              >
                Conocer planes →
              </Link>
            </div>
          </BlurFade>
        )}
      </div>

      {/* ── Fixed CTA bottom ───────────────────────────────────────── */}
      <div
        className="fixed bottom-0 left-0 right-0 p-4 safe-area-bottom z-40"
        style={{ background: 'linear-gradient(to top, #0d0b0a 60%, transparent)' }}
      >
        {isNetwork ? (
          <Link
            href={`/${r.tenantSlug}/menu/${r.id}/takeaway`}
            className="flex items-center justify-center gap-2.5 w-full py-4 rounded-2xl text-base font-bold text-white transition-all duration-200 cursor-pointer active:scale-[0.98]"
            style={{
              background: 'linear-gradient(135deg, #f14722, #e03e1d)',
              boxShadow: '0 4px 24px rgba(241,71,34,0.35), 0 0 60px rgba(241,71,34,0.1)',
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
                className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-bold text-white transition-all active:scale-[0.98] cursor-pointer"
                style={{ background: 'var(--c-surface-elevated)', border: '1px solid var(--c-border-active)' }}
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
                className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-bold text-white transition-all active:scale-[0.98] cursor-pointer"
                style={{ background: 'var(--c-surface-elevated)', border: '1px solid var(--c-border-active)' }}
              >
                <ExternalLink size={16} />
                Ver carta
              </a>
            )}
            {!r.phone && !r.externalMenuUrl && (
              <div className="flex-1 py-4 rounded-2xl text-[#5a524d] text-sm text-center" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                Sin contacto disponible
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
