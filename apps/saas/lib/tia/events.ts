import posthog from 'posthog-js'

// ── Types ────────────────────────────────────────────────────────────────────

interface DishInfo {
  _id: string
  name: string
  categoryName?: string
  price: number
}

interface PromotionInfo {
  _id: string
  type?: string
  title?: string
}

interface RewardInfo {
  _id?: string
  type?: string
  currentPoints?: number
  pointsRequired?: number
  value?: number
}

interface CartInfo {
  total: number
  itemsCount: number
  orderMode?: string
  phoneHash?: string  // CIS: vincula eventos a customer específico
}

interface OrderInfo {
  _id: string
  total: number
  paymentMethod?: string
  itemsCount: number
  orderMode?: string
  phoneHash?: string  // CIS: vincula eventos a customer específico
}

// ── Conversion Funnel ─────────────────────────────────────────────────────────

export function captureMenuOpened(locationId: string) {
  posthog.capture('menu.opened', { location_id: locationId })
}

export function captureDishViewed(dish: DishInfo) {
  posthog.capture('dish.viewed', {
    dish_id: dish._id,
    dish_name: dish.name,
    dish_category: dish.categoryName || '',
    dish_price: dish.price,
  })
}

export function captureDishAdded(dish: DishInfo, quantity: number, hasCustomizations: boolean) {
  posthog.capture('dish.added', {
    dish_id: dish._id,
    dish_name: dish.name,
    dish_price: dish.price,
    quantity,
    has_customizations: hasCustomizations,
  })
}

export function captureCheckoutStarted(cart: CartInfo) {
  posthog.capture('checkout.started', {
    cart_total: cart.total,
    cart_items_count: cart.itemsCount,
    order_mode: cart.orderMode || '',
    phoneHash: cart.phoneHash || '',
  })
}

export function captureOrderCompleted(order: OrderInfo) {
  posthog.capture('order.completed', {
    order_id: order._id,
    order_total: order.total,
    payment_method: order.paymentMethod || '',
    items_count: order.itemsCount,
    order_mode: order.orderMode || '',
    phoneHash: order.phoneHash || '',
  })
}

// ── Promotions ────────────────────────────────────────────────────────────────

export function capturePromotionViewed(promo: PromotionInfo) {
  posthog.capture('promotion.viewed', {
    promotion_id: promo._id,
    promotion_type: promo.type || '',
    promotion_title: promo.title || '',
  })
}

export function capturePromotionClicked(promo: PromotionInfo) {
  posthog.capture('promotion.clicked', {
    promotion_id: promo._id,
    promotion_type: promo.type || '',
  })
}

export function capturePromotionApplied(promo: PromotionInfo, discountAmount: number) {
  posthog.capture('promotion.applied', {
    promotion_id: promo._id,
    promotion_type: promo.type || '',
    discount_amount: discountAmount,
  })
}

// ── Rewards / Fidelización ────────────────────────────────────────────────────

export function captureRewardViewed(reward: RewardInfo) {
  posthog.capture('reward.viewed', {
    reward_type: reward.type || '',
    current_points: reward.currentPoints || 0,
    points_required: reward.pointsRequired || 0,
  })
}

export function captureRewardEligible(reward: RewardInfo) {
  posthog.capture('reward.eligible', {
    reward_type: reward.type || '',
    total_points: reward.currentPoints || 0,
  })
}

export function captureRewardRedeemed(reward: RewardInfo) {
  posthog.capture('reward.redeemed', {
    reward_id: reward._id || '',
    reward_type: reward.type || '',
    reward_value: reward.value || 0,
  })
}

export function captureRewardAdvanceOffered(advanceAmount: number, currentPoints: number) {
  posthog.capture('reward.advance_offered', {
    advance_amount: advanceAmount,
    current_points: currentPoints,
  })
}

export function captureRewardAdvanceAccepted(advanceAmount: number) {
  posthog.capture('reward.advance_accepted', {
    advance_amount: advanceAmount,
  })
}

export function captureRewardAdvanceConsolidated(advanceId: string, consolidatedAmount: number) {
  posthog.capture('reward.advance_consolidated', {
    advance_id: advanceId,
    consolidated_amount: consolidatedAmount,
  })
}

// ── Home / Social ─────────────────────────────────────────────────────────────

export function captureHomeShared(method: 'native' | 'clipboard') {
  posthog.capture('home.shared', {
    share_method: method,
  })
}

// ── Hidden Rewards ────────────────────────────────────────────────────────────

export function captureHiddenRewardDiscovered(menuItemId: string) {
  posthog.capture('hidden_reward.discovered', {
    menu_item_id: menuItemId,
  })
}

export function captureHiddenRewardRevealed(menuItemId: string, rewardTitle: string, discountPercentage: number) {
  posthog.capture('hidden_reward.revealed', {
    menu_item_id: menuItemId,
    reward_title: rewardTitle,
    discount_percentage: discountPercentage,
  })
}

export function captureHiddenRewardRedeemed(menuItemId: string, discountPercentage: number, tenantId: string) {
  posthog.capture('hidden_reward.redeemed', {
    menu_item_id: menuItemId,
    discount_percentage: discountPercentage,
    tenant_id: tenantId,
  })
}
