'use client'

import { Navigation } from 'lucide-react'

/** Full-screen GPS loading state */
export function GpsLoading() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-[#10b981]/20 animate-ping" style={{ animationDuration: '2s' }} />
        <div className="relative w-16 h-16 rounded-full bg-[var(--c-surface)] flex items-center justify-center border border-[var(--c-border)]">
          <Navigation size={24} className="text-[#10b981]" />
        </div>
      </div>
      <div className="text-center">
        <p className="text-[#f7f4f2] text-sm font-semibold mb-1">Detectando tu ubicación</p>
        <p className="text-[#5a524d] text-xs">Esto toma solo un momento</p>
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
          className="shrink-0 w-[280px] h-[200px] rounded-2xl skeleton-shimmer"
        />
      ))}
    </div>
  )
}

/** Skeleton for compact list cards */
function ListSkeleton() {
  return (
    <div className="px-4 space-y-3">
      {[1, 2, 3, 4, 5].map(i => (
        <div
          key={i}
          className="flex items-center gap-3 p-3 rounded-2xl"
          style={{ animationDelay: `${i * 100}ms` }}
        >
          <div className="w-14 h-14 rounded-xl skeleton-shimmer shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-3/4 rounded-lg skeleton-shimmer" />
            <div className="h-3 w-1/2 rounded-lg skeleton-shimmer" />
          </div>
          <div className="h-3 w-10 rounded-full skeleton-shimmer" />
        </div>
      ))}
    </div>
  )
}

/** Full feed loading skeleton */
export function FeedSkeleton() {
  return (
    <div className="space-y-6 pt-2">
      {/* Search bar skeleton */}
      <div className="px-4">
        <div className="h-10 rounded-2xl skeleton-shimmer" />
      </div>
      {/* Featured section */}
      <div className="space-y-2">
        <div className="h-4 w-40 rounded-lg skeleton-shimmer mx-4" />
        <FeaturedSkeleton />
      </div>
      {/* List section */}
      <div className="space-y-2">
        <div className="h-4 w-32 rounded-lg skeleton-shimmer mx-4" />
        <ListSkeleton />
      </div>
    </div>
  )
}

/** Fetch overlay — transparent spinner over existing content */
export function FetchOverlay() {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center" style={{ background: 'rgba(13,11,10,0.6)' }}>
      <div className="flex flex-col items-center gap-2">
        <div className="w-8 h-8 rounded-full border-2 border-[#f14722]/30 border-t-[#f14722] animate-spin" />
        <span className="text-[#8a7f7a] text-xs font-medium">Buscando...</span>
      </div>
    </div>
  )
}
