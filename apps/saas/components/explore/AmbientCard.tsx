'use client'

// ── AmbientCard ──────────────────────────────────────────────────────────────
//
// Card ambiental que flota sobre el mapa, tipo anuncio Waze.
// Aparece 1 a la vez con enter-up, permanece unos segundos, se retira.
// Sin pulse-live (reservado para datos reales en vivo).
//
// Prioridad: promos > nuevos > actividad genérica.
// Paso 3 del spec.

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { RestaurantCardData } from '@/types/restaurant-card'
import { motion, AnimatePresence } from 'framer-motion'
import { useHaptic } from '@/components/tgo/useHaptic'
import { Percent, Sparkles, Users } from 'lucide-react'

interface Props {
  restaurants: RestaurantCardData[]
  onSelect: (r: RestaurantCardData) => void
  intervalMs?: number
}

type AmbientItem = {
  id: string
  type: 'promo' | 'new' | 'activity'
  icon: React.ReactNode
  title: string
  subtitle: string
  restaurant: RestaurantCardData
  color: string
  bg: string
}

function distLabel(m: number | null) {
  if (m === null) return ''
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`
}

export default function AmbientCard({
  restaurants,
  onSelect,
  intervalMs = 6000,
}: Props) {
  const haptic = useHaptic()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isVisible, setIsVisible] = useState(true)

  // Build ambient items from restaurants (priority-ordered)
  const items: AmbientItem[] = useMemo(() => {
    const result: AmbientItem[] = []
    const valid = restaurants.filter(
      r => r.lat !== null && r.lng !== null && r.isOpenNow !== false
    )

    // 1. Priority: promos (highest business value)
    const withPromos = valid.filter(
      r => r.loyaltyInfo?.hasActivePromo && r.loyaltyInfo?.promoTypes?.length
    )
    for (const r of withPromos.slice(0, 3)) {
      result.push({
        id: `promo-${r.id}`,
        type: 'promo',
        icon: <Percent size={14} />,
        title: r.loyaltyInfo?.promoTypes?.[0] || 'Promo activa',
        subtitle: `${r.name} — ${distLabel(r.distanceM)}`,
        restaurant: r,
        color: 'var(--tgo-state-reward)',
        bg: 'var(--tgo-state-reward-soft)',
      })
    }

    // 2. New in network
    const newOnes = valid.filter(r => r.isNew)
    for (const r of newOnes.slice(0, 2)) {
      result.push({
        id: `new-${r.id}`,
        type: 'new',
        icon: <Sparkles size={14} />,
        title: 'Nuevo en la red',
        subtitle: `${r.name} — ${distLabel(r.distanceM)}`,
        restaurant: r,
        color: 'var(--tgo-state-discovery)',
        bg: 'var(--tgo-state-discovery-soft)',
      })
    }

    // 3. Generic activity (restaurants open nearby)
    const openNearby = valid
      .filter(r => !r.isNew && !r.loyaltyInfo?.hasActivePromo)
      .sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity))
    for (const r of openNearby.slice(0, 2)) {
      result.push({
        id: `activity-${r.id}`,
        type: 'activity',
        icon: <Users size={14} />,
        title: 'Cerca tuyo',
        subtitle: `${r.name} — ${r.cuisineTypes[0] || 'Abierto'}`,
        restaurant: r,
        color: 'var(--tgo-state-activity)',
        bg: 'var(--tgo-state-activity-soft)',
      })
    }

    return result
  }, [restaurants])

  // Cycle through items
  useEffect(() => {
    if (items.length === 0) return

    const timer = setInterval(() => {
      // Fade out
      setIsVisible(false)

      // After fade out, change item and fade in
      setTimeout(() => {
        setCurrentIndex(prev => (prev + 1) % items.length)
        setIsVisible(true)
      }, 400) // matches exit animation duration
    }, intervalMs)

    return () => clearInterval(timer)
  }, [items.length, intervalMs])

  // Reset index when items change
  useEffect(() => {
    setCurrentIndex(0)
  }, [items.length])

  if (items.length === 0) return null

  const current = items[currentIndex % items.length]

  return (
    <div
      className="absolute inset-x-0 z-20 pointer-events-none"
      style={{
        top: 100, // below greeting + chips
        paddingInline: 20,
      }}
    >
      <AnimatePresence mode="wait">
        {isVisible && (
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{
              type: 'spring',
              stiffness: 300,
              damping: 25,
              duration: 0.3,
            }}
            className="pointer-events-auto"
          >
            <button
              onClick={() => {
                haptic.impact('light')
                onSelect(current.restaurant)
              }}
              className="w-full flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
              style={{
                backgroundColor: 'rgba(255,255,255,0.95)',
                borderRadius: 'var(--tgo-radius-xl)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                backdropFilter: 'blur(12px)',
                padding: '10px 14px',
                border: `1px solid ${current.color}20`,
              }}
            >
              {/* Icon badge */}
              <div
                className="flex items-center justify-center shrink-0"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 'var(--tgo-radius-md)',
                  backgroundColor: current.bg,
                  color: current.color,
                }}
              >
                {current.icon}
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <p
                  className="text-xs font-bold truncate"
                  style={{ color: 'var(--tgo-text-primary)' }}
                >
                  {current.title}
                </p>
                <p
                  className="text-[11px] truncate"
                  style={{ color: 'var(--tgo-text-muted)' }}
                >
                  {current.subtitle}
                </p>
              </div>

              {/* Type badge */}
              <div
                className="shrink-0 px-2 py-0.5 rounded-full"
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  backgroundColor: current.bg,
                  color: current.color,
                }}
              >
                {current.type === 'promo' ? 'Oferta' : current.type === 'new' ? 'Nuevo' : 'Abierto'}
              </div>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
