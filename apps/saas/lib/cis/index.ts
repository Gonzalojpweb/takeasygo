// ─────────────────────────────────────────────────────────────────────────────
// lib/cis/index.ts — Barrel export del Customer Intelligence System
// ─────────────────────────────────────────────────────────────────────────────
// Propósito: Punto de entrada único para todos los módulos CIS.
// ─────────────────────────────────────────────────────────────────────────────

export { computeAllMetrics, updateProfileMetrics, computeBaseMetrics, computeFavorites, computeBatchEngagementMetrics } from './metrics'
export { computeHealthScore } from './health-score'
export { classifySegment, computeTenantStats, resegmentateAll } from './segmentation'
export { detectSignals } from './signals'
export { getActionForSegment, getActionsForSegments } from './actions'
export { captureEvent, captureOrderCompleted, captureSegmentChanged, captureSignalDetected, captureHealthScoreChanged, captureEventsBatch } from './events'
export { saveHealthScoreSnapshot, getHealthScoreTrend, getTrendSummary } from './history'
export { findCustomersWhoBoughtWithout, getSegmentDistribution, getCustomersBySegment, getCustomerIntelligenceSummary } from './tia-bridge'
export { fetchCustomerEngagement, fetchBatchEngagement } from './posthog-bridge'
export type { CisConfig, CisAnalysisResult, TenantCustomerStats, CustomerCalcData } from './types'
export { DEFAULT_CIS_CONFIG } from './types'
