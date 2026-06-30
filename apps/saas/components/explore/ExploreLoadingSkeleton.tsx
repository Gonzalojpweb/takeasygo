'use client'

import { Navigation } from 'lucide-react'

/** Full-screen GPS loading state */
export function GpsLoading() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 bg-[#fafafa]">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping" style={{ animationDuration: '2s' }} />
        <div className="relative w-14 h-14 rounded-full bg-white flex items-center justify-center shadow-sm border border-zinc-100">
          <Navigation size={20} className="text-primary" />
        </div>
      </div>
      <div className="text-center px-6">
        <p className="text-slate-900 text-sm font-black uppercase tracking-tight mb-0.5">Detectando ubicación</p>
        <p className="text-slate-400 text-[10px] font-bold">Esto toma solo un momento</p>
      </div>
    </div>
  )
}

/** Skeleton for the featured card horizontal scroll */
function FeaturedSkeleton() {
  return (
    <div className="flex gap-3 px-4 overflow-hidden">
      {[1, 2].map(i => (
        <div
          key={i}
          className="shrink-0 w-[240px] h-[140px] rounded-3xl skeleton-shimmer"
        />
      ))}
    </div>
  )
}

/** Skeleton for compact list cards */
function ListSkeleton() {
  return (
    <div className="px-4 space-y-2">
      {[1, 2, 3, 4, 5].map(i => (
        <div
          key={i}
          className="flex items-center gap-3 p-2.5 rounded-2xl bg-white/50"
          style={{ animationDelay: `${i * 100}ms` }}
        >
          <div className="w-12 h-12 rounded-xl skeleton-shimmer shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-3/4 rounded-lg skeleton-shimmer" />
            <div className="h-2.5 w-1/2 rounded-lg skeleton-shimmer" />
          </div>
          <div className="h-2.5 w-8 rounded-full skeleton-shimmer" />
        </div>
      ))}
    </div>
  )
}

/** Full feed loading skeleton */
export function FeedSkeleton() {
  return (
    <div className="space-y-4 pt-2 bg-[#fafafa]">
      {/* Search bar skeleton */}
      <div className="px-4">
        <div className="h-10 rounded-xl skeleton-shimmer" />
      </div>
      {/* Featured section */}
      <div className="space-y-2">
        <div className="h-3.5 w-32 rounded-lg skeleton-shimmer mx-4" />
        <FeaturedSkeleton />
      </div>
      {/* List section */}
      <div className="space-y-2">
        <div className="h-3.5 w-24 rounded-lg skeleton-shimmer mx-4" />
        <ListSkeleton />
      </div>
    </div>
  )
}

/** Fetch overlay — transparent spinner over existing content */
export function FetchOverlay() {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center backdrop-blur-[2px]" style={{ background: 'rgba(255,255,255,0.7)' }}>
      <div className="flex flex-col items-center gap-2">
        <div className="w-7 h-7 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
        <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Buscando</span>
      </div>
    </div>
  )
}
