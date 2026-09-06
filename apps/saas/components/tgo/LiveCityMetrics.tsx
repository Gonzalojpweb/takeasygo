'use client'

// ── LiveCityMetrics ───────────────────────────────────────────────────────────
//
// Card compacta que muestra métricas vivas de la ciudad.
// Doc 01 §1.2: Un solo color de acento (--tgo-brand), jerarquía por tamaño.
// Los puntos de actividad ahora se muestran en el mapa (ExploreMap).

import AnimatedNumber from '@/components/tgo/AnimatedNumber'

interface LiveCityMetricsProps {
  openCount: number
  promoCount: number
  newCount: number
  avgPickup: number | null
}

const STATS = [
  { key: 'abiertos' },
  { key: 'promos' },
  { key: 'nuevos' },
  { key: 'espera' },
] as const

const LABELS: Record<string, string> = {
  abiertos: 'abiertos',
  promos: 'promos',
  nuevos: 'nuevos',
  espera: 'espera prom.',
}

export default function LiveCityMetrics({
  openCount,
  promoCount,
  newCount,
  avgPickup,
}: LiveCityMetricsProps) {
  const values: Record<string, number | null> = {
    abiertos: openCount,
    promos: promoCount,
    nuevos: newCount,
    espera: avgPickup,
  }

  return (
    <div
      style={{
        margin: '0 var(--tgo-page-padding)',
        padding: '12px 14px',
        borderRadius: 16,
        background: 'var(--tgo-surface-2)',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: 'var(--tgo-network-live)',
            flexShrink: 0,
            animation: 'punto-tgo-pulse-dot 1.8s ease-in-out infinite',
          }}
        />
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--tgo-text-inverse)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase' as const,
          }}
        >
          La ciudad ahora mismo
        </span>
      </div>

      {/* Stats grid — single accent color, hierarchy by size */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        {STATS.map((s) => {
          const val = values[s.key]
          if (val === null && s.key === 'espera') return null
          return (
            <div key={s.key} style={{ textAlign: 'center' }}>
              <AnimatedNumber
                value={val ?? 0}
                suffix={s.key === 'espera' ? 'min' : undefined}
                numberStyle={{
                  color: 'var(--tgo-brand)',
                  fontSize: 18,
                  fontWeight: 700,
                  lineHeight: 1,
                }}
                suffixStyle={{
                  color: 'var(--tgo-brand)',
                  fontSize: 11,
                  fontWeight: 700,
                  lineHeight: 1,
                  marginLeft: 1,
                }}
              />
              <p
                style={{
                  color: 'var(--tgo-text-muted)',
                  fontSize: 8.5,
                  lineHeight: 1,
                  marginTop: 3,
                  textTransform: 'lowercase' as const,
                }}
              >
                {LABELS[s.key]}
              </p>
            </div>
          )
        })}
      </div>

      <style>{`
        @keyframes punto-tgo-pulse-dot {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.6; }
        }
      `}</style>
    </div>
  )
}
