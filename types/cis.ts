// ─────────────────────────────────────────────────────────────────────────────
// types/cis.ts — Tipos compartidos del Customer Intelligence System
// ─────────────────────────────────────────────────────────────────────────────
// Propósito: Definir todos los tipos que CIS usa internamente y que
// potencialmente el frontend u otros módulos necesitan importar.
// Separados de lib/cis/types.ts (que tiene tipos internos del engine).
// ─────────────────────────────────────────────────────────────────────────────

// ── Segmentos (P1 — siempre relativos al tenant) ────────────────────────────
export type CustomerSegment =
  | 'NEW'
  | 'FREQUENT'
  | 'VIP'
  | 'PREMIUM'
  | 'EXPLORER'
  | 'LOYAL'
  | 'AT_RISK'
  | 'DORMANT'
  | 'PROMOTION_HUNTER'
  | 'HIGH_POTENTIAL'

// ── Señales (P2 — comportamiento individual, no genérico) ────────────────────
export type CustomerSignal =
  | 'highly_frequent'
  | 'decelerating'
  | 'spending_growth'
  | 'frequency_drop'
  | 'highly_loyal'
  | 'discount_sensitive'
  | 'explorer'
  | 'premium'
  | 'high_potential'
  | 'dormant'
  | 'at_risk'
  | 'recovered'

// ── Eventos crudos (P7 — guardar siempre) ────────────────────────────────────
export type CustomerEventType =
  | 'order_completed'
  | 'product_view'
  | 'cart_add'
  | 'reward_redeemed'
  | 'checkout_started'
  | 'checkout_completed'
  | 'menu_opened'
  | 'segment_changed'
  | 'signal_detected'
  | 'health_score_changed'

// ── Severidad (igual que TIA para consistencia) ─────────────────────────────
export type CustomerInsightSeverity = 'info' | 'warning' | 'critical'

// ── Acciones (P9 — acciones, no mensajes) ────────────────────────────────────
export type CustomerActionType =
  | 'recognition'
  | 'recovery'
  | 'onboarding'
  | 'loyalty_reinforcement'
  | 'upselling_premium'
  | 'promotion_specific'
  | 'discovery'

// ── Métricas del cliente (CML) ───────────────────────────────────────────────
export interface CustomerMetrics {
  // Acumulativas (ya en Consumer)
  orderCount: number
  totalSpent: number
  firstOrderAt: Date | null
  lastOrderAt: Date | null

  // Derivadas simples
  avgTicket: number
  lifetimeValue: number
  daysSinceLastOrder: number | null
  daysSinceFirstOrder: number | null

  // Temporales
  visitFrequency: number // órdenes por mes
  avgOrderInterval: number // días promedio entre órdenes
  favoriteDays: number[] // [0-6] día de semana más frecuente
  favoriteHours: number[] // [0-23] hora más frecuente

  // Engagement
  favoriteCategories: { category: string; count: number }[]
  favoriteProducts: { product: string; count: number }[]
  uniqueProducts: number // productos distintos comprados

  // Rewards
  rewardUsageCount: number
  rewardUsageRate: number // rewardUsageCount / orderCount

  // Club
  clubJoinDate: Date | null
  clubStatus: string | null // tier de LoyaltyMember
  clubPoints: number

  // Eventos de comportamiento (P7)
  menuViews: number
  productViews: number
  cartAdds: number
  checkoutStarts: number
  completedOrders: number
  conversionRate: number // completedOrders / checkoutStarts
}

// ── Insight individual (P2) ──────────────────────────────────────────────────
export interface CustomerInsight {
  type: string
  severity: CustomerInsightSeverity
  title: string
  description: string
  metric: string
  currentValue: number
  previousValue?: number
  changePercent?: number
}

// ── Health Score (P3 — desde el día 1) ────────────────────────────────────────
export interface CustomerHealthScore {
  total: number
  components: {
    frequency: number
    recency: number
    ltv: number
    engagement: number
    club: number
    rewards: number
    conversion: number
  }
  calculatedAt: Date
}

// ── Entrada de historial (P4 — memoria del perfil) ───────────────────────────
export interface HealthScoreHistoryEntry {
  date: Date
  score: number
  components: Record<string, number>
  segment: CustomerSegment
}

// ── Acción recomendada (P9 — acción, no mensaje) ─────────────────────────────
export interface CustomerAction {
  type: CustomerActionType
  segment: CustomerSegment
  priority: 'high' | 'medium' | 'low'
  description: string
  // NO incluye: mensaje, texto visible, template, canal
  // Eso es responsabilidad de la CEL (capa posterior)
}
