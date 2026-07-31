'use client'

// ── TGO Solid Icon Pill ──────────────────────────────────────────────────────
//
// Chip informativo sólido con ícono en círculo inset.
// Fondo saturado, círculo con salto de luminosidad, texto apilado.
//
// Uso: Instagram pill, Share pill, cualquier CTA informativo inline.

interface SolidIconPillProps {
  bgColor: string
  iconCircleColor?: string
  title: string
  subtitle: string
  icon: React.ReactNode
  href?: string
  onClick?: () => void
}

function SolidIconPill({
  bgColor,
  iconCircleColor = 'rgba(255,255,255,0.18)',
  title,
  subtitle,
  icon,
  href,
  onClick,
}: SolidIconPillProps) {
  const content = (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 14px 8px 8px',
        borderRadius: 'var(--tgo-radius-pill)',
        backgroundColor: bgColor,
        boxShadow: 'var(--shadow-card)',
        cursor: 'pointer',
        transition: 'transform 180ms var(--tgo-ease-standard), box-shadow 180ms var(--tgo-ease-standard)',
        textDecoration: 'none',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.03)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)'
      }}
    >
      {/* Icon circle */}
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          backgroundColor: iconCircleColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color: '#FFFFFF',
        }}
      >
        {icon}
      </div>

      {/* Text stack */}
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: '#FFFFFF',
          }}
        >
          {title}
        </span>
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 400,
            color: 'rgba(255,255,255,0.85)',
          }}
        >
          {subtitle}
        </span>
      </div>
    </div>
  )

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    )
  }

  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', padding: 0 }}>
      {content}
    </button>
  )
}

export { SolidIconPill }
export type { SolidIconPillProps }
