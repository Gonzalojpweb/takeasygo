import type { Insight, SilConfig } from '../types'
import { translateMetricShort } from '../reporting/metric-names'

interface HistoricalInput {
  metric: string
  category: Insight['category']
  currentValue: number
  previousValue: number
  label?: string
}

export function analyzeHistorical(
  inputs: HistoricalInput[],
  config: SilConfig
): Insight[] {
  const insights: Insight[] = []

  for (const input of inputs) {
    if (input.previousValue <= 0) continue

    const changePercent = ((input.currentValue - input.previousValue) / input.previousValue) * 100

    if (Math.abs(changePercent) < 10) continue

    const isGrowth = changePercent > 0
    const severity = Math.abs(changePercent) > 50 ? 'critical' : 'warning'
    const pct = Math.abs(changePercent).toFixed(0)
    const name = translateMetricShort(input.metric)

    insights.push({
      type: 'historical',
      severity,
      category: input.category,
      title: isGrowth
        ? `Tus ${name} subieron ${pct}%`
        : `Tus ${name} bajaron ${pct}%`,
      description: isGrowth
        ? `Pasaron de ${input.previousValue.toFixed(0)} a ${input.currentValue.toFixed(0)} ${input.label ?? 'vs el período anterior'}. Buen crecimiento.`
        : `Bajaron de ${input.previousValue.toFixed(0)} a ${input.currentValue.toFixed(0)} ${input.label ?? 'vs el período anterior'}. Revisá qué pasó.`,
      metric: input.metric,
      currentValue: input.currentValue,
      previousValue: input.previousValue,
      changePercent: Math.round(changePercent),
      sampleSize: 2,
      recommendation: isGrowth
        ? undefined
        : 'Revisar disponibilidad de ingredientes, horarios y promociones activas.',
    })
  }

  return insights
}
