import type { Insight, SilConfig } from '../types'

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
  const insights: Insight[] = []

  // CV > 1 indicates very high volatility
  if (cv > 1) {
    insights.push({
      type: 'variability',
      severity: 'warning',
      category,
      title: `Alta volatilidad en ${metric}`,
      description: `El coeficiente de variación es ${cv.toFixed(2)} — los valores fluctúan más del ${(cv * 100).toFixed(0)}% respecto al promedio.`,
      metric,
      currentValue: cv,
      sampleSize: values.length,
    })
  }

  return insights
}
