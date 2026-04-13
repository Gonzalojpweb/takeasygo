'use client'

import type { NearbyRestaurant } from '@/app/api/explore/nearby/route'
import { MapPin, Clock, Utensils, ExternalLink, Phone, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { BorderBeam } from '@/components/ui/border-beam'

function distLabel(m: number) {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`
}

// ── FEATURED CARD (horizontal scroll, large) ───────────────────────────────
export function FeaturedCard({
  restaurant: r,
  onNavigate,
  index = 0,
}: {
  restaurant: NearbyRestaurant
  onNavigate?: () => void
  index?: number
}) {
  const isNetwork = r.type === 'network'

  return (
    <div
      onClick={onNavigate}
      className="relative shrink-0 w-[280px] h-[200px] rounded-2xl overflow-hidden cursor-pointer group active:scale-[0.98] transition-transform duration-200"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      {/* Background image or gradient */}
      {r.heroImage ? (
        <img
          src={r.heroImage}
          alt={r.name}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: isNetwork
              ? `linear-gradient(135deg, #0d0b0a 0%, ${r.primaryColor || '#1a1816'} 50%, #0d0b0a 100%)`
              : 'linear-gradient(135deg, #1a1816 0%, #242220 100%)',
          }}
        />
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0d0b0a] via-[#0d0b0a]/40 to-transparent" />

      {/* Network glow border */}
      {isNetwork && (
        <BorderBeam
          size={100}
          duration={8}
          colorFrom="#10b981"
          colorTo="#f14722"
          className="opacity-60"
        />
      )}

      {/* Top badges */}
      <div className="absolute top-3 left-3 right-3 flex items-start justify-between">
        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full backdrop-blur-md ${
          isNetwork
            ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/30'
            : 'bg-white/10 text-[#8a7f7a] border border-white/10'
        }`}>
          {isNetwork ? '● Red TakeasyGO' : '○ Directorio'}
        </span>
        <span className="text-[10px] font-semibold text-white/70 bg-black/30 backdrop-blur-md px-2 py-0.5 rounded-full">
          {distLabel(r.distanceM)}
        </span>
      </div>

      {/* Logo (network) */}
      {isNetwork && r.logoUrl && (
        <div className="absolute top-3 right-3 w-8 h-8 rounded-lg overflow-hidden border border-white/20 shadow-lg">
          <img src={r.logoUrl} alt="" className="w-full h-full object-cover" />
        </div>
      )}

      {/* Bottom info */}
      <div className="absolute bottom-0 left-0 right-0 p-3.5">
        <h3 className="font-bold text-white text-base leading-tight mb-1 drop-shadow-md">
          {r.name}
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          {r.cuisineTypes && r.cuisineTypes.length > 0 && (
            <span className="text-white/50 text-[10px] flex items-center gap-1">
              <Utensils size={9} />
              {r.cuisineTypes.slice(0, 2).join(' · ')}
            </span>
          )}
          {isNetwork && r.estimatedPickupTime && (
            <span className="text-[#10b981] text-[10px] font-semibold flex items-center gap-1">
              <Clock size={9} />
              ~{r.estimatedPickupTime} min
            </span>
          )}
          {r.isOpenNow === true && (
            <span className="text-[#10b981] text-[10px] font-semibold flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-[#10b981] animate-pulse" />
              Abierto
            </span>
          )}
          {r.isOpenNow === false && (
            <span className="text-[#ef4444]/80 text-[10px] font-semibold">Cerrado</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── COMPACT CARD (vertical list) ────────────────────────────────────────────
export default function RestaurantCard({
  restaurant: r,
  onNavigate,
}: {
  restaurant: NearbyRestaurant
  onNavigate?: () => void
}) {
  const isNetwork = r.type === 'network'

  return (
    <div
      onClick={onNavigate}
      className="relative flex items-center gap-3 p-3 rounded-2xl transition-all duration-200 cursor-pointer group hover:bg-[var(--c-surface-elevated)] active:scale-[0.99]"
      style={{ border: '1px solid var(--c-border)' }}
    >
      {/* Logo / Image */}
      <div className={`relative shrink-0 w-14 h-14 rounded-xl overflow-hidden flex items-center justify-center ${
        isNetwork && r.logoUrl ? '' : 'bg-[var(--c-surface-elevated)]'
      }`}>
        {isNetwork && r.logoUrl ? (
          <img src={r.logoUrl} alt={r.name} className="w-full h-full object-cover" />
        ) : (
          <Utensils size={18} className="text-[#5a524d]" />
        )}
        {isNetwork && (
          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#10b981] border-2 border-[var(--c-bg)] flex items-center justify-center">
            <span className="text-white text-[6px] font-black">✓</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <h3 className="font-semibold text-[#f7f4f2] text-sm leading-tight truncate">
            {r.name}
          </h3>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[#5a524d] text-[10px] flex items-center gap-1">
            <MapPin size={9} />
            {distLabel(r.distanceM)}
          </span>
          {isNetwork && r.estimatedPickupTime && (
            <>
              <span className="text-[#5a524d]/50 text-[10px]">·</span>
              <span className="text-[#10b981] text-[10px] font-medium flex items-center gap-1">
                <Clock size={9} />
                ~{r.estimatedPickupTime} min
              </span>
            </>
          )}
          {r.isOpenNow === true && (
            <>
              <span className="text-[#5a524d]/50 text-[10px]">·</span>
              <span className="text-[#10b981] text-[10px] font-medium flex items-center gap-0.5">
                <span className="w-1 h-1 rounded-full bg-[#10b981]" />
                Abierto
              </span>
            </>
          )}
          {r.isOpenNow === false && (
            <>
              <span className="text-[#5a524d]/50 text-[10px]">·</span>
              <span className="text-[#ef4444]/70 text-[10px] font-medium">Cerrado</span>
            </>
          )}
        </div>
        {r.cuisineTypes && r.cuisineTypes.length > 0 && (
          <p className="text-[#5a524d] text-[10px] mt-0.5 truncate">
            {r.cuisineTypes.join(' · ')}
          </p>
        )}
      </div>

      {/* Right CTA */}
      <div className="shrink-0 flex items-center" onClick={e => e.stopPropagation()}>
        {isNetwork ? (
          <Link
            href={`/${r.tenantSlug}/menu/${r.id}/takeaway`}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200"
            style={{
              background: 'linear-gradient(135deg, #f14722, #e03e1d)',
              color: 'white',
              boxShadow: '0 2px 12px rgba(241,71,34,0.25)',
            }}
          >
            Pedir
            <ExternalLink size={11} />
          </Link>
        ) : (
          <div className="flex gap-1.5">
            {r.phone && (
              <a
                href={`tel:${r.phone}`}
                className="flex items-center justify-center w-9 h-9 rounded-xl bg-[var(--c-surface-elevated)] text-[#8a7f7a] hover:text-[#f7f4f2] transition-colors"
              >
                <Phone size={14} />
              </a>
            )}
            {r.externalMenuUrl && (
              <a
                href={r.externalMenuUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center w-9 h-9 rounded-xl bg-[var(--c-surface-elevated)] text-[#8a7f7a] hover:text-[#f7f4f2] transition-colors"
              >
                <ExternalLink size={14} />
              </a>
            )}
          </div>
        )}
      </div>

      {/* Conversion CTA for directory */}
      {!isNetwork && (
        <div
          className="absolute -bottom-5 left-4 right-4 text-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          onClick={e => e.stopPropagation()}
        >
          <a
            href="/#pricing"
            className="text-[10px] text-[#10b981] hover:text-[#10b981]/80 font-medium transition-colors"
          >
            ¿Sos el dueño? Sumá tu restaurante a la red →
          </a>
        </div>
      )}
    </div>
  )
}
