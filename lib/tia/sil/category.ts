import type { Insight, SilConfig } from '../types'
import type { CategoryData } from '../metrics'

export function analyzeCategory(
  categories: CategoryData[],
  config: SilConfig
): Insight[] {
  if (categories.length < 2) return []

  const totalSold = categories.reduce((s, c) => s + c.totalSold, 0)
  const totalRevenue = categories.reduce((s, c) => s + c.revenue, 0)
  const categoryCount = categories.length

  const insights: Insight[] = []

  for (const cat of categories) {
    if (cat.totalSold < config.minSampleSize) continue

    const share = totalSold > 0 ? (cat.totalSold / totalSold) * 100 : 0
    const expectedShare = 100 / categoryCount
    const shareDiff = share - expectedShare

    // Flag categories significantly above or below expected share
    if (Math.abs(shareDiff) > 15) {
      const isOverperforming = shareDiff > 0
      insights.push({
        type: 'category',
        severity: isOverperforming ? 'info' : 'warning',
        category: 'products',
        title: isOverperforming
          ? `${cat.category} rinde por encima del promedio`
          : `${cat.category} rinde por debajo del promedio`,
        description: isOverperforming
          ? `Representa el ${share.toFixed(0)}% de ventas (esperado: ${expectedShare.toFixed(0)}%). +${shareDiff.toFixed(0)}% vs promedio.`
          : `Solo el ${share.toFixed(0)}% de ventas (esperado: ${expectedShare.toFixed(0)}%). ${shareDiff.toFixed(0)}% vs promedio.`,
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
