import type { Insight, SilConfig } from '../types'
import type { CategoryData } from '../metrics'
import { translateMetricShort } from '../reporting/metric-names'

export function analyzeCategory(
  categories: CategoryData[],
  config: SilConfig
): Insight[] {
  if (categories.length < 2) return []

  const totalSold = categories.reduce((s, c) => s + c.totalSold, 0)
  const categoryCount = categories.length
  const expectedShare = 100 / categoryCount

  const insights: Insight[] = []

  for (const cat of categories) {
    if (cat.totalSold < config.minSampleSize) continue

    const share = totalSold > 0 ? (cat.totalSold / totalSold) * 100 : 0
    const shareDiff = share - expectedShare

    if (Math.abs(shareDiff) > 15) {
      const isOverperforming = shareDiff > 0
      const name = translateMetricShort(`category.${cat.category}`)
      insights.push({
        type: 'category',
        severity: isOverperforming ? 'info' : 'warning',
        category: 'products',
        title: isOverperforming
          ? `${cat.category} rinde por encima del promedio`
          : `${cat.category} rinde por debajo del promedio`,
        description: isOverperforming
          ? `Representa el ${share.toFixed(0)}% de ventas, muy por encima del promedio esperado. Considerar ampliar variedad.`
          : `Solo el ${share.toFixed(0)}% de ventas, por debajo del promedio. Revisar precios, visibilidad o rotación.`,
        metric: `category.${cat.category}.share`,
        currentValue: cat.totalSold,
        previousValue: Math.round(totalSold / categoryCount),
        changePercent: Math.round(shareDiff),
        sampleSize: cat.totalSold,
        recommendation: isOverperforming
          ? 'Considerar ampliar variedad en esta categoría.'
          : 'Revisar precios, visibilidad o rotación de productos en esta categoría.',
      })
    }
  }

  return insights
}
