import type { NearbyRestaurant } from '@/app/api/explore/nearby/route'
import { MapPin, Clock, Phone, Utensils, ExternalLink } from 'lucide-react'
import Link from 'next/link'

interface Props {
  restaurant: NearbyRestaurant
  /** Navegar a la página de detalle al hacer click en el card */
  onNavigate?: () => void
}

function distLabel(m: number) {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`
}

export default function RestaurantCard({ restaurant: r, onNavigate }: Props) {
  const isNetwork = r.type === 'network'

  return (
    <div
      onClick={onNavigate}
      className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer active:scale-[0.99]">

      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
              isNetwork
                ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                : 'bg-zinc-100 text-zinc-500 border-zinc-200'
            }`}>
              {isNetwork ? '● En Red TakeasyGO' : '○ Directorio'}
            </span>
            <span className="text-xs text-zinc-400 font-medium">
              {distLabel(r.distanceM)}
            </span>
          </div>
          <h3 className="font-semibold text-zinc-900 text-base leading-tight truncate">
            {r.name}
          </h3>
        </div>

        {/* Logo para in-network */}
        {isNetwork && r.logoUrl && (
          <div className="shrink-0 w-10 h-10 rounded-xl overflow-hidden border border-zinc-100">
            <img src={r.logoUrl} alt={r.name} className="w-full h-full object-cover" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="space-y-1 mb-3">
        <p className="text-zinc-500 text-xs flex items-center gap-1.5">
          <MapPin size={11} className="shrink-0" />
          {r.address}
        </p>
        {r.openingHours && (
          <p className="text-zinc-500 text-xs flex items-center gap-1.5">
            <Clock size={11} className="shrink-0" />
            {r.openingHours}
          </p>
        )}
        {r.cuisineTypes && r.cuisineTypes.length > 0 && (
          <p className="text-zinc-400 text-xs flex items-center gap-1.5">
            <Utensils size={11} className="shrink-0" />
            {r.cuisineTypes.join(' · ')}
          </p>
        )}
        {isNetwork && r.estimatedPickupTime && (
          <p className="text-emerald-600 text-xs font-medium flex items-center gap-1.5">
            <Clock size={11} className="shrink-0" />
            Listo en ~{r.estimatedPickupTime} min
          </p>
        )}
      </div>

      {/* CTA — stopPropagation para no disparar onNavigate */}
      <div onClick={e => e.stopPropagation()}>
        {isNetwork ? (
          <Link
            href={`/${r.tenantSlug}/menu/${r.id}/takeaway`}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold transition-colors">
            Ver menú y pedir
            <ExternalLink size={13} />
          </Link>
        ) : (
          <div className="flex gap-2">
            {r.phone && (
              <a
                href={`tel:${r.phone}`}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-sm font-medium transition-colors">
                <Phone size={13} />
                Llamar
              </a>
            )}
            {r.externalMenuUrl && (
              <a
                href={r.externalMenuUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-sm font-medium transition-colors">
                <ExternalLink size={13} />
                Ver carta
              </a>
            )}
            {!r.phone && !r.externalMenuUrl && (
              <div className="flex-1 py-2.5 rounded-xl bg-zinc-50 text-zinc-400 text-sm text-center">
                Sin contacto disponible
              </div>
            )}
          </div>
        )}
      </div>

      {/* Conversion CTA para directorio */}
      {!isNetwork && (
        <p
          className="text-center text-[11px] text-zinc-400 mt-2"
          onClick={e => e.stopPropagation()}>
          ¿Sos el dueño?{' '}
          <a href="/#pricing" className="text-emerald-600 hover:underline font-medium">
            Sumá tu restaurante a la red →
          </a>
        </p>
      )}
    </div>
  )
}
