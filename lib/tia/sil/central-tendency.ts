import type { Insight, SilConfig } from '../types'

export function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function mode(values: number[]): number | null {
  if (values.length === 0) return null
  const freq = new Map<number, number>()
  for (const v of values) freq.set(v, (freq.get(v) ?? 0) + 1)
  let maxFreq = 0
  let modeVal: number | null = null
  for (const [v, f] of freq) {
    if (f > maxFreq) {
      maxFreq = f
      modeVal = v
    }
  }
  return modeVal
}

export function analyzeCentralTendency(
  metric: string,
  category: Insight['category'],
  values: number[],
  config: SilConfig
): Insight[] {
  if (values.length < config.minSampleSize) return []

  const avg = mean(values)
  const med = median(values)
  const insights: Insight[] = []

  // Only generate insight if mean and median diverge meaningfully (>10%)
  if (avg > 0 && Math.abs(avg - med) / avg > 0.1) {
    insights.push({
      type: 'central_tendency',
      severity: 'info',
      category,
      title: `La media de ${metric} difiere de la mediana`,
      description: `Media: ${avg.toFixed(1)} vs Mediana: ${med.toFixed(1)} — sugiere distribución asimétrica.`,
      metric,
      currentValue: avg,
      previousValue: med,
      changePercent: Math.round(((avg - med) / med) * 100),
      sampleSize: values.length,
    })
  }

  return insights
}
