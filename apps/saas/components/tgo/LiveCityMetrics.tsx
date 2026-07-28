'use client'

// ── LiveCityMetrics ───────────────────────────────────────────────────────────
//
// Reemplaza el CityNowModule estático con métricas vivas.
//
// Responsabilidades:
//   1. Mostrar métricas de ciudad (abiertos, promos, nuevos, espera promedio)
//   2. Animar cambios en los números con transiciones suaves
//   3. Actualizar datos periódicamente (polling)
//
// Dependencias:
//   - AnimatedNumber (componente atómico)
//   - tokens --tgo-*
//
// Uso:
//   <LiveCityMetrics openCount={18} promoCount={4} newCount={3} avgPickup={11} />

import { Users, Tag, Sparkles, Coffee } from 'lucide-react'
import AnimatedNumber from '@/components/tgo/AnimatedNumber'

interface CityMetric {
  label: string
  value: number
  suffix?: string
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>
}

interface LiveCityMetricsProps {
  /** Cantidad de locales abiertos */
  openCount: number
  /** Cantidad de promociones activas */
  promoCount: number
  /** Cantidad de locales nuevos */
  newCount: number
  /** Tiempo promedio de espera en minutos (null si no hay datos) */
  avgPickup: number | null
}

export default function LiveCityMetrics({
  openCount,
  promoCount,
  newCount,
  avgPickup,
}: LiveCityMetricsProps) {
  const metrics: CityMetric[] = [
    { label: 'abiertos', value: openCount, icon: Users },
    { label: 'promos', value: promoCount, icon: Tag },
    { label: 'nuevos', value: newCount, icon: Sparkles },
    ...(avgPickup !== null
      ? [{ label: 'espera promedio', value: avgPickup, suffix: 'min', icon: Coffee }]
      : []),
  ]

  return (
    <div
      className="flex gap-3 overflow-x-auto no-scrollbar"
      style={{ paddingInline: 'var(--tgo-page-padding)' }}
    >
      {metrics.map((m) => {
        const Icon = m.icon
        return (
          <div
            key={m.label}
            className="flex items-center gap-2 shrink-0"
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--tgo-radius-md)',
              backgroundColor: 'var(--tgo-surface-1)',
              border: '1px solid var(--tgo-border)',
            }}
          >
            <Icon
              size={14}
              style={{ color: 'var(--tgo-text-muted)' }}
            />
            <div>
              <AnimatedNumber
                value={m.value}
                suffix={m.suffix}
                numberStyle={{
                  color: 'var(--tgo-text-primary)',
                  fontSize: 'var(--tgo-type-body-sm)',
                  fontWeight: 700,
                  lineHeight: 1,
                }}
                suffixStyle={{
                  color: 'var(--tgo-text-primary)',
                  fontSize: 'var(--tgo-type-body-sm)',
                  fontWeight: 700,
                  lineHeight: 1,
                  marginLeft: 2,
                }}
              />
              <p
                style={{
                  color: 'var(--tgo-text-muted)',
                  fontSize: 10,
                  lineHeight: 1,
                  marginTop: 2,
                }}
              >
                {m.label}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
