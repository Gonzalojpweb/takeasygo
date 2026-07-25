'use client'

import { useState, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { RefreshCw } from 'lucide-react'
import { useHaptic } from './useHaptic'

/**
 * PullToRefresh — Pull-to-refresh nativo para mobile.
 *
 * Envuelve cualquier scrollable container. Al hacer pull-down,
 * muestra un spinner que dispara onRefresh cuando se suelta.
 *
 * @example
 * <PullToRefresh onRefresh={refreshData}>
 *   <DiscoveryFeed />
 * </PullToRefresh>
 */

interface PullToRefreshProps {
  onRefresh: () => Promise<void>
  children: React.ReactNode
  threshold?: number
  disabled?: boolean
}

export default function PullToRefresh({
  onRefresh,
  children,
  threshold = 80,
  disabled = false,
}: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const startY = useRef(0)
  const isPulling = useRef(false)
  const haptic = useHaptic()

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || isRefreshing) return
      const scrollTop = containerRef.current?.scrollTop ?? 0
      if (scrollTop > 5) return

      startY.current = e.touches[0].clientY
      isPulling.current = true
    },
    [disabled, isRefreshing]
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isPulling.current || disabled || isRefreshing) return

      const currentY = e.touches[0].clientY
      const diff = currentY - startY.current

      if (diff > 0) {
        // Rubber-band effect: diminishing returns past threshold
        const dampened = Math.min(diff * 0.5, threshold * 1.5)
        setPullDistance(dampened)
      }
    },
    [disabled, isRefreshing, threshold]
  )

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current || disabled || isRefreshing) return
    isPulling.current = false

    if (pullDistance >= threshold) {
      setIsRefreshing(true)
      haptic.impact('light')

      try {
        await onRefresh()
      } finally {
        setIsRefreshing(false)
        setPullDistance(0)
      }
    } else {
      setPullDistance(0)
    }
  }, [pullDistance, threshold, onRefresh, disabled, isRefreshing])

  const progress = Math.min(pullDistance / threshold, 1)
  const rotation = pullDistance * 3

  return (
    <div
      ref={containerRef}
      className="relative h-full overflow-y-auto"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator */}
      {(pullDistance > 0 || isRefreshing) && (
        <motion.div
          className="flex items-center justify-center overflow-hidden"
          animate={{ height: isRefreshing ? 48 : pullDistance }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        >
          <motion.div
            animate={{
              rotate: isRefreshing ? 360 : rotation,
              scale: progress,
            }}
            transition={
              isRefreshing
                ? { repeat: Infinity, duration: 0.8, ease: 'linear' }
                : { type: 'spring', stiffness: 200, damping: 20 }
            }
            style={{ opacity: progress }}
          >
            <RefreshCw
              size={20}
              style={{ color: 'var(--tgo-brand-primary)' }}
              strokeWidth={2.5}
            />
          </motion.div>
        </motion.div>
      )}

      {/* Content */}
      <div style={{ transform: `translateY(${isRefreshing ? 0 : 0}px)` }}>
        {children}
      </div>
    </div>
  )
}
