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
        <div className="flex items-center gap-3 mb-2">
          <Image
            src="https://res.cloudinary.com/dypcq8lsa/image/upload/v1773077771/ChatGPT_Image_9_mar_2026__02_28_19_p.m.-removebg-preview-removebg-preview_1_yrwjdm.png"
            alt="TakeasyGO"
            width={90}
            height={22}
            className="h-4.5 w-auto"
            unoptimized
          />
          {onOpenLeadModal && (
            <button
              onClick={onOpenLeadModal}
              className="text-[9px] text-slate-400 hover:text-primary transition-colors ml-auto font-black uppercase tracking-widest cursor-pointer"
            >
              Soy dueño →
            </button>
          )}
          {gpsError && !onOpenLeadModal && (
            <p className="text-amber-500/80 text-[9px] flex items-center gap-1 ml-auto font-bold">
              <AlertCircle size={10} /> {gpsError}
            </p>
          )}
        </div>

        {/* Contextual headline */}
        <h1 className="text-slate-900 text-lg font-black leading-tight mb-0.5">
          Takeaway cerca de vos
        </h1>
        <p className="text-slate-500 text-[10px] font-bold mb-3 uppercase tracking-tighter">
          Basado en tu ubicación real
        </p>

        {/* Search bar */}
        <div className="relative mb-2">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="¿Qué buscas hoy?"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-10 py-2.5 rounded-xl text-xs placeholder-slate-400 text-slate-900 bg-zinc-100 border-2 border-transparent focus:bg-white focus:border-primary/20 focus:outline-none transition-all font-semibold"
          />
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors cursor-pointer ${
              showFilters || activeFilters > 0
                ? 'bg-primary/10 text-primary'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <SlidersHorizontal size={15} />
            {activeFilters > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary text-white text-[9px] font-bold flex items-center justify-center border-2 border-white">
                {activeFilters}
              </span>
            )}
          </button>
        </div>

        {/* Filters panel */}
        {showFilters && (
          <div className="bg-white rounded-2xl p-4 mb-3 border border-zinc-100 shadow-xl shadow-slate-100 animate-in fade-in slide-in-from-top-2 duration-300">
            {/* Radio selector */}
            <div className="flex items-center gap-2 mb-4">
              <MapPin size={14} className="text-primary shrink-0" />
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider shrink-0">Radio</span>
              <div className="flex gap-2 ml-2">
                {RADIUS_OPTIONS.map(r => (
                  <button
                    key={r.value}
                    onClick={() => setRadius(r.value)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all duration-200 cursor-pointer ${
                      radius === r.value
                        ? 'bg-primary text-white shadow-lg shadow-primary/20'
                        : 'bg-zinc-100 text-slate-500 hover:bg-zinc-200'
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
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all duration-200 cursor-pointer ${
                openNowOnly
                  ? 'bg-emerald-50 text-emerald-600 border-2 border-emerald-100'
                  : 'bg-zinc-100 text-slate-500 border-2 border-transparent hover:bg-zinc-200'
              }`}
            >
              <Clock size={14} />
              ABIERTO AHORA
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
                className={`px-4 py-2 rounded-xl text-xs font-black shrink-0 capitalize transition-all duration-200 cursor-pointer border-2 ${
                  activeCuisine === cuisine
                    ? 'bg-primary/5 text-primary border-primary/20'
                    : 'bg-white text-slate-400 border-zinc-100 hover:border-zinc-200 hover:text-slate-600'
                }`}
              >
                {cuisine}
              </button>
            ))}
            {activeFilters > 0 && (
              <button
                onClick={onClearFilters}
                className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-black text-slate-400 border-2 border-dashed border-zinc-200 shrink-0 hover:text-slate-600 hover:border-zinc-300 transition-all duration-200 cursor-pointer"
              >
                <X size={14} /> LIMPIAR
              </button>
            )}
          </div>
        )}

        {/* Summary badge */}
        {(networkCount > 0 || listedCount > 0) && (
          <div className="flex items-center gap-2 mt-4 bg-zinc-50 p-2 rounded-xl w-fit">
            {networkCount > 0 && (
              <span className="flex items-center gap-1.5 text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                {networkCount} en red
              </span>
            )}
            {networkCount > 0 && listedCount > 0 && <span className="text-zinc-200 text-[10px]">|</span>}
            {listedCount > 0 && (
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {listedCount} directorio
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
