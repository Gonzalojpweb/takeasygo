import type { Insight, SilConfig } from '../types'
import { translateMetricShort } from '../reporting/metric-names'

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = (p / 100) * (sorted.length - 1)
  const lower = Math.floor(idx)
  const upper = Math.ceil(idx)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (idx - lower) * (sorted[upper] - sorted[lower])
}

export interface DistributionResult {
  p50: number
  p75: number
  p90: number
  p95: number
}

export function computeDistribution(values: number[]): DistributionResult {
  const sorted = [...values].sort((a, b) => a - b)
  return {
    p50: percentile(sorted, 50),
    p75: percentile(sorted, 75),
    p90: percentile(sorted, 90),
    p95: percentile(sorted, 95),
  }
}

export function analyzeDistribution(
  metric: string,
  category: Insight['category'],
  values: number[],
  config: SilConfig
): Insight[] {
  if (values.length < config.minSampleSize) return []

  const dist = computeDistribution(values)
  const name = translateMetricShort(metric)
  const insights: Insight[] = []

  if (dist.p50 > 0 && dist.p90 / dist.p50 > 2) {
    insights.push({
      type: 'distribution',
      severity: 'info',
      category,
      title: `Hay días excepcionales en tus ${name}`,
      description: `La mayoría de los días son moderados pero algunos se disparan mucho por encima de lo normal. Revisá qué causó esos picos.`,
      metric,
      currentValue: dist.p90,
      previousValue: dist.p50,
      changePercent: Math.round(((dist.p90 - dist.p50) / dist.p50) * 100),
      sampleSize: values.length,
    })
  }

  return insights
}
