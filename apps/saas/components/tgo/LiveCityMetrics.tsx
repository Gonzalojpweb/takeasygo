'use client'

// ── LiveCityMetrics ───────────────────────────────────────────────────────────
//
// Card compacta que muestra métricas vivas de la ciudad.
// Fondo navy (#2D2A4B) para transmitir confianza institucional.
// Colores por stat: abiertos=Activity, promos=Discovery, nuevos=Brand, espera=white.

import AnimatedNumber from '@/components/tgo/AnimatedNumber'

interface LiveCityMetricsProps {
  openCount: number
  promoCount: number
  newCount: number
  avgPickup: number | null
}

const STATS = [
  { key: 'abiertos', color: 'var(--tgo-state-activity)' },
  { key: 'promos', color: 'var(--tgo-state-discovery)' },
  { key: 'nuevos', color: 'var(--tgo-brand)' },
  { key: 'espera', color: '#FFFFFF' },
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
        padding: '14px 16px',
        borderRadius: 16,
        background: '#2D2A4B',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
      }}
    >
      {/* Stats grid — 4 columns with vertical separators */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {STATS.map((s, i) => {
          const val = values[s.key]
          if (val === null && s.key === 'espera') return null
          return (
            <div
              key={s.key}
              style={{
                textAlign: 'center',
                borderRight: i < STATS.length - 1 ? '1px solid rgba(255, 255, 255, 0.14)' : 'none',
              }}
            >
              <AnimatedNumber
                value={val ?? 0}
                suffix={s.key === 'espera' ? 'min' : undefined}
                numberStyle={{
                  color: s.color,
                  fontSize: 18,
                  fontWeight: 700,
                  lineHeight: 1,
                }}
                suffixStyle={{
                  color: s.color,
                  fontSize: 11,
                  fontWeight: 700,
                  lineHeight: 1,
                  marginLeft: 1,
                }}
              />
              <p
                style={{
                  color: 'rgba(255, 255, 255, 0.65)',
                  fontSize: 10,
                  fontWeight: 600,
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
    </div>
  )
}
