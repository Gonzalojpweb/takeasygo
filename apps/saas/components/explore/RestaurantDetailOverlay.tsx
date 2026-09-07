'use client'

// ── RestaurantDetailOverlay ───────────────────────────────────────────────────
//
// Full-screen overlay that renders RestaurantDetail without navigating away.
// Fetches restaurant data (reviews, ICO, gallery) client-side.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { RestaurantCardData } from '@/types/restaurant-card'
import RestaurantDetail from './RestaurantDetail'
import { motion } from 'framer-motion'

interface Props {
  restaurant: RestaurantCardData
  onBack: () => void
}

export default function RestaurantDetailOverlay({ restaurant: r, onBack }: Props) {
  const router = useRouter()
  const [data, setData] = useState<{
    reviews: any[]
    icoScore: number | null
    icoRing: 'none' | 'thin' | 'marked' | 'gold'
    hasCrown: boolean
    gallery: string[]
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/explore/gallery/${r.id}`)
      .then(res => res.json())
      .then(d => {
        if (cancelled) return
        setData({
          reviews: [],
          icoScore: null,
          icoRing: 'none',
          hasCrown: false,
          gallery: d.images ?? [],
        })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [r.id])

  const handleBack = () => {
    onBack()
  }

  const handleNavigateToMenu = () => {
    // Navigate to the actual restaurant page for menu/checkout
    router.push(`/app/${r.id}?type=${r.type}`)
  }

  return (
    <motion.div
      className="fixed inset-0 z-[2000]"
      style={{ backgroundColor: 'var(--tgo-surface-0)' }}
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
    >
      <RestaurantDetail
        restaurant={r}
        reviews={data?.reviews ?? []}
        icoScore={data?.icoScore ?? null}
        icoRing={data?.icoRing ?? 'none'}
        hasCrown={data?.hasCrown ?? false}
        gallery={data?.gallery ?? []}
      />
    </motion.div>
  )
}
