'use client'

import type { NearbyRestaurant } from '@/app/api/explore/nearby/route'
import { MapPin, Clock, Utensils, ExternalLink, Phone, Star } from 'lucide-react'
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
            ? (r.isOperational === false 
                ? 'bg-[#f59e0b]/20 text-[#f59e0b] border border-[#f59e0b]/30' 
                : 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/30')
            : 'bg-white/10 text-[#8a7f7a] border border-white/10'
        }`}>
          {isNetwork 
            ? (r.isOperational === false ? '✨ Catálogo' : '● Red TGO') 
            : (r.status === 'converted' ? '✨ Cliente' : '○ Directorio')}
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
          {isNetwork && r.isOperational !== false && r.estimatedPickupTime && (
            <span className="text-[#10b981] text-[10px] font-semibold flex items-center gap-1">
              <Clock size={9} />
              ~{r.estimatedPickupTime} min
            </span>
          )}
          {isNetwork && r.isOperational === false && (
            <span className="text-[#f59e0b] text-[10px] font-black uppercase tracking-widest">
              Próximamente
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
          {/* Rating */}
          {r.averageRating != null && r.ratingCount != null && r.ratingCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-amber-400 font-bold">
              <Star size={9} className="fill-amber-400" />
              {r.averageRating.toFixed(1)}
            </span>
          )}
        </div>
        {/* Loyalty Discovery badges */}
        {r.loyaltyInfo && (r.loyaltyInfo.hasClub || r.loyaltyInfo.hasActivePromo) && (
          <div className="flex items-center gap-1.5 mt-1.5">
            {r.loyaltyInfo.hasClub && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-[2px] rounded-full text-[8px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 leading-none">
                ⭐ Club
              </span>
            )}
            {r.loyaltyInfo.hasActivePromo && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-[2px] rounded-full text-[8px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 leading-none">
                🔥 Promo
              </span>
            )}
          </div>
        )}
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
      className="relative flex items-center gap-3 p-3 rounded-3xl transition-all duration-300 cursor-pointer group hover:bg-zinc-50 border-2 border-zinc-50 hover:border-zinc-100 active:scale-[0.99] bg-white shadow-sm"
    >
      {/* Logo / Image */}
      <div className={`relative shrink-0 w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center ${
        isNetwork && r.logoUrl ? 'bg-zinc-50' : 'bg-zinc-100'
      }`}>
        {isNetwork && r.logoUrl ? (
          <img src={r.logoUrl} alt={r.name} className="w-full h-full object-cover" />
        ) : (
          <Utensils size={20} className="text-zinc-400" />
        )}
        {isNetwork && (
          <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full ${r.isOperational === false ? 'bg-amber-500' : 'bg-emerald-500'} border-2 border-white flex items-center justify-center shadow-sm`}>
            <span className="text-white text-[7px] font-black">{r.isOperational === false ? '★' : '✓'}</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <h3 className="font-bold text-slate-900 text-xs leading-tight truncate">
            {r.name}
          </h3>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-slate-500 text-[9px] font-black flex items-center gap-1">
            <MapPin size={10} className="text-primary" />
            {distLabel(r.distanceM)}
          </span>
          {isNetwork && r.isOperational !== false && r.estimatedPickupTime && (
            <>
              <span className="text-slate-300">·</span>
              <span className="text-emerald-600 text-[9px] font-black flex items-center gap-1">
                <Clock size={10} />
                {r.estimatedPickupTime} min
              </span>
            </>
          )}
          {isNetwork && r.isOperational === false && (
             <span className="text-amber-600 text-[8px] font-black uppercase ml-1 tracking-widest">Catálogo</span>
          )}
        </div>
          {r.cuisineTypes && r.cuisineTypes.length > 0 && (
          <p className="text-slate-400 text-[9px] font-bold mt-0.5 truncate uppercase tracking-tighter">
            {r.cuisineTypes.join(' · ')}
          </p>
        )}
        {/* Loyalty Discovery badges */}
        {r.loyaltyInfo && (r.loyaltyInfo.hasClub || r.loyaltyInfo.hasActivePromo) && (
          <div className="flex items-center gap-1 mt-0.5">
            {r.loyaltyInfo.hasClub && (
              <span className="inline-flex items-center gap-0.5 px-1 py-[1px] rounded-full text-[7px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-300 leading-none">
                ⭐ Club
              </span>
            )}
            {r.loyaltyInfo.hasActivePromo && (
              <span className="inline-flex items-center gap-0.5 px-1 py-[1px] rounded-full text-[7px] font-bold bg-amber-100 text-amber-700 border border-amber-300 leading-none">
                🔥 Promo
              </span>
            )}
          </div>
        )}
        {/* Rating */}
        {isNetwork && r.averageRating != null && r.ratingCount != null && r.ratingCount > 0 && (
          <div className="flex items-center gap-1 mt-1">
            <Star size={10} className="fill-amber-400 text-amber-400" />
            <span className="text-[9px] font-black text-amber-500">{r.averageRating.toFixed(1)}</span>
            <span className="text-[9px] text-slate-400 font-medium">({r.ratingCount})</span>
          </div>
        )}
      </div>

      {/* Right CTA */}
      <div className="shrink-0 flex items-center" onClick={e => e.stopPropagation()}>
        {isNetwork ? (
          <Link
            href={`/${r.tenantSlug}/menu/${r.id}/takeaway`}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200"
            style={{
              background: r.isOperational === false 
                ? 'rgba(255,255,255,0.05)' 
                : 'linear-gradient(135deg, #f14722, #e03e1d)',
              color: r.isOperational === false ? '#8a7f7a' : 'white',
              border: r.isOperational === false ? '1px solid rgba(255,255,255,0.1)' : 'none',
              boxShadow: r.isOperational === false ? 'none' : '0 2px 12px rgba(241,71,34,0.25)',
            }}
          >
            {r.isOperational === false ? 'Ver carta' : 'Pedir'}
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
