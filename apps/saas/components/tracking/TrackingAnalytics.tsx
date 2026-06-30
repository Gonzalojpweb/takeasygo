'use client'

import { useEffect } from 'react'
import { captureOrderCompleted, captureRewardAdvanceConsolidated } from '@/lib/tia/events'

interface Props {
  order: {
    _id: string
    total: number
    orderMode?: string
    itemsCount: number
  }
  rewardAdvanceApplied?: boolean
  rewardAdvanceConsolidated?: boolean
}

export default function TrackingAnalytics({ order, rewardAdvanceApplied, rewardAdvanceConsolidated }: Props) {
  useEffect(() => {
    captureOrderCompleted({
      _id: order._id,
      total: order.total,
      itemsCount: order.itemsCount,
      orderMode: order.orderMode,
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (rewardAdvanceConsolidated) {
      captureRewardAdvanceConsolidated(order._id, 0)
    }
  }, [rewardAdvanceConsolidated]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}
