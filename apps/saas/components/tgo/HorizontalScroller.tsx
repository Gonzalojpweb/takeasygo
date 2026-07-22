'use client'

import { useRef } from 'react'

// ── TGO HorizontalScroller ───────────────────────────────────────────────────
//
// Primitive para listas horizontales con snap scroll.
// Usado para: restaurantes cercanos, categorías, promos, descubrimientos.
// CSS scroll-snap para体验 nativa en mobile.
//
// Uso:
//   <HorizontalScroller>
//     <RestaurantCard ... />
//     <RestaurantCard ... />
//     <RestaurantCard ... />
//   </HorizontalScroller>

interface Props {
  children: React.ReactNode
  /** Padding horizontal del contenedor */
  padding?: string
  /** Gap entre items */
  gap?: string
  /** Si true, muestra indicador de scroll con fade edges */
  showEdges?: boolean
  /** Clase CSS adicional */
  className?: string
}

export default function HorizontalScroller({
  children,
  padding = 'var(--tgo-page-padding)',
  gap = 'var(--tgo-space-3)',
  showEdges = true,
  className,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  return (
    <div className={`relative ${className ?? ''}`}>
      {/* Fade edges */}
      {showEdges && (
        <>
          <div
            className="absolute left-0 top-0 bottom-0 z-10 pointer-events-none"
            style={{
              width: 24,
              background:
                'linear-gradient(to right, var(--tgo-surface-0) 0%, transparent 100%)',
            }}
          />
          <div
            className="absolute right-0 top-0 bottom-0 z-10 pointer-events-none"
            style={{
              width: 24,
              background:
                'linear-gradient(to left, var(--tgo-surface-0) 0%, transparent 100%)',
            }}
          />
        </>
      )}

      {/* Scroll container */}
      <div
        ref={scrollRef}
        className={`flex overflow-x-auto scrollbar-none ${className ?? ''}`}
        style={{
          paddingInline: padding,
          gap,
          scrollSnapType: 'x mandatory',
          scrollPaddingInline: padding,
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {Array.isArray(children)
          ? children.map((child, i) => (
              <div key={i} style={{ scrollSnapAlign: 'start', flexShrink: 0 }}>
                {child}
              </div>
            ))
          : <div style={{ scrollSnapAlign: 'start', flexShrink: 0 }}>{children}</div>}
      </div>
    </div>
  )
}
