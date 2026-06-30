import type { Insight, SilConfig } from '../types'
import { translateMetricShort } from '../reporting/metric-names'

export interface TrendResult {
  slope: number
  intercept: number
  direction: 'growing' | 'declining' | 'stable'
  strength: 'strong' | 'moderate' | 'weak'
}

export function linearRegression(values: number[]): TrendResult {
  const n = values.length
  if (n < 3) return { slope: 0, intercept: 0, direction: 'stable', strength: 'weak' }

  const indices = values.map((_, i) => i)
  const sumX = indices.reduce((a, b) => a + b, 0)
  const sumY = values.reduce((a, b) => a + b, 0)
  const sumXY = indices.reduce((sum, x, i) => sum + x * values[i], 0)
  const sumX2 = indices.reduce((sum, x) => sum + x * x, 0)

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n

  const meanY = sumY / n
  const relativeSlope = meanY !== 0 ? Math.abs(slope / meanY) : 0

  let direction: TrendResult['direction'] = 'stable'
  if (slope > 0 && relativeSlope > 0.01) direction = 'growing'
  else if (slope < 0 && relativeSlope > 0.01) direction = 'declining'

  let strength: TrendResult['strength'] = 'weak'
  if (relativeSlope > 0.1) strength = 'strong'
  else if (relativeSlope > 0.05) strength = 'moderate'

  return { slope, intercept, direction, strength }
}

export function analyzeTrend(
  metric: string,
  category: Insight['category'],
  values: number[],
  label: string,
  config: SilConfig
): Insight[] {
  if (values.length < config.trendMinPoints) return []

  const trend = linearRegression(values)
  if (trend.direction === 'stable') return []

  const name = translateMetricShort(metric)
  const isPositive = trend.direction === 'growing'
  const isStrong = trend.strength === 'strong'

  const narrative = isPositive
    ? `${name} muestra crecimiento sostenido en los ${label}.`
    : `${name} muestra una tendencia a la baja en los ${label}.`

  const changePercent = values.length >= 2 && values[0] > 0
    ? Math.round(((values[values.length - 1] - values[0]) / values[0]) * 100)
    : undefined

  return [{
    type: 'trend',
    severity: isPositive ? 'info' : isStrong ? 'critical' : 'warning',
    category,
    title: isPositive
      ? `Tendencia positiva en ${name}`
      : `Tendencia negativa en ${name}`,
    description: narrative,
    metric,
    currentValue: trend.slope,
    sampleSize: values.length,
    recommendation: isPositive
      ? undefined
      : 'Identificar la causa del declive y evaluar cambios en menú, precios o promociones.',
    changePercent,
  }]
}
