'use client'

import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

// ── TGO Chip ─────────────────────────────────────────────────────────────────
//
// Primitive base. No es un Badge de shadcn.
// Chip = objeto interactivo, descartable, que filtra o selecciona.
// No confundir con Tag (informativo, no descartable).
//
// Uso:
//   <Chip>Café</Chip>                          // default
//   <Chip variant="active">Abierto</Chip>      // seleccionado
//   <Chip variant="suggestion">🍕 Pizza</Chip> // sugerencia del Search
//   <Chip dismissible onClose={fn}>x</Chip>    // descartable
//
// Todos los colores vía --tgo-* tokens.

const chipVariants = cva(
  'inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-all duration-200 select-none',
  {
    variants: {
      variant: {
        // Default — chip neutro, borde sutil
        default:
          'bg-[var(--tgo-surface-2)] text-[var(--tgo-text-secondary)] border border-[var(--tgo-border)] hover:border-[var(--tgo-border-active)]',
        // Active — seleccionado, color funcional
        active:
          'bg-[var(--tgo-state-interactive-soft)] text-[var(--tgo-state-interactive)] border border-[var(--tgo-state-interactive)] font-semibold',
        // Suggestion — chip del search, sin borde, fondo suave
        suggestion:
          'bg-[var(--tgo-surface-1)] text-[var(--tgo-text-primary)] border border-transparent hover:bg-[var(--tgo-surface-2)]',
        // Brand — solo para momentos de club/beneficios
        brand:
          'bg-[var(--tgo-brand-primary-soft)] text-[var(--tgo-brand-primary)] border border-transparent font-semibold',
        // Danger — para estados de error o close
        danger:
          'bg-[var(--tgo-state-danger-soft)] text-[var(--tgo-state-danger)] border border-transparent',
        // Ghost — sin fondo, solo texto clickable
        ghost:
          'bg-transparent text-[var(--tgo-text-muted)] border border-transparent hover:text-[var(--tgo-text-secondary)]',
      },
      size: {
        sm: 'h-6 px-2.5 text-[var(--tgo-type-caption)] rounded-[var(--tgo-radius-sm)]',
        md: 'h-8 px-3 text-[var(--tgo-type-body-sm)] rounded-[var(--tgo-radius-md)]',
        lg: 'h-10 px-4 text-[var(--tgo-type-body)] rounded-[var(--tgo-radius-md)]',
        pill: 'h-8 px-3 text-[var(--tgo-type-body-sm)] rounded-[var(--tgo-radius-pill)]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
)

interface ChipProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof chipVariants> {
  /** Hace que el chip pueda ser descartado con un icono X */
  dismissible?: boolean
  /** Callback al hacer click en el icono de cierre */
  onClose?: () => void
  /** Icono opcional a la izquierda */
  icon?: React.ReactNode
}

function Chip({
  className,
  variant = 'default',
  size = 'md',
  dismissible = false,
  onClose,
  icon,
  children,
  ...props
}: ChipProps) {
  return (
    <button
      className={cn(chipVariants({ variant, size }), className)}
      {...props}
    >
      {icon && <span className="shrink-0 [&>svg]:size-3.5">{icon}</span>}
      {children}
      {dismissible && onClose && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation()
              onClose()
            }
          }}
          className="ml-0.5 shrink-0 cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
        >
          ×
        </span>
      )}
    </button>
  )
}

export { Chip, chipVariants }
export type { ChipProps }
