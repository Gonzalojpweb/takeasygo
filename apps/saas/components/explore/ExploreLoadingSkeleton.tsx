'use client'

// ── ExploreLoadingSkeleton (TGO) ─────────────────────────────────────────────
//
// Skeletons de carga para Explore.
// Todos los colores vía --tgo-* tokens.

import { Navigation } from 'lucide-react'

/** Full-screen GPS loading state */
export function GpsLoading() {
  return (
    <div
      className="flex flex-col items-center justify-center h-full gap-3"
      style={{ backgroundColor: 'var(--tgo-surface-0)' }}
    >
      <div className="relative">
        <div
          className="absolute inset-0 animate-ping"
          style={{
            borderRadius: 'var(--tgo-radius-pill)',
            backgroundColor: 'var(--tgo-brand-primary-soft)',
            animationDuration: '2s',
          }}
        />
        <div
          className="relative flex items-center justify-center"
          style={{
            width: 56,
            height: 56,
            borderRadius: 'var(--tgo-radius-pill)',
            backgroundColor: 'var(--tgo-surface-0)',
            boxShadow: 'var(--shadow-card)',
            border: '1px solid var(--tgo-border)',
          }}
        >
          <Navigation
            size={20}
            style={{ color: 'var(--tgo-brand-primary)' }}
          />
        </div>
      </div>
      <div className="text-center" style={{ paddingInline: 24 }}>
        <p
          style={{
            color: 'var(--tgo-text-primary)',
            fontSize: 'var(--tgo-type-body-sm)',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 'var(--tgo-tracking-tight)',
            marginBottom: 2,
          }}
        >
          Detectando ubicación
        </p>
        <p
          style={{
            color: 'var(--tgo-text-muted)',
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          Esto toma solo un momento
        </p>
      </div>
    </div>
  )
}

/** Skeleton for the featured card horizontal scroll */
function FeaturedSkeleton() {
  return (
    <div
      className="flex gap-3 overflow-hidden"
      style={{ paddingInline: 'var(--tgo-page-padding)' }}
    >
      {[1, 2].map((i) => (
        <div
          key={i}
          className="shrink-0 skeleton-shimmer"
          style={{
            width: 240,
            height: 140,
            borderRadius: 'var(--tgo-radius-lg)',
          }}
        />
      ))}
    </div>
  )
}

/** Skeleton for compact list cards */
function ListSkeleton() {
  return (
    <div
      className="space-y-2"
      style={{ paddingInline: 'var(--tgo-page-padding)' }}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3"
          style={{
            padding: 10,
            borderRadius: 'var(--tgo-radius-lg)',
            backgroundColor: 'var(--tgo-surface-1)',
            animationDelay: `${i * 100}ms`,
          }}
        >
          <div
            className="skeleton-shimmer shrink-0"
            style={{
              width: 48,
              height: 48,
              borderRadius: 'var(--tgo-radius-md)',
            }}
          />
          <div className="flex-1 space-y-1.5">
            <div
              className="skeleton-shimmer"
              style={{
                height: 14,
                width: '75%',
                borderRadius: 'var(--tgo-radius-sm)',
              }}
            />
            <div
              className="skeleton-shimmer"
              style={{
                height: 10,
                width: '50%',
                borderRadius: 'var(--tgo-radius-sm)',
              }}
            />
          </div>
          <div
            className="skeleton-shimmer"
            style={{
              height: 10,
              width: 32,
              borderRadius: 'var(--tgo-radius-pill)',
            }}
          />
        </div>
      ))}
    </div>
  )
}

/** Full feed loading skeleton */
export function FeedSkeleton() {
  return (
    <div
      className="space-y-4 pt-2"
      style={{ backgroundColor: 'var(--tgo-surface-0)' }}
    >
      {/* Search bar skeleton */}
      <div style={{ paddingInline: 'var(--tgo-page-padding)' }}>
        <div
          className="skeleton-shimmer"
          style={{
            height: 40,
            borderRadius: 'var(--tgo-radius-pill)',
          }}
        />
      </div>
      {/* Featured section */}
      <div className="space-y-2">
        <div
          className="skeleton-shimmer"
          style={{
            height: 14,
            width: 128,
            marginInline: 20,
            borderRadius: 'var(--tgo-radius-sm)',
          }}
        />
        <FeaturedSkeleton />
      </div>
      {/* List section */}
      <div className="space-y-2">
        <div
          className="skeleton-shimmer"
          style={{
            height: 14,
            width: 96,
            marginInline: 20,
            borderRadius: 'var(--tgo-radius-sm)',
          }}
        />
        <ListSkeleton />
      </div>
    </div>
  )
}

/** Fetch overlay — transparent spinner over existing content */
export function FetchOverlay() {
  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center"
      style={{
        backdropFilter: 'blur(2px)',
        backgroundColor: 'rgba(255, 255, 255, 0.7)',
      }}
    >
      <div className="flex flex-col items-center gap-2">
        <div
          className="animate-spin"
          style={{
            width: 28,
            height: 28,
            borderRadius: 'var(--tgo-radius-pill)',
            border: '2px solid var(--tgo-border)',
            borderTopColor: 'var(--tgo-text-muted)',
          }}
        />
        <span
          style={{
            color: 'var(--tgo-text-muted)',
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 'var(--tgo-tracking-widest)',
          }}
        >
          Buscando
        </span>
      </div>
    </div>
  )
}
