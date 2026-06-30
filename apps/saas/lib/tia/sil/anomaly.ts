import type { Insight, SilConfig } from '../types'
import { translateMetricShort } from '../reporting/metric-names'

export function zScore(value: number, mean: number, std: number): number {
  if (std === 0) return 0
  return (value - mean) / std
}

export function detectAnomaliesInSeries(
  metric: string,
  category: Insight['category'],
  values: number[],
  config: SilConfig
): Insight[] {
  if (values.length < config.minSampleSize) return []

  const avg = values.reduce((a, b) => a + b, 0) / values.length
  const std = Math.sqrt(values.map(v => (v - avg) ** 2).reduce((a, b) => a + b, 0) / (values.length - 1))

  if (std === 0) return []

  const name = translateMetricShort(metric)
  const anomalies: Insight[] = []

  for (let i = 0; i < values.length; i++) {
    const z = zScore(values[i], avg, std)
    if (Math.abs(z) > config.anomalyStdThreshold) {
      const isPositive = values[i] > avg
      anomalies.push({
        type: 'anomaly',
        severity: Math.abs(z) > 3 ? 'critical' : 'warning',
        category,
        title: isPositive
          ? `Buen pico en ${name}`
          : `Caída en ${name}`,
        description: isPositive
          ? `Tuviste ${values[i].toFixed(0)} (vs ~${avg.toFixed(0)} habitual). Algo bueno pasó — revisá si hubo promoción o evento para repetirlo.`
          : `Tuviste ${values[i].toFixed(0)} (vs ~${avg.toFixed(0)} habitual). Preocupante — revisá si hubo problema operativo.`,
        metric,
        currentValue: values[i],
        previousValue: Math.round(avg),
        changePercent: Math.round(((values[i] - avg) / avg) * 100),
        sampleSize: values.length,
        recommendation: isPositive
          ? 'Verificar si hubo promoción, evento o cambio que explique el pico.'
          : 'Revisar si hubo algún problema operativo (cierre, falta de stock, etc.).',
      })
    }
  }

  return anomalies
}
