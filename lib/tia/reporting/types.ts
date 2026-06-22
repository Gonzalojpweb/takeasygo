import type { Insight, Recommendation, BenchmarkItem } from '../types'

export type ReportTone = 'excelente' | 'bueno' | 'estable' | 'preocupante' | 'critico'

export type Severity = 'critical' | 'warning' | 'info'

export interface Finding {
  emoji: string
  message: string
  recommendation: string
  impact: 'Alto' | 'Medio' | 'Bajo'
  source: string
}

export interface Opportunity {
  headline: string
  explanation: string
  recommendation: string
  impact: 'Alto' | 'Medio' | 'Bajo'
}

export interface ProductReport {
  name: string
  sales: number
  share: number
  label: 'estrella' | 'bueno' | 'normal'
  revenue: number
}

export interface ConversionBottleneck {
  step: string
  dropPercent: number
  narrative: string
}

export interface BenchmarkComparison {
  label: string
  value: string
  status: 'top' | 'above_average' | 'average' | 'below_average' | 'bottom'
  narrative: string
}

export interface WeekPriority {
  title: string
  description: string
  impact: 'Alto' | 'Medio' | 'Bajo'
}

export interface TiaReport {
  tone: ReportTone
  greeting: string
  headline: string
  findings: Finding[]
  opportunities: Opportunity[]
  products: ProductReport[]
  starProduct: ProductReport | null
  productNarrative: string
  conversion: {
    bottleneck: ConversionBottleneck | null
    narrative: string
  }
  benchmark: BenchmarkComparison[]
  priorities: WeekPriority[]
  whatsapp: string
}

export interface ReportContext {
  metrics: import('../metrics').TiaMetricsData
  insights: Insight[]
  anomalies: Insight[]
  recommendations: Recommendation[]
  benchmark: BenchmarkItem[]
}
