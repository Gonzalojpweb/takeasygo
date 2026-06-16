import type { Insight, SilConfig } from '../types'

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
  const insights: Insight[] = []

  // Ratio p90/p50 > 2 suggests high-end spikes worth noting
  if (dist.p50 > 0 && dist.p90 / dist.p50 > 2) {
    insights.push({
      type: 'distribution',
      severity: 'info',
      category,
      title: `Alta dispersión en ${metric} (p90/p50 = ${(dist.p90 / dist.p50).toFixed(1)})`,
      description: `P50: ${dist.p50.toFixed(1)} • P75: ${dist.p75.toFixed(1)} • P90: ${dist.p90.toFixed(1)} — los picos altos distorsionan el promedio.`,
      metric,
      currentValue: dist.p90,
      previousValue: dist.p50,
      changePercent: Math.round(((dist.p90 - dist.p50) / dist.p50) * 100),
      sampleSize: values.length,
    })
  }

  return insights
}
