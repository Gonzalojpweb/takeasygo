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
