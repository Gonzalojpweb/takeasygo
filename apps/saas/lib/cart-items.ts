import type { CartItem, CartItemType } from '@/types/cart'

/** Tope técnico de premios por pedido (misma frontera que el schema Zod de rewardItems). */
export const TECHNICAL_MAX_REWARDS_PER_ORDER = 5
export const DEFAULT_MAX_REWARDS_PER_ORDER = 1

/**
 * Cuántos premios puede llevar un pedido según la config del tenant.
 * Default 1, tope técnico 5; cualquier valor inválido cae al default.
 */
export function resolveMaxRewardsPerOrder(
  storeConfig?: { maxRewardsPerOrder?: number | null } | null
): number {
  const raw = Number(storeConfig?.maxRewardsPerOrder)
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_MAX_REWARDS_PER_ORDER
  return Math.min(Math.floor(raw), TECHNICAL_MAX_REWARDS_PER_ORDER)
}

const VALID_TYPES: CartItemType[] = ['menuItem', 'promotion', 'reward']

/**
 * Normaliza un carrito leído de storage (sessionStorage / un formato viejo).
 * - Formato viejo (sin `type`): se infiere `promotion` si trae promotionId.
 * - Líneas de premio (`reward`): siempre $0 y cantidad 1; se descartan si no
 *   traen storeItemId o pointsCost (no se puede saber qué canje representan).
 */
export function normalizeStoredCart(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return []

  const items: CartItem[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const item = entry as Record<string, unknown>

    const type: CartItemType = VALID_TYPES.includes(item.type as CartItemType)
      ? (item.type as CartItemType)
      : item.promotionId
        ? 'promotion'
        : 'menuItem'

    if (type === 'reward') {
      const storeItemId = typeof item.storeItemId === 'string' ? item.storeItemId : ''
      const pointsCost = Number(item.pointsCost)
      if (!storeItemId || !Number.isFinite(pointsCost) || pointsCost <= 0) continue
      items.push({
        ...(item as unknown as CartItem),
        type,
        storeItemId,
        pointsCost,
        addedFrom: item.addedFrom === 'promotion' ? 'promotion' : 'store',
        basePrice: 0,
        extraPrice: 0,
        price: 0,
        quantity: 1,
        customizations: [],
        customizationSummary: '',
      })
      continue
    }

    items.push({ ...(item as unknown as CartItem), type })
  }
  return items
}

/** Líneas de premio del carrito (type === 'reward'). */
export function getRewardLines(cart: CartItem[]): CartItem[] {
  return cart.filter(item => item.type === 'reward')
}

/** Suma de puntos que costarían los premios del carrito. */
export function sumRewardPoints(cart: CartItem[]): number {
  return getRewardLines(cart).reduce(
    (sum, item) => sum + (Number.isFinite(Number(item.pointsCost)) ? Number(item.pointsCost) : 0),
    0
  )
}

/**
 * Payload de premios a enviar junto con el pedido, derivado del carrito
 * (el carrito es la única fuente de verdad de qué se canjea).
 * null = no hay premios en el carrito.
 */
export function buildRewardPayloadFromCart(cart: CartItem[]): {
  rewardItems: Array<{ storeItemId: string }>
  loyaltyPointsRequired: number
} | null {
  const lines = getRewardLines(cart)
  if (lines.length === 0) return null
  return {
    rewardItems: lines.map(item => ({ storeItemId: item.storeItemId as string })),
    loyaltyPointsRequired: sumRewardPoints(cart),
  }
}

/** cartItemId estable de una línea de premio (permite quitar sin duplicar). */
export function rewardCartItemId(storeItemId: string): string {
  return `reward:${storeItemId}`
}

export interface RewardCartItemInput {
  _id: string
  name: string
  imageUrl?: string
  pointsCost: number
}

export function isRewardInCart(cart: CartItem[], storeItemId: string): boolean {
  return cart.some(item => item.type === 'reward' && item.storeItemId === storeItemId)
}

export function canAddRewardLine(cart: CartItem[], maxRewardsPerOrder: number): boolean {
  return getRewardLines(cart).length < maxRewardsPerOrder
}

export function addRewardLine(cart: CartItem[], item: RewardCartItemInput): CartItem[] {
  if (isRewardInCart(cart, item._id)) return cart
  return [
    ...cart,
    {
      cartItemId: rewardCartItemId(item._id),
      type: 'reward',
      storeItemId: item._id,
      pointsCost: item.pointsCost,
      name: item.name,
      imageUrl: item.imageUrl || undefined,
      basePrice: 0,
      extraPrice: 0,
      price: 0,
      quantity: 1,
      customizations: [],
      customizationSummary: '',
      addedFrom: 'store',
    },
  ]
}

export function removeRewardLine(cart: CartItem[], storeItemId: string): CartItem[] {
  const cartItemId = rewardCartItemId(storeItemId)
  return cart.filter(
    item => !(item.type === 'reward' && (item.storeItemId === storeItemId || item.cartItemId === cartItemId))
  )
}

/** Resultado de alternar un premio en el carrito (para UI: qué aviso mostrar). */
export type ToggleRewardStatus = 'added' | 'removed' | 'limit_reached' | 'not_enough_points'

export type ToggleRewardResult =
  | { status: 'added'; cart: CartItem[] }
  | { status: 'removed'; cart: CartItem[] }
  | { status: 'limit_reached'; cart: CartItem[] }

/**
 * Agrega o quita un premio del carrito respetando el máximo de premios por pedido.
 * Ya agregado → lo quita; sin cupo → `limit_reached` (el llamador avisa al cliente).
 */
export function toggleRewardInCart(
  cart: CartItem[],
  item: RewardCartItemInput,
  maxRewardsPerOrder: number
): ToggleRewardResult {
  if (isRewardInCart(cart, item._id)) {
    return { status: 'removed', cart: removeRewardLine(cart, item._id) }
  }
  if (!canAddRewardLine(cart, maxRewardsPerOrder)) {
    return { status: 'limit_reached', cart }
  }
  return { status: 'added', cart: addRewardLine(cart, item) }
}
