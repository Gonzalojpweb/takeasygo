export type InsightType =
  | 'sample_size'
  | 'central_tendency'
  | 'distribution'
  | 'variability'
  | 'historical'
  | 'category'
  | 'trend'
  | 'anomaly'

export type Severity = 'info' | 'warning' | 'critical'

export type InsightCategory = 'orders' | 'revenue' | 'products' | 'club' | 'conversion' | 'menu' | 'operations'

export interface Insight {
  type: InsightType
  severity: Severity
  category: InsightCategory
  title: string
  description: string
  metric: string
  currentValue: number
  previousValue?: number
  changePercent?: number
  sampleSize: number
  recommendation?: string
}

export type RecommendationCategory = 'menu' | 'club' | 'operations' | 'promotions'
export type Priority = 'high' | 'medium' | 'low'

export interface Recommendation {
  title: string
  description: string
  action: string
  expectedImpact: string
  priority: Priority
  category: RecommendationCategory
  sourceMetric: string
}

export interface SilAnalysisRequest {
  tenantId: string
  dateFrom?: string
  dateTo?: string
}

export interface SilAnalysisResponse {
  insights: Insight[]
  anomalies: Insight[]
  metadata: {
    totalAnalyzers: number
    sampleRejected: number
    executionTimeMs: number
  }
}

export interface SilConfig {
  minSampleSize: number
  anomalyStdThreshold: number
  trendMinPoints: number
}

export type BenchmarkMetric =
  | 'orders7d'
  | 'revenue7d'
  | 'avgOrderValue'
  | 'newMembers7d'
  | 'activeMembers'
  | 'conversionRate'

export type BenchmarkStatus = 'top' | 'above_average' | 'average' | 'below_average' | 'bottom'

export interface BenchmarkItem {
  metric: BenchmarkMetric
  label: string
  value: number
  peerCount: number
  percentile: number
  p25: number
  p50: number
  p75: number
  p90: number
  status: BenchmarkStatus
  badge: string
  tooltip: string
}

export interface BenchmarkData {
  benchmarks: BenchmarkItem[]
  generatedAt: string
}
