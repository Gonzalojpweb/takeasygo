'use client'

import { ArrowRight } from 'lucide-react'
import Link from 'next/link'

// ── TGO Section ──────────────────────────────────────────────────────────────
//
// Primitive de layout para bloques narrativos del Discovery Feed.
// Cada sección responde una pregunta distinta del usuario.
// No es un "Card container" — es un bloque narrativo completo.
//
// Uso:
//   <Section
//     title="Ideal para desayunar"
//     subtitle="Abiertos ahora cerca tuyo"
//     href="/explore?open=true"
//     ctaLabel="Ver todos"
//   >
//     <HorizontalScroller>
//       <RestaurantCard ... />
//       <RestaurantCard ... />
//     </HorizontalScroller>
//   </Section>

import type { ReactNode } from 'react'

interface SectionProps {
  /** Título de la sección — responde una pregunta */
  title: string
  /** Subtítulo — contexto opcional */
  subtitle?: string
  /** Ícono opcional al lado del título */
  icon?: ReactNode
  /** Link de "Ver todo" */
  href?: string
  /** Label del CTA */
  ctaLabel?: string
  /** Contenido de la sección */
  children: ReactNode
  /** Clase CSS adicional del contenedor */
  className?: string
  /** Padding vertical opcional (override del default) */
  verticalPadding?: string
}

export default function Section({
  title,
  subtitle,
  icon,
  href,
  ctaLabel = 'Ver todo',
  children,
  className,
  verticalPadding,
}: SectionProps) {
  return (
    <section
      className={`${className ?? ''}`}
      style={{
        paddingTop: verticalPadding ?? 'var(--tgo-section-gap)',
        paddingBottom: 0,
      }}
    >
      {/* Header */}
      <div
        className="flex items-end justify-between"
        style={{ paddingInline: 'var(--tgo-page-padding)' }}
      >
        <div>
          <h2
            className="flex items-center gap-1.5"
            style={{
              color: 'var(--tgo-text-primary)',
              fontSize: 'var(--tgo-type-section)',
              fontWeight: 700,
              letterSpacing: 'var(--tgo-tracking-tight)',
              lineHeight: 1.2,
            }}
          >
            {icon && <span className="flex-shrink-0">{icon}</span>}
            {title}
          </h2>
          {subtitle && (
            <p
              className="mt-0.5"
              style={{
                color: 'var(--tgo-text-muted)',
                fontSize: 'var(--tgo-type-body-sm)',
              }}
            >
              {subtitle}
            </p>
          )}
        </div>

        {href && (
          <Link
            href={href}
            className="flex items-center gap-1 shrink-0"
            style={{
              color: 'var(--tgo-text-link)',
              fontSize: 'var(--tgo-type-body-sm)',
              fontWeight: 600,
            }}
          >
            {ctaLabel}
            <ArrowRight size={16} />
          </Link>
        )}
      </div>

      {/* Content */}
      <div className="mt-3">{children}</div>
    </section>
  )
}
