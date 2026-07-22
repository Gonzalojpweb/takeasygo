'use client'

// ── TGO ExperienceCard ────────────────────────────────────────────────────────
//
// Componente de negocio versátil.
// No es solo "promoción" — puede mostrar:
//   - Club / Cashback / QR / Evento / Happy Hour / Beneficio bancario
//   - Descuento / Promo / Beneficio
//
// Foto protagonista, tipografía limpia, badge sutil.
// Se siente como una oportunidad, no como publicidad.

import Link from 'next/link'

export type ExperienceType =
  | 'promo'
  | 'club'
  | 'cashback'
  | 'qr'
  | 'event'
  | 'happy-hour'
  | 'bank-benefit'

interface Experience {
  _id: string
  title: string
  description: string
  imageUrl?: string
  price?: number
  originalPrice?: number
  tenantId: string
  locationId?: string
  tenantSlug?: string
  type: ExperienceType
  tenantLogo?: string
  tenantName?: string
  /** Label del badge — override automático si no se provee */
  badgeLabel?: string
  /** Color del badge — override automático si no se provee */
  badgeColor?: string
}

const BADGE_CONFIG: Record<
  ExperienceType,
  { label: string; color: string; bg: string }
> = {
  promo: {
    label: 'Promo',
    color: 'var(--tgo-state-success)',
    bg: 'var(--tgo-state-success-soft)',
  },
  club: {
    label: 'Club',
    color: 'var(--tgo-brand-primary)',
    bg: 'var(--tgo-brand-primary-soft)',
  },
  cashback: {
    label: 'Cashback',
    color: 'var(--tgo-state-success)',
    bg: 'var(--tgo-state-success-soft)',
  },
  qr: {
    label: 'QR',
    color: 'var(--tgo-state-interactive)',
    bg: 'var(--tgo-state-interactive-soft)',
  },
  event: {
    label: 'Evento',
    color: 'var(--tgo-state-info)',
    bg: 'var(--tgo-state-info-soft)',
  },
  'happy-hour': {
    label: 'Happy Hour',
    color: 'var(--tgo-state-warning)',
    bg: 'var(--tgo-state-warning-soft)',
  },
  'bank-benefit': {
    label: 'Beneficio',
    color: 'var(--tgo-state-interactive)',
    bg: 'var(--tgo-state-interactive-soft)',
  },
}

export default function ExperienceCard({ experience: e }: { experience: Experience }) {
  if (!e.tenantSlug) return null

  const isSale = e.type === 'promo' && e.originalPrice
  const discount = isSale
    ? Math.round(((e.originalPrice! - e.price!) / e.originalPrice!) * 100)
    : 0

  const href = e.locationId
    ? `/${e.tenantSlug}/menu/${e.locationId}`
    : `/${e.tenantSlug}`

  const badge = BADGE_CONFIG[e.type] ?? BADGE_CONFIG.promo

  return (
    <Link
      href={href}
      className="block shrink-0 w-[280px] snap-start group active:scale-[0.985]"
      style={{
        borderRadius: 'var(--tgo-radius-lg)',
        overflow: 'hidden',
        backgroundColor: 'var(--tgo-surface-1)',
        boxShadow: 'var(--tgo-elevation-card)',
        border: '1px solid var(--tgo-border-active)',
        transition: `all var(--tgo-duration-base) var(--tgo-ease-standard)`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = 'var(--tgo-elevation-floating)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'var(--tgo-elevation-card)'
      }}
    >
      {/* Image area */}
      <div className="relative overflow-hidden" style={{ height: 168 }}>
        {e.imageUrl ? (
          <img
            src={e.imageUrl}
            alt={e.title}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              background:
                'linear-gradient(135deg, #F74211 0%, #F4B42D 50%, #16A34A 100%)',
            }}
          >
            <span style={{ fontSize: 48, opacity: 0.3 }}>
              {e.type === 'club' ? '⭐' : e.type === 'cashback' ? '💰' : '🎁'}
            </span>
          </div>
        )}

        {/* Gradient overlay */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to top, rgba(26,26,26,0.64) 0%, transparent 60%)',
          }}
        />

        {/* Top: Tenant logo */}
        {e.tenantLogo && (
          <div
            className="absolute top-3 left-3"
            style={{
              width: 36,
              height: 36,
              borderRadius: 'var(--tgo-radius-md)',
              overflow: 'hidden',
              boxShadow: 'var(--tgo-elevation-floating)',
            }}
          >
            <img
              src={e.tenantLogo}
              alt={e.tenantName || ''}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Badge */}
        <div
          className="absolute top-3 right-3"
          style={{
            padding: '4px 10px',
            borderRadius: 'var(--tgo-radius-pill)',
            backgroundColor: e.badgeColor ?? badge.bg,
            color: e.badgeColor ?? badge.color,
            fontSize: 'var(--tgo-type-caption)',
            fontWeight: 700,
            boxShadow: 'var(--tgo-elevation-floating)',
          }}
        >
          {e.badgeLabel ?? badge.label}
          {discount > 0 && ` ${discount}% OFF`}
        </div>

        {/* Bottom: Content */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h3
            className="leading-tight mb-1"
            style={{
              color: 'var(--tgo-text-inverse)',
              fontSize: 'var(--tgo-type-title)',
              fontWeight: 600,
            }}
          >
            {e.title}
          </h3>

          <p
            className="line-clamp-2 leading-snug"
            style={{
              color: 'rgba(255,255,255,0.7)',
              fontSize: 'var(--tgo-type-body-sm)',
            }}
          >
            {e.description}
          </p>

          {isSale && (
            <div className="flex items-baseline gap-2 mt-2">
              <span
                style={{
                  color: 'var(--tgo-text-inverse)',
                  fontSize: 'var(--tgo-type-section)',
                  fontWeight: 700,
                  letterSpacing: 'var(--tgo-tracking-tight)',
                }}
              >
                ${e.price!.toLocaleString('es-AR')}
              </span>
              {e.originalPrice && (
                <span
                  style={{
                    color: 'rgba(255,255,255,0.5)',
                    fontSize: 'var(--tgo-type-body)',
                    textDecoration: 'line-through',
                  }}
                >
                  ${e.originalPrice.toLocaleString('es-AR')}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}
