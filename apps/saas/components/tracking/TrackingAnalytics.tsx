'use client'

import { useEffect } from 'react'
import { captureOrderCompleted, captureRewardAdvanceConsolidated } from '@/lib/tia/events'
import { trackCheckoutCompleted } from '@/lib/track'

// Estados post-compra (espejo server de POST_COMPLETION_STATUSES en
// lib/events-server.ts): solo ahí corresponde checkout_completed.
const POST_COMPLETION_STATUSES = ['confirmed', 'preparing', 'ready', 'delivered']

interface Props {
  order: {
    _id: string
    total: number
    orderMode?: string
    itemsCount: number
  }
  orderStatus?: string
  paymentMethod?: string
  rewardAdvanceApplied?: boolean
  rewardAdvanceConsolidated?: boolean
}

export default function TrackingAnalytics({ order, orderStatus, paymentMethod, rewardAdvanceConsolidated }: Props) {
  useEffect(() => {
    captureOrderCompleted({
      _id: order._id,
      total: order.total,
      itemsCount: order.itemsCount,
      orderMode: order.orderMode,
    })
    // Fallback client de checkout_completed para flujos que desembarcan acá
    // (cash nace confirmed/preparing). En Mongo dedupea el upsert único del
    // server; en PostHog dedupea el guard por orden+sesión de track.ts.
    if (orderStatus && POST_COMPLETION_STATUSES.includes(orderStatus)) {
      trackCheckoutCompleted({
        orderId: order._id,
        total: order.total,
        itemsCount: order.itemsCount,
        orderMode: order.orderMode,
        paymentMethod,
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (rewardAdvanceConsolidated) {
      captureRewardAdvanceConsolidated(order._id, 0)
    }
  }, [rewardAdvanceConsolidated]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}
