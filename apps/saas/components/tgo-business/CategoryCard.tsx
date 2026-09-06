'use client'

// ── TGO CategoryCard ──────────────────────────────────────────────────────────
//
// Componente de negocio para categorías.
// Seleccionable: glow naranja cuando está activo.
// TGO Foundations §8: color en fondo, no en trazo del ícono.

interface Props {
  name: string
  icon: string
  color: string
  bg: string
  selected?: boolean
  onClick?: () => void
}

export default function CategoryCard({
  name,
  icon,
  bg,
  selected = false,
  onClick,
}: Props) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 group"
    >
      <div
        className="flex items-center justify-center group-active:scale-90 transition-all"
        style={{
          width: 58,
          height: 58,
          borderRadius: selected ? 'var(--tgo-radius-pill)' : 'var(--tgo-radius-md)',
          backgroundColor: selected ? 'var(--tgo-brand)' : bg,
          boxShadow: selected
            ? '0 0 0 4px rgba(247, 66, 17, 0.15), 0 4px 12px rgba(247, 66, 17, 0.25)'
            : 'none',
          border: `1px solid ${selected ? 'var(--tgo-brand)' : 'var(--tgo-border)'}`,
          fontSize: 24,
        }}
      >
        {icon}
      </div>

      <span
        style={{
          fontSize: 10,
          fontWeight: selected ? 700 : 500,
          textTransform: 'capitalize',
          color: selected ? 'var(--tgo-brand)' : 'var(--tgo-text-muted)',
          textAlign: 'center',
          lineHeight: 1.2,
        }}
      >
        {name}
      </span>
    </button>
  )
}
