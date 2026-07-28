'use client'

// ── TGO EmptyState ───────────────────────────────────────────────────────────
//
// Primitive para cuando no hay resultados.
// Crítico para Search: NUNCA mostrar pantalla blanca.
// Cada empty state debe sentirse como una oportunidad de descubrimiento.
//
// Uso:
//   <EmptyState
//     icon={<Coffee />}
//     title="Café cerca tuyo"
//     subtitle="Todavía no abrieron, pero podés explorar otros lugares"
//     action={{ label: "Explorar abiertos", onClick: fn }}
//   />

import type { ReactNode } from 'react'

interface EmptyStateProps {
  /** Icono o elemento visual */
  icon?: ReactNode
  /** Título — nunca genérico como "Sin resultados" */
  title: string
  /** Subtítulo — contexto o sugerencia */
  subtitle?: string
  /** Acción principal */
  action?: {
    label: string
    onClick: () => void
  }
  /** Acción secundaria */
  secondaryAction?: {
    label: string
    onClick: () => void
  }
  /** Variante visual */
  variant?: 'default' | 'search' | 'inline'
  /** Clase CSS adicional */
  className?: string
}

export default function EmptyState({
  icon,
  title,
  subtitle,
  action,
  secondaryAction,
  variant = 'default',
  className,
}: EmptyStateProps) {
  if (variant === 'inline') {
    return (
      <div
        className={`flex items-center justify-center py-8 ${className ?? ''}`}
      >
        <p
          style={{
            color: 'var(--tgo-text-muted)',
            fontSize: 'var(--tgo-type-body-sm)',
          }}
        >
          {title}
        </p>
      </div>
    )
  }

  return (
    <div
      className={`flex flex-col items-center text-center px-8 py-12 ${
        className ?? ''
      }`}
    >
      {/* Icono */}
      {icon && (
        <div
          className="flex items-center justify-center mb-4"
          style={{
            width: variant === 'search' ? 48 : 56,
            height: variant === 'search' ? 48 : 56,
            borderRadius: 'var(--tgo-radius-lg)',
            backgroundColor:
              variant === 'search'
                ? 'var(--tgo-surface-2)'
                : 'var(--tgo-surface-1)',
          }}
        >
          <span
            style={{
              color: 'var(--tgo-text-muted)',
              transform: 'scale(1.2)',
            }}
          >
            {icon}
          </span>
        </div>
      )}

      {/* Título */}
      <h3
        style={{
          color: 'var(--tgo-text-primary)',
          fontSize: 'var(--tgo-type-title)',
          fontWeight: 600,
          lineHeight: 1.3,
          maxWidth: 260,
        }}
      >
        {title}
      </h3>

      {/* Subtítulo */}
      {subtitle && (
        <p
          className="mt-1.5"
          style={{
            color: 'var(--tgo-text-muted)',
            fontSize: 'var(--tgo-type-body-sm)',
            lineHeight: 1.5,
            maxWidth: 260,
          }}
        >
          {subtitle}
        </p>
      )}

      {/* Acciones */}
      {(action || secondaryAction) && (
        <div className="flex flex-col gap-2 mt-6 w-full max-w-[240px]">
          {action && (
            <button
              onClick={action.onClick}
              className="w-full"
              style={{
                padding: '10px 20px',
                borderRadius: 'var(--tgo-radius-md)',
                backgroundColor: 'var(--tgo-state-action)',
                color: 'var(--tgo-text-inverse)',
                fontSize: 'var(--tgo-type-body-sm)',
                fontWeight: 600,
                transition: `all var(--tgo-duration-base) var(--tgo-ease-standard)`,
              }}
            >
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className="w-full"
              style={{
                padding: '10px 20px',
                borderRadius: 'var(--tgo-radius-md)',
                backgroundColor: 'transparent',
                color: 'var(--tgo-text-link)',
                fontSize: 'var(--tgo-type-body-sm)',
                fontWeight: 500,
                transition: `all var(--tgo-duration-base) var(--tgo-ease-standard)`,
              }}
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
