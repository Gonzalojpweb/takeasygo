'use client'

import { useCallback, useRef } from 'react'
import {
  captureEvent,
  captureMenuOpened,
  captureDishViewed,
  captureDishDetailOpened,
  captureCartAdd,
  captureCheckoutStarted,
  captureCheckoutFieldInteract,
  capturePaymentMethodSelected,
  captureDeliveryAddressSet,
  captureLoyaltyLookup,
  captureUpsellImpression,
  captureUpsellAdd,
  captureRewardRedeemed,
  captureHiddenRewardRedeemed,
  captureTiaInsightShown,
  captureTiaInsightDismissed,
  captureTiaInsightResolved,
  captureRatingSubmitted,
  captureFeedbackSubmitted,
  captureQrPromoApplied,
  captureOrderStatusChanged,
} from '@/lib/events'

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
    captureMenuOpened,
    captureDishViewed,
    captureDishDetailOpened,
    captureCartAdd,
    captureCheckoutStarted,
    captureCheckoutFieldInteract,
    capturePaymentMethodSelected,
    captureDeliveryAddressSet,
    captureLoyaltyLookup,
    captureUpsellImpression,
    captureUpsellAdd,
    captureRewardRedeemed,
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
