'use client'

// ── TGO Chip ─────────────────────────────────────────────────────────────────
//
// Primitive base. No es un Badge de shadcn.
// Chip = objeto interactivo, descartable, que filtra o selecciona.
// No confundir con Tag (informativo, no descartable).
//
// Todos los colores vía inline styles + --tgo-* tokens.
// (Tailwind arbitrary values con CSS variables no generaba los estilos en v4)

type ChipVariant = 'default' | 'active' | 'suggestion' | 'brand' | 'danger' | 'ghost'
type ChipSize = 'sm' | 'md' | 'lg' | 'pill'

interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ChipVariant
  size?: ChipSize
  dismissible?: boolean
  onClose?: () => void
  icon?: React.ReactNode
}

const SIZE_STYLES: Record<ChipSize, React.CSSProperties> = {
  sm: { height: 24, padding: '0 10px', fontSize: 'var(--tgo-type-caption)', borderRadius: 'var(--tgo-radius-sm)' },
  md: { height: 32, padding: '0 12px', fontSize: 'var(--tgo-type-body-sm)', borderRadius: 'var(--tgo-radius-md)' },
  lg: { height: 40, padding: '0 16px', fontSize: 'var(--tgo-type-body)', borderRadius: 'var(--tgo-radius-md)' },
  pill: { height: 32, padding: '0 12px', fontSize: 'var(--tgo-type-body-sm)', borderRadius: 'var(--tgo-radius-pill)' },
}

const VARIANT_STYLES: Record<ChipVariant, React.CSSProperties> = {
  default: {
    backgroundColor: 'var(--tgo-surface-card)',
    color: 'var(--tgo-state-trust)',
    border: '1px solid var(--tgo-border)',
  },
  active: {
    backgroundColor: 'var(--tgo-state-trust-soft)',
    color: 'var(--tgo-state-trust)',
    border: '1px solid var(--tgo-state-trust)',
    fontWeight: 600,
  },
  suggestion: {
    backgroundColor: 'var(--tgo-surface-1)',
    color: 'var(--tgo-text-primary)',
    border: '1px solid transparent',
  },
  brand: {
    backgroundColor: 'var(--tgo-brand-primary-soft)',
    color: 'var(--tgo-brand-primary)',
    border: '1px solid transparent',
    fontWeight: 600,
  },
  danger: {
    backgroundColor: 'var(--tgo-state-danger-soft)',
    color: 'var(--tgo-state-danger)',
    border: '1px solid transparent',
  },
  ghost: {
    backgroundColor: 'transparent',
    color: 'var(--tgo-text-muted)',
    border: '1px solid transparent',
  },
}

function Chip({
  variant = 'default',
  size = 'md',
  dismissible = false,
  onClose,
  icon,
  children,
  style,
  ...props
}: ChipProps) {
  return (
    <button
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        whiteSpace: 'nowrap',
        flexShrink: 0,
        transition: 'all 200ms var(--tgo-ease-standard)',
        userSelect: 'none',
        cursor: 'pointer',
        ...SIZE_STYLES[size],
        ...VARIANT_STYLES[variant],
        ...style,
      }}
      {...props}
    >
      {icon && <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', lineHeight: 0 }}>{icon}</span>}
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
          style={{
            marginLeft: 2,
            flexShrink: 0,
            cursor: 'pointer',
            opacity: 0.6,
          }}
        >
          ×
        </span>
      )}
    </button>
  )
}

export { Chip }
export type { ChipProps, ChipVariant, ChipSize }
