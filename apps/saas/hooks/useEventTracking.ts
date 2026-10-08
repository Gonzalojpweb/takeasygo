'use client'

import { useCallback, useRef } from 'react'
import {
  captureEvent,
  captureDishDetailOpened,
  captureCheckoutFieldInteract,
  capturePaymentMethodSelected,
  captureDeliveryAddressSet,
  captureLoyaltyLookup,
  captureUpsellImpression,
  captureUpsellAdd,
  captureHiddenRewardRedeemed,
  captureTiaInsightShown,
  captureTiaInsightDismissed,
  captureTiaInsightResolved,
  captureRatingSubmitted,
  captureFeedbackSubmitted,
  captureQrPromoApplied,
  captureOrderStatusChanged,
} from '@/lib/events'

// NOTA: los 8 eventos de navegación (menu_opened, product_view, cart_add,
// cart_remove, checkout_started, checkout_submitted, checkout_completed,
// reward_viewed, reward_interaction) NO se re-exportan acá: siempre se usan
// desde lib/track.ts (wrapper único dual-write con dedups y batching).

// ─────────────────────────────────────────────────────────────────────────────
// hooks/useEventTracking.ts — React hook for behavioral event capture
// ─────────────────────────────────────────────────────────────────────────────
// Purpose: Provide a convenient hook that wraps lib/events.ts functions
// with automatic phoneHash resolution from checkout form state.
//
// Usage:
//   const { track } = useEventTracking({ phoneHash, locationId })
//   track('cart_add', { menuItemId, name, price, quantity })
// ─────────────────────────────────────────────────────────────────────────────

interface UseEventTrackingOptions {
  phoneHash?: string
  locationId?: string
}

export function useEventTracking(options: UseEventTrackingOptions = {}) {
  const optionsRef = useRef(options)
  optionsRef.current = options

  const track = useCallback((type: string, data?: Record<string, unknown>) => {
    captureEvent({
      type: type as any,
      phoneHash: optionsRef.current.phoneHash,
      data,
      metadata: {
        locationId: optionsRef.current.locationId,
      },
    })
  }, [])

  return {
    track,
    // Expose individual functions for typed usage
    captureDishDetailOpened,
    captureCheckoutFieldInteract,
    capturePaymentMethodSelected,
    captureDeliveryAddressSet,
    captureLoyaltyLookup,
    captureUpsellImpression,
    captureUpsellAdd,
    captureHiddenRewardRedeemed,
    captureTiaInsightShown,
    captureTiaInsightDismissed,
    captureTiaInsightResolved,
    captureRatingSubmitted,
    captureFeedbackSubmitted,
    captureQrPromoApplied,
    captureOrderStatusChanged,
  }
}
