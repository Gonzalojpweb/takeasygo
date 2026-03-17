'use client'

import { useEffect, useRef } from 'react'
import type { NearbyRestaurant } from '@/app/api/explore/nearby/route'
import { MapPin, Clock, Phone, Utensils, ExternalLink, ArrowLeft, ShoppingBag, Share2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map)

      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width:16px;height:16px;border-radius:50%;
          background:#10b981;border:3px solid white;
          box-shadow:0 0 0 3px rgba(16,185,129,0.4);
        "></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      })
      L.marker([lat, lng], { icon }).addTo(map).bindPopup(`<b>${name}</b>`)

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
      className="w-full rounded-2xl overflow-hidden"
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
    <div className="flex flex-col h-full bg-zinc-50">

      {/* Top bar */}
      <div className="bg-white border-b border-zinc-200 px-4 pt-4 pb-3 shrink-0 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="flex items-center justify-center w-8 h-8 rounded-xl bg-zinc-100 hover:bg-zinc-200 transition-colors shrink-0">
          <ArrowLeft size={16} className="text-zinc-600" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-zinc-400 truncate">Restaurante</p>
          <h1 className="font-bold text-zinc-900 text-base leading-tight truncate">{r.name}</h1>
        </div>
        <button
          onClick={() => handleShare(r.name, r.address)}
          className="flex items-center justify-center w-8 h-8 rounded-xl bg-zinc-100 hover:bg-zinc-200 transition-colors shrink-0"
          title="Compartir">
          <Share2 size={15} className="text-zinc-600" />
        </button>
        {isNetwork && r.logoUrl && (
          <div className="shrink-0 w-10 h-10 rounded-xl overflow-hidden border border-zinc-100">
            <img src={r.logoUrl} alt={r.name} className="w-full h-full object-cover" />
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

        {/* Badge + distancia */}
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
            isNetwork
              ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
              : 'bg-zinc-100 text-zinc-500 border-zinc-200'
          }`}>
            {isNetwork ? '● En Red TakeasyGO' : '○ Directorio'}
          </span>
          {r.distanceM > 0 && (
            <span className="text-xs text-zinc-400 font-medium">{distLabel(r.distanceM)}</span>
          )}
        </div>

        {/* Info */}
        <div className="bg-white border border-zinc-200 rounded-2xl p-4 space-y-2">
          <p className="text-zinc-700 text-sm flex items-start gap-2">
            <MapPin size={14} className="shrink-0 mt-0.5 text-zinc-400" />
            {r.address}
          </p>
          {r.openingHours && (
            <p className="text-zinc-700 text-sm flex items-start gap-2">
              <Clock size={14} className="shrink-0 mt-0.5 text-zinc-400" />
              {r.openingHours}
            </p>
          )}
          {r.cuisineTypes && r.cuisineTypes.length > 0 && (
            <p className="text-zinc-600 text-sm flex items-start gap-2">
              <Utensils size={14} className="shrink-0 mt-0.5 text-zinc-400" />
              {r.cuisineTypes.join(' · ')}
            </p>
          )}
          {r.phone && (
            <p className="text-zinc-600 text-sm flex items-start gap-2">
              <Phone size={14} className="shrink-0 mt-0.5 text-zinc-400" />
              {r.phone}
            </p>
          )}
          {isNetwork && r.estimatedPickupTime && (
            <p className="text-emerald-600 text-sm font-medium flex items-start gap-2">
              <Clock size={14} className="shrink-0 mt-0.5" />
              Listo en ~{r.estimatedPickupTime} min
            </p>
          )}
        </div>

        {/* Mini mapa */}
        {hasCoords && <MiniMap lat={r.lat} lng={r.lng} name={r.name} />}

        {/* CTA principal */}
        <div onClick={e => e.stopPropagation()}>
          {isNetwork ? (
            <Link
              href={`/${r.tenantSlug}/menu/${r.id}/takeaway`}
              className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white text-base font-bold transition-colors shadow-sm">
              <ShoppingBag size={18} />
              Ver menú y pedir
            </Link>
          ) : (
            <div className="flex gap-3">
              {r.phone && (
                <a
                  href={`tel:${r.phone}`}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-zinc-800 hover:bg-zinc-900 text-white text-sm font-bold transition-colors">
                  <Phone size={15} />
                  Llamar para pedir
                </a>
              )}
              {r.externalMenuUrl && (
                <a
                  href={r.externalMenuUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-sm font-bold transition-colors">
                  <ExternalLink size={15} />
                  Ver carta
                </a>
              )}
              {!r.phone && !r.externalMenuUrl && (
                <div className="flex-1 py-3.5 rounded-2xl bg-zinc-50 border border-zinc-200 text-zinc-400 text-sm text-center">
                  Sin contacto disponible
                </div>
              )}
            </div>
          )}
        </div>

        {/* Conversion CTA */}
        {!isNetwork && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
            <p className="text-emerald-800 text-sm font-semibold mb-1">¿Sos el dueño de este restaurante?</p>
            <p className="text-emerald-700 text-xs mb-3">
              Sumate a la red TakeasyGO y recibí pedidos en tiempo real, sin comisiones por pedido.
            </p>
            <Link
              href="/#pricing"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-colors">
              Conocer planes →
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
