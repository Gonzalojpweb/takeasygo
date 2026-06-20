import type {
  Insight,
  SilAnalysisResponse,
  SilConfig,
} from '../types'
import type { TiaMetricsData, DailySummaryData, TrendsData, HistoricalData, CategoryData, TopProductsData, ClubGrowthData } from '../metrics'
import { validateSampleSize } from './sample-size'
import { analyzeCentralTendency } from './central-tendency'
import { analyzeDistribution } from './distribution'
import { analyzeVariability } from './variability'
import { analyzeHistorical } from './historical'
import { analyzeCategory } from './category'
import { analyzeTrend } from './trend'
import { detectAnomaliesInSeries } from './anomaly'
import { analyzeBehavioral } from './behavioral'
import { analyzeChurn, analyzeRecurrence } from './churn'
import { fetchPostHogTrend } from '../posthog'

const DEFAULT_CONFIG: SilConfig = {
  minSampleSize: 30,
  anomalyStdThreshold: 2,
  trendMinPoints: 7,
}

export async function runSilAnalysis(
  tenantId: string,
  metrics: TiaMetricsData,
  config: SilConfig = DEFAULT_CONFIG
): Promise<SilAnalysisResponse> {
  const start = Date.now()

  const insights: Insight[] = []
  let sampleRejected = 0

  // ── 1. Time series contexts from historical data ──────────────────────────
  const seriesConfigs: { metric: string; category: Insight['category']; values: number[] }[] = []

  if (metrics.historical.orders.length > 0) {
    seriesConfigs.push({
      metric: 'orders.daily',
      category: 'orders',
      values: metrics.historical.orders.map(d => d.value),
    })
  }
  if (metrics.historical.revenue.length > 0) {
    seriesConfigs.push({
      metric: 'revenue.daily',
      category: 'revenue',
      values: metrics.historical.revenue.map(d => d.value),
    })
  }
  if (metrics.historical.members.length > 0) {
    seriesConfigs.push({
      metric: 'members.daily',
      category: 'club',
      values: metrics.historical.members.map(d => d.value),
    })
  }

  for (const sc of seriesConfigs) {
    if (!validateSampleSize(sc.values.length, config)) {
      sampleRejected++
      continue
    }

    insights.push(...analyzeCentralTendency(sc.metric, sc.category, sc.values, config))
    insights.push(...analyzeDistribution(sc.metric, sc.category, sc.values, config))
    insights.push(...analyzeVariability(sc.metric, sc.category, sc.values, config))
    insights.push(...analyzeTrend(sc.metric, sc.category, sc.values, 'últimos 30 días', config))
    insights.push(...detectAnomaliesInSeries(sc.metric, sc.category, sc.values, config))
  }

  // ── 2. Historical comparison (7d vs prev 7d) ─────────────────────────────
  insights.push(...analyzeHistorical([
    {
      metric: 'orders.weekly',
      category: 'orders',
      currentValue: metrics.trends.orders7d,
      previousValue: metrics.trends.ordersPrev7d,
      label: 'vs semana anterior',
    },
    {
      metric: 'revenue.weekly',
      category: 'revenue',
      currentValue: metrics.trends.revenue7d,
      previousValue: metrics.trends.revenuePrev7d,
      label: 'vs semana anterior',
    },
  ], config))

  // ── 3. Category analysis ──────────────────────────────────────────────────
  if (metrics.sil.categories.length > 0) {
    insights.push(...analyzeCategory(metrics.sil.categories, config))
  }

  // ── 4. Behavioral trends from PostHog (filtered by tenant) ─────────────────
  const behavioralEvents = ['menu.opened', 'dish.viewed', 'dish.added']
  for (const event of behavioralEvents) {
    const trend = await fetchPostHogTrend(event, 30, tenantId)
    if (trend.length >= config.trendMinPoints) {
      const values = trend.map(d => d.value)
      insights.push(...analyzeTrend(event, 'menu', values, 'últimos 30 días', config))
      insights.push(...detectAnomaliesInSeries(event, 'menu', values, config))
    }
  }

  // ── 5. Club growth assessment ─────────────────────────────────────────────
  if (metrics.clubGrowth.totalMembers >= config.minSampleSize) {
    const activeRatio = metrics.clubGrowth.totalMembers > 0
      ? metrics.clubGrowth.activeMembers / metrics.clubGrowth.totalMembers
      : 0
    if (activeRatio < 0.5) {
      insights.push({
        type: 'central_tendency',
        severity: 'warning',
        category: 'club',
        title: 'Baja tasa de membresía activa',
        description: `Solo el ${(activeRatio * 100).toFixed(0)}% de miembros está activo (${metrics.clubGrowth.activeMembers} de ${metrics.clubGrowth.totalMembers}).`,
        metric: 'club.activeRatio',
        currentValue: metrics.clubGrowth.activeMembers,
        previousValue: metrics.clubGrowth.totalMembers,
        changePercent: Math.round((activeRatio - 0.5) * 100),
        sampleSize: metrics.clubGrowth.totalMembers,
        recommendation: 'Considerar campaña de reactivación para miembros inactivos.',
      })
    }
  }

  // ── 7. Behavioral Intelligence ────────────────────────────────────────────
  const behavioralResult = await analyzeBehavioral(tenantId, config)
  if (behavioralResult.clubImpact) insights.push(behavioralResult.clubImpact)
  if (behavioralResult.rewardAdvanceImpact) insights.push(behavioralResult.rewardAdvanceImpact)

  // ── 8. Churn & Recurrence ──────────────────────────────────────────────────
  const churnInsight = await analyzeChurn(tenantId, config)
  if (churnInsight) insights.push(churnInsight)

  const recurrenceInsight = await analyzeRecurrence(tenantId, config)
  if (recurrenceInsight) insights.push(recurrenceInsight)

  // ── 9. Product-level anomaly (top sellers) ────────────────────────────────
  if (metrics.topProducts.mostSold.length > 0) {
    const soldValues = metrics.topProducts.mostSold.map(p => p.count)
    if (soldValues.length >= 3) {
      insights.push(...detectAnomaliesInSeries(
        'products.sold',
        'products',
        soldValues,
        config,
      ))
    }
  }

  // ── Separate anomalies from general insights ──────────────────────────────
  const anomalies = insights.filter(i => i.type === 'anomaly')
  const regular = insights.filter(i => i.type !== 'anomaly')

  // Sort by severity
  const severityRank = { critical: 3, warning: 2, info: 1 }
  regular.sort((a, b) => severityRank[b.severity] - severityRank[a.severity])
  anomalies.sort((a, b) => severityRank[b.severity] - severityRank[a.severity])

  return {
    insights: regular,
    anomalies,
    metadata: {
      totalAnalyzers: seriesConfigs.length + 5,
      sampleRejected,
      executionTimeMs: Date.now() - start,
    },
  }
}
