'use client'

// ── LiveCityMetrics ───────────────────────────────────────────────────────────
//
// Card que muestra métricas vivas de la ciudad.
// Doc 01 §1.2: Un solo color de acento (--tgo-brand), jerarquía por tamaño.
//
// Uso:
//   <LiveCityMetrics openCount={18} promoCount={4} newCount={3} avgPickup={11} />

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
        padding: '18px 16px',
        borderRadius: 22,
        background: 'var(--tgo-text-primary)',
        boxShadow: '0 8px 24px rgba(45, 42, 75, 0.35)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        {/* Pulsing green dot — only element with pulse-live (Doc 01 §2.5) */}
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: 'var(--tgo-network-live)',
            flexShrink: 0,
            animation: 'punto-tgo-pulse-dot 1.8s ease-in-out infinite',
          }}
        />
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            color: '#FFFFFF',
            letterSpacing: '0.08em',
            textTransform: 'uppercase' as const,
          }}
        >
          La ciudad ahora mismo
        </span>
      </div>

      {/* Stats grid — single accent color, hierarchy by size */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
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
                  fontSize: 22,
                  fontWeight: 700,
                  lineHeight: 1,
                }}
                suffixStyle={{
                  color: 'var(--tgo-brand)',
                  fontSize: 13,
                  fontWeight: 700,
                  lineHeight: 1,
                  marginLeft: 1,
                }}
              />
              <p
                style={{
                  color: 'rgba(255, 255, 255, 0.65)',
                  fontSize: 9.5,
                  lineHeight: 1,
                  marginTop: 4,
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
