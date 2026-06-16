import type { Insight, SilConfig } from '../types'

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

    // Only flag meaningful changes (>10%)
    if (Math.abs(changePercent) < 10) continue

    const isGrowth = changePercent > 0
    const severity = Math.abs(changePercent) > 50 ? 'critical' : 'warning'

    insights.push({
      type: 'historical',
      severity,
      category: input.category,
      title: isGrowth
        ? `${input.metric} aumentó ${Math.abs(changePercent).toFixed(0)}%`
        : `${input.metric} cayó ${Math.abs(changePercent).toFixed(0)}%`,
      description: isGrowth
        ? `Pasó de ${input.previousValue.toFixed(0)} a ${input.currentValue.toFixed(0)} ${input.label ?? 'vs período anterior'}.`
        : `Bajó de ${input.previousValue.toFixed(0)} a ${input.currentValue.toFixed(0)} ${input.label ?? 'vs período anterior'}.`,
      metric: input.metric,
      currentValue: input.currentValue,
      previousValue: input.previousValue,
      changePercent: Math.round(changePercent),
      sampleSize: 2,
      recommendation: isGrowth
        ? undefined
        : 'Revisar causas de la caída y considerar acciones correctivas.',
    })
  }

  return insights
}
