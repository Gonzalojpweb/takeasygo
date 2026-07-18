'use client'

// ── TGO CategoryCard ──────────────────────────────────────────────────────────
//
// Componente de negocio para categorías.
// Objeto visual. No un botón.
// Icono + color pastel + sombra suave + profundidad.
// Se siente como un objeto físico que podés tocar.

interface Props {
  name: string
  icon: string
  color: string
  bg: string
  onClick?: () => void
}

export default function CategoryCard({
  name,
  icon,
  color,
  bg,
  onClick,
}: Props) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 group"
    >
      <div
        className="flex items-center justify-center group-active:scale-90"
        style={{
          width: 56,
          height: 56,
          borderRadius: 'var(--tgo-radius-lg)',
          backgroundColor: bg,
          boxShadow: 'var(--tgo-elevation-card)',
          border: '1px solid var(--tgo-border)',
          fontSize: 24,
          transition: `all var(--tgo-duration-base) var(--tgo-ease-standard)`,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = 'var(--tgo-elevation-floating)'
          e.currentTarget.style.borderColor = 'var(--tgo-border-active)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = 'var(--tgo-elevation-card)'
          e.currentTarget.style.borderColor = 'var(--tgo-border)'
        }}
      >
        {icon}
      </div>

      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 'var(--tgo-tracking-wider)',
          textTransform: 'uppercase',
          color: 'var(--tgo-text-muted)',
          transition: `color var(--tgo-duration-fast) var(--tgo-ease-standard)`,
        }}
      >
        {name}
      </span>
    </button>
  )
}
