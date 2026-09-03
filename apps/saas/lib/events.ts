// ─────────────────────────────────────────────────────────────────────────────
// lib/events.ts — Client-side behavioral event capture (dual-write)
// ─────────────────────────────────────────────────────────────────────────────
// Purpose: Capture events to both PostHog (analytics) and MongoDB (intelligence).
//
// Architecture:
// - PostHog events: via lib/tia/events.ts (existing, unchanged)
// - MongoDB events: via /api/[tenant]/events (new, fire-and-forget)
// - This module orchestrates both writes for events that need dual coverage
//
// Design:
// - All functions are fire-and-forget (never throw, never block)
// - Identity model: anonymousId → sessionId → phoneHash
// - Debug mode: ?debug=events in URL logs all events to console
// ─────────────────────────────────────────────────────────────────────────────

import type { CustomerEventType } from '@/types/cis'

// ── Identity helpers ─────────────────────────────────────────────────────────

function getAnonymousId(): string {
  if (typeof window === 'undefined') return ''
  const key = 'tgo-anonymous-id'
  let id = localStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(key, id)
  }
  return id
}

function getSessionId(): string {
  if (typeof window === 'undefined') return ''
  const key = 'tgo-session'
  const now = Date.now()
  const SESSION_TTL = 30 * 60 * 1000 // 30 minutes

  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const session = JSON.parse(raw)
      if (now - session.lastActivityAt < SESSION_TTL) {
        session.lastActivityAt = now
        localStorage.setItem(key, JSON.stringify(session))
        return session.sessionId
      }
    }
  } catch { /* ignore */ }

  // New session
  const sessionId = crypto.randomUUID()
  localStorage.setItem(key, JSON.stringify({
    sessionId,
    createdAt: now,
    lastActivityAt: now,
  }))
  return sessionId
}

function getDevice(): string {
  if (typeof window === 'undefined') return 'unknown'
  const ua = navigator.userAgent
  if (/Mobi|Android/i.test(ua)) return 'mobile'
  if (/Tablet|iPad/i.test(ua)) return 'tablet'
  return 'desktop'
}

function isDebugMode(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.search.includes('debug=events')
}

// ── Core capture function ────────────────────────────────────────────────────

interface EventPayload {
  type: CustomerEventType
  phoneHash?: string
  data?: Record<string, unknown>
  metadata?: {
    source?: string
    sessionId?: string
    device?: string
    locationId?: string
    abTest?: string
    latencyMs?: number
  }
}

let tenantSlugCache: string | null = null

function getTenantSlug(): string {
  if (tenantSlugCache) return tenantSlugCache
  if (typeof window === 'undefined') return ''
  // Extract from URL: /<tenant>/... or from next.config
  const match = window.location.pathname.match(/^\/([^/]+)/)
  if (match) {
    tenantSlugCache = match[1]
    return tenantSlugCache
  }
  return ''
}

export function captureEvent(payload: EventPayload): void {
  if (typeof window === 'undefined') return

  const tenantSlug = getTenantSlug()
  if (!tenantSlug) return

  const body = {
    type: payload.type,
    phoneHash: payload.phoneHash || '',
    data: payload.data || {},
    metadata: {
      source: payload.metadata?.source || 'client_side',
      sessionId: payload.metadata?.sessionId || getSessionId(),
      device: payload.metadata?.device || getDevice(),
      locationId: payload.metadata?.locationId || undefined,
      abTest: payload.metadata?.abTest || undefined,
      latencyMs: payload.metadata?.latencyMs || undefined,
    },
  }

  if (isDebugMode()) {
    console.log('[EVENT]', payload.type, body.data, body.metadata)
  }

  // Fire-and-forget POST to MongoDB
  fetch(`/api/${tenantSlug}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {
    // Silently swallow — events are best-effort
  })
}

// ── Typed capture functions ──────────────────────────────────────────────────

export function captureMenuOpened(locationId: string): void {
  captureEvent({
    type: 'menu_opened',
    data: { source: 'menu' },
    metadata: { locationId },
  })
}

export function captureDishViewed(menuItemId: string, name: string, category: string, price: number): void {
  captureEvent({
    type: 'product_view',
    data: { menuItemId, itemName: name, itemCategory: category, amount: price },
  })
}

export function captureDishDetailOpened(menuItemId: string, name: string, category: string): void {
  captureEvent({
    type: 'dish_detail_opened',
    data: { menuItemId, itemName: name, itemCategory: category },
  })
}

export function captureCartAdd(params: {
  menuItemId: string
  name: string
  category?: string
  price: number
  quantity: number
  hasCustomizations: boolean
  source?: string
}): void {
  captureEvent({
    type: 'cart_add',
    data: {
      menuItemId: params.menuItemId,
      itemName: params.name,
      itemCategory: params.category,
      amount: params.price,
      quantity: params.quantity,
      hasCustomizations: params.hasCustomizations,
      source: params.source || 'menu',
    },
  })
}

export function captureCheckoutStarted(params: {
  total: number
  itemsCount: number
  orderMode?: string
  phoneHash?: string
}): void {
  captureEvent({
    type: 'checkout_started',
    phoneHash: params.phoneHash,
    data: {
      amount: params.total,
      quantity: params.itemsCount,
      orderMode: params.orderMode,
    },
  })
}

export function captureCheckoutFieldInteract(field: string): void {
  captureEvent({
    type: 'checkout_field_interact',
    data: { field },
  })
}

export function capturePaymentMethodSelected(method: string): void {
  captureEvent({
    type: 'payment_method_selected',
    data: { paymentMethod: method },
  })
}

export function captureDeliveryAddressSet(): void {
  captureEvent({
    type: 'delivery_address_set',
  })
}

export function captureLoyaltyLookup(params: {
  phoneHash: string
  found: boolean
  segment?: string
  points?: number
}): void {
  captureEvent({
    type: 'loyalty_lookup',
    phoneHash: params.phoneHash,
    data: {
      found: params.found,
      segment: params.segment,
      points: params.points,
    },
  })
}

export function captureUpsellImpression(params: {
  suggestions: string[]
  source: string
}): void {
  captureEvent({
    type: 'upsell_impression',
    data: {
      source: params.source,
      // Store suggestion names as a comma-separated string (data field is flexible)
      itemName: params.suggestions.join(','),
    },
  })
}

export function captureUpsellAdd(params: {
  menuItemId: string
  name: string
  price: number
  source: string
}): void {
  captureEvent({
    type: 'upsell_add',
    data: {
      menuItemId: params.menuItemId,
      itemName: params.name,
      amount: params.price,
      source: params.source,
      quantity: 1,
    },
  })
}

export function captureRewardRedeemed(params: {
  rewardId: string
  type: string
  value: number
  points?: number
}): void {
  captureEvent({
    type: 'reward_redeemed',
    data: {
      rewardId: params.rewardId,
      redeemType: params.type,
      amount: params.value,
      points: params.points,
    },
  })
}

export function captureHiddenRewardRedeemed(params: {
  menuItemId: string
  discountPercentage: number
}): void {
  captureEvent({
    type: 'reward_redeemed',
    data: {
      menuItemId: params.menuItemId,
      discountAmount: params.discountPercentage,
      source: 'hidden_reward',
      redeemType: 'hidden_reward',
    },
  })
}

export function captureTiaInsightShown(params: {
  insightId: string
  insightType: string
  severity: string
}): void {
  captureEvent({
    type: 'tia_insight_shown',
    data: {
      insightType: params.insightType,
      insightSeverity: params.severity,
    },
  })
}

export function captureTiaInsightDismissed(insightId: string, insightType: string): void {
  captureEvent({
    type: 'tia_insight_dismissed',
    data: { insightType },
  })
}

export function captureTiaInsightResolved(insightId: string, insightType: string): void {
  captureEvent({
    type: 'tia_insight_resolved',
    data: { insightType },
  })
}

export function captureRatingSubmitted(params: {
  orderId: string
  stars: number
  phoneHash?: string
}): void {
  captureEvent({
    type: 'rating_submitted',
    phoneHash: params.phoneHash,
    data: {
      orderId: params.orderId,
      stars: params.stars,
    },
  })
}

export function captureFeedbackSubmitted(params: {
  phoneHash?: string
  event?: string
}): void {
  captureEvent({
    type: 'feedback_submitted',
    phoneHash: params.phoneHash,
    data: {
      event: params.event,
    },
  })
}

export function captureQrPromoApplied(params: {
  promoSlug?: string
  discountAmount: number
  phoneHash?: string
}): void {
  captureEvent({
    type: 'qr_promo_applied',
    phoneHash: params.phoneHash,
    data: {
      source: params.promoSlug,
      discountAmount: params.discountAmount,
    },
  })
}

export function captureOrderStatusChanged(params: {
  orderId: string
  previousStatus: string
  newStatus: string
  phoneHash?: string
}): void {
  captureEvent({
    type: 'order_status_changed',
    phoneHash: params.phoneHash,
    data: {
      orderId: params.orderId,
      previousStatus: params.previousStatus,
      newStatus: params.newStatus,
    },
  })
}
