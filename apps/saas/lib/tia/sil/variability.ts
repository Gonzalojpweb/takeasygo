import type { Insight, SilConfig } from '../types'
import { translateMetricShort } from '../reporting/metric-names'

export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0
  const avg = values.reduce((a, b) => a + b, 0) / values.length
  const sqDiffs = values.map(v => (v - avg) ** 2)
  return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / (values.length - 1))
}

export function coefficientOfVariation(values: number[]): number {
  const avg = values.reduce((a, b) => a + b, 0) / values.length
  if (avg === 0) return 0
  return standardDeviation(values) / avg
}

export function analyzeVariability(
  metric: string,
  category: Insight['category'],
  values: number[],
  config: SilConfig
): Insight[] {
  if (values.length < config.minSampleSize) return []

  const cv = coefficientOfVariation(values)
  const name = translateMetricShort(metric)
  const insights: Insight[] = []

  if (cv > 1) {
    insights.push({
      type: 'variability',
      severity: 'warning',
      category,
      title: `Tus ${name} cambian mucho día a día`,
      description: `Los valores son muy irregulares. Pueden haber días con mucha demanda y otros con muy poca actividad.`,
      metric,
      currentValue: cv,
      sampleSize: values.length,
    })
  }

  return insights
}
