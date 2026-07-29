'use client'

// ── LiveCityMetrics ───────────────────────────────────────────────────────────
//
// Card oscura con gradiente navy que muestra métricas vivas de la ciudad.
// El único bloque oscuro de la Home — tiene que saltar a la vista.
//
// Estructura:
//   - Header: dot verde pulsante + "LA CIUDAD AHORA MISMO"
//   - Stats grid: 4 columnas con números grandes de color funcional
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
  { key: 'abiertos', color: '#34D399' },
  { key: 'promos', color: '#FAB300' },
  { key: 'nuevos', color: '#7A5AF8' },
  { key: 'espera', color: '#38BDF8' },
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
        background: 'linear-gradient(135deg, #2D2A4B 0%, #1F1D38 100%)',
        boxShadow: '0 8px 24px rgba(45, 42, 75, 0.35)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        {/* Pulsing green dot */}
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: '#34D399',
            flexShrink: 0,
            animation: 'tgo-pulse-dot 1.8s ease-in-out infinite',
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

      {/* Stats grid */}
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
                  color: s.color,
                  fontSize: 22,
                  fontWeight: 700,
                  lineHeight: 1,
                }}
                suffixStyle={{
                  color: s.color,
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
        @keyframes tgo-pulse-dot {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.6; }
        }
      `}</style>
    </div>
  )
}
