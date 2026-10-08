import {
  captureMenuOpened,
  captureDishViewed,
  captureDishAdded,
  captureCheckoutStarted,
  captureCheckoutSubmitted,
  captureCheckoutCompleted,
  captureCartRemoved,
  captureRewardViewed,
  captureRewardInteracted,
} from './tia/events'
import { getSessionId, getDevice, getTenantSlug, isDebugMode } from './events'

// ─────────────────────────────────────────────────────────────────────────────
// lib/track.ts — Wrapper único dual-write de eventos de navegación
// ─────────────────────────────────────────────────────────────────────────────
// Todo call site de los 8 eventos de navegación pasa por acá. Nunca se hacen
// imports dobles (PostHog + Mongo) en componentes.
//
// Flujo por evento:
//   1. Dedup client-side (si aplica) → si ya disparó, no va a PostHog NI a Mongo
//   2. PostHog: capture inmediato (lib/tia/events.ts)
//   3. Mongo: encola → batch POST /api/[tenant]/events (≤10 eventos/request)
//
// Dedups:
//   - product_view: 1 por producto cada 30 min por sesión (sessionStorage)
//   - menu_opened / checkout_started: 1 por sesión (valor = sessionId)
//
// Batching: cola con flush a los 1s o a los 10 eventos; flush extra con
// keepalive en pagehide/visibilitychange para no perder eventos al navegar.
// ─────────────────────────────────────────────────────────────────────────────

type RewardAction = 'tap' | 'open_detail' | 'add_to_cart' | 'advance_offered' | 'advance_accepted'

interface QueuedEvent {
  type: string
  phoneHash?: string
  data?: Record<string, unknown>
  metadata?: {
    source: 'client_side'
    sessionId?: string
    device?: string
    locationId?: string
  }
}

// ── Cola batch (Mongo) ───────────────────────────────────────────────────────

const queue: QueuedEvent[] = []
const MAX_BATCH = 10
const FLUSH_DELAY_MS = 1000
let flushTimer: ReturnType<typeof setTimeout> | null = null
let listenersBound = false
let queueTenantSlug: string | null = null

function enqueue(event: QueuedEvent, tenantSlugOverride?: string): void {
  if (typeof window === 'undefined') return
  // En /app (explore) el tenant no está en la URL → el call site lo pasa explícito
  const tenantSlug = tenantSlugOverride || getTenantSlug()
  if (!tenantSlug) return
  queueTenantSlug = tenantSlug

  const sessionId = getSessionId()
  queue.push({
    ...event,
    metadata: {
      source: 'client_side',
      sessionId,
      device: getDevice(),
      ...event.metadata,
    },
  })

  if (isDebugMode()) {
    console.log('[EVENT]', event.type, event.data, queue[queue.length - 1].metadata)
  }

  bindUnloadListeners()

  if (queue.length >= MAX_BATCH) {
    flush()
  } else if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null
      flush()
    }, FLUSH_DELAY_MS)
  }
}

function flush(): void {
  if (queue.length === 0) return
  const tenantSlug = queueTenantSlug || getTenantSlug()
  if (!tenantSlug) {
    queue.length = 0
    return
  }

  const events = queue.splice(0, MAX_BATCH)
  try {
    fetch(`/api/${tenantSlug}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
      keepalive: true,
    }).catch(() => { /* best-effort */ })
  } catch {
    /* best-effort */
  }

  // Quedaron eventos en la cola → reprogramar
  if (queue.length > 0 && !flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null
      flush()
    }, FLUSH_DELAY_MS)
  }
}

function bindUnloadListeners(): void {
  if (listenersBound || typeof document === 'undefined') return
  listenersBound = true
  document.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
}

// ── Dedup helpers (sessionStorage) ───────────────────────────────────────────

const PRODUCT_VIEW_TTL_MS = 30 * 60 * 1000 // 30 min
const PRODUCT_VIEW_CAP = 50

function shouldTrackProductView(productId: string): boolean {
  if (typeof window === 'undefined') return false
  const key = 'tgo_pv'
  const now = Date.now()
  const mapKey = `${getSessionId()}:${productId}`

  try {
    const raw = sessionStorage.getItem(key)
    const map: Record<string, number> = raw ? JSON.parse(raw) : {}

    if (map[mapKey] && now - map[mapKey] < PRODUCT_VIEW_TTL_MS) return false

    // Podar entradas viejas (cap)
    const entries = Object.entries(map)
    if (entries.length >= PRODUCT_VIEW_CAP) {
      entries
        .sort((a, b) => a[1] - b[1])
        .slice(0, entries.length - PRODUCT_VIEW_CAP + 1)
        .forEach(([k]) => delete map[k])
    }

    map[mapKey] = now
    sessionStorage.setItem(key, JSON.stringify(map))
    return true
  } catch {
    return true // sin storage → mejor duplicar que perder
  }
}

/** 1 por valor/por sesión: devuelve true solo la primera vez para esta sesión. */
function shouldTrackOncePerSession(key: string): boolean {
  if (typeof window === 'undefined') return false
  const sessionId = getSessionId()
  try {
    const seen = sessionStorage.getItem(key)
    if (seen === sessionId) return false
    sessionStorage.setItem(key, sessionId)
    return true
  } catch {
    return true
  }
}

// ── Tipos de params ──────────────────────────────────────────────────────────

interface DishLike {
  _id: string
  name: string
  categoryName?: string
  price: number
}

interface CartAddParams {
  /** Opcional: promociones/slots pueden no tener menuItemId */
  menuItemId?: string
  promotionId?: string
  name: string
  category?: string
  price: number
  quantity: number
  hasCustomizations: boolean
  source?: string
  locationId?: string
}

interface CartRemoveParams {
  /** Opcional: promociones pueden no tener menuItemId */
  menuItemId?: string
  name: string
  quantity?: number
  locationId?: string
}

interface CheckoutParams {
  total: number
  itemsCount: number
  orderMode?: string
  locationId?: string
}

interface RewardViewedParams {
  rewardId?: string
  type?: string
  currentPoints?: number
  pointsRequired?: number
  locationId?: string
  /** Obligatorio en rutas /app (explore) donde el tenant no está en la URL */
  tenantSlug?: string
}

interface RewardInteractionParams {
  rewardId?: string
  type?: string
  value?: number
  action: RewardAction
  locationId?: string
  /** Obligatorio en rutas /app (explore) donde el tenant no está en la URL */
  tenantSlug?: string
}

// ── Eventos (los 8 de navegación) ────────────────────────────────────────────

export function trackMenuOpened(locationId: string): void {
  if (!shouldTrackOncePerSession(`tgo_menu_opened_${locationId}`)) return
  captureMenuOpened(locationId)
  enqueue({
    type: 'menu_opened',
    data: { source: 'menu' },
    metadata: { source: 'client_side', locationId },
  })
}

export function trackDishViewed(dish: DishLike): void {
  if (!shouldTrackProductView(dish._id)) return
  captureDishViewed(dish)
  enqueue({
    type: 'product_view',
    data: {
      menuItemId: dish._id,
      itemName: dish.name,
      itemCategory: dish.categoryName || '',
      amount: dish.price,
    },
  })
}

export function trackCartAdd(params: CartAddParams): void {
  if (params.menuItemId) {
    captureDishAdded(
      { _id: params.menuItemId, name: params.name, categoryName: params.category, price: params.price },
      params.quantity,
      params.hasCustomizations
    )
  }
  enqueue({
    type: 'cart_add',
    data: {
      ...(params.menuItemId ? { menuItemId: params.menuItemId } : {}),
      ...(params.promotionId ? { promotionId: params.promotionId } : {}),
      itemName: params.name,
      itemCategory: params.category || '',
      amount: params.price,
      quantity: params.quantity,
      hasCustomizations: params.hasCustomizations,
      source: params.source || 'menu',
    },
    metadata: { source: 'client_side', locationId: params.locationId },
  })
}

export function trackCartRemove(params: CartRemoveParams): void {
  captureCartRemoved({
    menuItemId: params.menuItemId || '',
    name: params.name,
    quantity: params.quantity,
  })
  enqueue({
    type: 'cart_remove',
    data: {
      ...(params.menuItemId ? { menuItemId: params.menuItemId } : {}),
      itemName: params.name,
      quantity: params.quantity ?? 1,
    },
    metadata: { source: 'client_side', locationId: params.locationId },
  })
}

export function trackCheckoutStarted(params: CheckoutParams): void {
  const tenantSlug = getTenantSlug()
  if (!shouldTrackOncePerSession(`tgo_checkout_started_${tenantSlug}`)) return
  captureCheckoutStarted({ total: params.total, itemsCount: params.itemsCount, orderMode: params.orderMode })
  enqueue({
    type: 'checkout_started',
    data: {
      amount: params.total,
      quantity: params.itemsCount,
      orderMode: params.orderMode,
    },
    metadata: { source: 'client_side', locationId: params.locationId },
  })
}

export function trackCheckoutSubmitted(params: CheckoutParams): void {
  captureCheckoutSubmitted({ total: params.total, itemsCount: params.itemsCount, orderMode: params.orderMode })
  enqueue({
    type: 'checkout_submitted',
    data: {
      amount: params.total,
      quantity: params.itemsCount,
      orderMode: params.orderMode,
    },
    metadata: { source: 'client_side', locationId: params.locationId },
  })
}

/**
 * Fallback client de checkout completado. El dedup real es atómico
 * server-side (upsert sobre {tenantId, type, data.orderId}), así que
 * en Mongo puede llegar las veces que sea sin duplicar docs.
 * En PostHog sí dedupemos acá: 1 por orden por sesión (sessionStorage),
 * para no inflar el funnel. Requiere orderId (ObjectId) — sin él no se emite.
 */
export function trackCheckoutCompleted(params: {
  orderId: string
  total: number
  itemsCount: number
  orderMode?: string
  paymentMethod?: string
}): void {
  if (!params.orderId) return
  if (!shouldTrackOncePerSession(`tgo_checkout_completed_${params.orderId}`)) return
  captureCheckoutCompleted({
    _id: params.orderId,
    total: params.total,
    itemsCount: params.itemsCount,
    orderMode: params.orderMode,
    paymentMethod: params.paymentMethod,
  })
  enqueue({
    type: 'checkout_completed',
    data: {
      orderId: params.orderId,
      amount: params.total,
      quantity: params.itemsCount,
      orderMode: params.orderMode,
      paymentMethod: params.paymentMethod,
    },
  })
}

export function trackRewardViewed(params: RewardViewedParams): void {
  captureRewardViewed({
    _id: params.rewardId,
    type: params.type,
    currentPoints: params.currentPoints,
    pointsRequired: params.pointsRequired,
  })
  enqueue({
    type: 'reward_viewed',
    data: {
      ...(params.rewardId ? { rewardId: params.rewardId } : {}),
      ...(params.type ? { redeemType: params.type } : {}),
      ...(params.pointsRequired !== undefined ? { points: params.pointsRequired } : {}),
    },
    metadata: { source: 'client_side', locationId: params.locationId },
  }, params.tenantSlug)
}

/**
 * Intención de interacción con un reward (tap, abrir detalle, agregar al
 * carrito, advance ofrecido/aceptado). NUNCA es el canje: reward_redeemed
 * solo lo emite server-side al confirmarse el canje real.
 */
export function trackRewardInteraction(params: RewardInteractionParams): void {
  captureRewardInteracted(
    { _id: params.rewardId, type: params.type, value: params.value },
    params.action
  )
  enqueue({
    type: 'reward_interaction',
    data: {
      ...(params.rewardId ? { rewardId: params.rewardId } : {}),
      ...(params.type ? { redeemType: params.type } : {}),
      ...(params.value !== undefined ? { amount: params.value } : {}),
      action: params.action,
    },
    metadata: { source: 'client_side', locationId: params.locationId },
  }, params.tenantSlug)
}
