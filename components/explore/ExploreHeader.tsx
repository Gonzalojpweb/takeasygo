'use client'

import { Search, MapPin, AlertCircle, Clock, X, SlidersHorizontal } from 'lucide-react'
import Image from 'next/image'
import { useState } from 'react'

interface Props {
  gpsError: string | null
  radius: number
  setRadius: (r: number) => void
  activeCuisine: string | null
  setActiveCuisine: (c: string | null) => void
  openNowOnly: boolean
  setOpenNowOnly: (v: boolean) => void
  allCuisines: string[]
  networkCount: number
  listedCount: number
  activeFilters: number
  filteredCount: number
  onClearFilters: () => void
  searchQuery: string
  setSearchQuery: (q: string) => void
  onOpenLeadModal?: () => void
}

const RADIUS_OPTIONS = [
  { value: 1000, label: '1 km' },
  { value: 2000, label: '2 km' },
  { value: 5000, label: '5 km' },
  { value: 10000, label: '10 km' },
]

export default function ExploreHeader({
  gpsError, radius, setRadius,
  activeCuisine, setActiveCuisine,
  openNowOnly, setOpenNowOnly,
  allCuisines, networkCount, listedCount,
  activeFilters, filteredCount,
  onClearFilters, searchQuery, setSearchQuery,
  onOpenLeadModal,
}: Props) {
  const [showFilters, setShowFilters] = useState(false)

  return (
    <div className="shrink-0 safe-area-top">
      {/* Top bar */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-3 mb-3">
          <Image
            src="https://res.cloudinary.com/dypcq8lsa/image/upload/v1773077771/ChatGPT_Image_9_mar_2026__02_28_19_p.m.-removebg-preview-removebg-preview_1_yrwjdm.png"
            alt="TakeasyGO"
            width={110}
            height={28}
            style={{ height: 22, width: 'auto', filter: 'brightness(10)' }}
            unoptimized
          />
          {onOpenLeadModal && (
            <button
              onClick={onOpenLeadModal}
              className="text-[10px] text-[#8a7f7a] hover:text-[#10b981] transition-colors ml-auto font-medium cursor-pointer"
            >
              Soy dueño →
            </button>
          )}
          {gpsError && !onOpenLeadModal && (
            <p className="text-amber-500/80 text-[10px] flex items-center gap-1 ml-auto">
              <AlertCircle size={10} /> {gpsError}
            </p>
          )}
        </div>

        {/* Contextual headline */}
        <h1 className="text-[#f7f4f2] text-xl font-bold leading-tight mb-1">
          Takeaway cerca de vos
        </h1>
        <p className="text-[#5a524d] text-xs mb-3">
          Basado en tu ubicación y disponibilidad real
        </p>

        {/* Search bar */}
        <div className="relative mb-3">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5a524d]" />
          <input
            type="text"
            placeholder="Buscar restaurantes, cocinas..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-10 py-2.5 rounded-2xl text-sm placeholder-[#5a524d] text-[#f7f4f2] glass-card focus:outline-none focus:border-[#f14722]/30 transition-colors"
          />
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-xl transition-colors cursor-pointer ${
              showFilters || activeFilters > 0
                ? 'bg-[#f14722]/15 text-[#f14722]'
                : 'text-[#5a524d] hover:text-[#8a7f7a]'
            }`}
          >
            <SlidersHorizontal size={15} />
            {activeFilters > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#f14722] text-white text-[8px] font-bold flex items-center justify-center">
                {activeFilters}
              </span>
            )}
          </button>
        </div>

        {/* Filters panel */}
        {showFilters && (
          <div className="glass-card rounded-2xl p-3 mb-3 animate-fade-in-up">
            {/* Radio selector */}
            <div className="flex items-center gap-2 mb-3">
              <MapPin size={12} className="text-[#5a524d] shrink-0" />
              <span className="text-[#5a524d] text-xs shrink-0">Radio:</span>
              <div className="flex gap-1.5">
                {RADIUS_OPTIONS.map(r => (
                  <button
                    key={r.value}
                    onClick={() => setRadius(r.value)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all duration-200 cursor-pointer ${
                      radius === r.value
                        ? 'bg-[#f14722] text-white border-[#f14722] shadow-[0_0_12px_rgba(241,71,34,0.3)]'
                        : 'bg-transparent text-[#8a7f7a] border-[var(--c-border)] hover:border-[var(--c-border-active)]'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Open now toggle */}
            <button
              onClick={() => setOpenNowOnly(!openNowOnly)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-200 cursor-pointer ${
                openNowOnly
                  ? 'bg-[#10b981]/15 text-[#10b981] border-[#10b981]/30'
                  : 'bg-transparent text-[#8a7f7a] border-[var(--c-border)] hover:border-[var(--c-border-active)]'
              }`}
            >
              <Clock size={11} />
              Abierto ahora
            </button>
          </div>
        )}

        {/* Cuisine chips (horizontal scroll) */}
        {allCuisines.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 snap-scroll-x">
            {allCuisines.map(cuisine => (
              <button
                key={cuisine}
                onClick={() => setActiveCuisine(activeCuisine === cuisine ? null : cuisine)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border shrink-0 capitalize transition-all duration-200 cursor-pointer ${
                  activeCuisine === cuisine
                    ? 'bg-[#f14722]/15 text-[#f14722] border-[#f14722]/30'
                    : 'bg-transparent text-[#8a7f7a] border-[var(--c-border)] hover:border-[var(--c-border-active)] hover:text-[#f7f4f2]'
                }`}
              >
                {cuisine}
              </button>
            ))}
            {activeFilters > 0 && (
              <button
                onClick={onClearFilters}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs text-[#5a524d] border border-[var(--c-border)] shrink-0 hover:text-[#8a7f7a] hover:border-[var(--c-border-active)] transition-all duration-200 cursor-pointer"
              >
                <X size={11} /> Limpiar
              </button>
            )}
          </div>
        )}

        {/* Summary badge */}
        {(networkCount > 0 || listedCount > 0) && (
          <div className="flex items-center gap-2 mt-2">
            {networkCount > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-[#10b981]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse-glow" />
                {networkCount} en red
              </span>
            )}
            {networkCount > 0 && listedCount > 0 && <span className="text-[#5a524d] text-[10px]">·</span>}
            {listedCount > 0 && (
              <span className="text-[10px] text-[#5a524d]">{listedCount} en directorio</span>
            )}
            {activeFilters > 0 && (
              <span className="text-[10px] text-[#5a524d]">· {filteredCount} resultado{filteredCount !== 1 ? 's' : ''}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
