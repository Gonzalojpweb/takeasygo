'use client'

import { useState, useEffect, useRef } from 'react'
import { Star, TrendingUp, Lock, Package } from 'lucide-react'
import { toast } from 'sonner'
import confetti from 'canvas-confetti'
import { useNotificationSound } from '@/hooks/useNotificationSound'
import { useHaptic } from '@/components/tgo/useHaptic'

interface StoreItem {
  _id: string
  name: string
  description: string
  imageUrl: string
  pointsCost: number
  cashValue?: number
  stock?: number | null
  tierRequirement: string
  linkedMenuItemIds: string[]
  minItemPurchases: number
  category: string
}

interface Props {
  item: StoreItem
  memberPoints: number
  memberTier: string
  onRedeem: (itemId: string) => void
}

const TIER_ORDER: Record<string, number> = {
  none: 0,
  bronze: 1,
  silver: 2,
  gold: 3,
}

export default function StoreItemCard({ item, memberPoints, memberTier, onRedeem }: Props) {
  const haptic = useHaptic()
  const [loading, setLoading] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const prevCanAfford = useRef(false)
  const { play: playPop } = useNotificationSound('/pop.mp3')

  const canAfford = memberPoints >= item.pointsCost
  const meetsTier = TIER_ORDER[memberTier] >= TIER_ORDER[item.tierRequirement]
  const inStock = item.stock === null || item.stock === undefined || item.stock > 0
  const hasRecurrenceRequirement = item.minItemPurchases > 0 && item.linkedMenuItemIds?.length > 0
  const canRedeem = canAfford && meetsTier && inStock && !hasRecurrenceRequirement

  const pointsNeeded = item.pointsCost - memberPoints
  const progress = Math.min((memberPoints / item.pointsCost) * 100, 100)

  useEffect(() => {
    if (canAfford && !prevCanAfford.current) {
      setUnlocked(true)
      playPop()
      confetti({
        particleCount: 30,
        spread: 60,
        origin: { y: 0.5 },
        colors: ['#22c55e', '#fbbf24', '#3b82f6'],
      })
      toast.success('🎉 Recompensa disponible', {
        description: 'Ya podés canjear tu recompensa',
        duration: 4000,
      })
      setTimeout(() => setUnlocked(false), 1500)
    }
    prevCanAfford.current = canAfford
  }, [canAfford, playPop])

  async function handleRedeem() {
    if (!canRedeem) return
    haptic.success()
    setLoading(true)
    try {
      await onRedeem(item._id)
    } finally {
      setLoading(false)
    }
  }

  const cardBorder = !canAfford
    ? '1px solid var(--tgo-border)'
    : unlocked
      ? '2px solid var(--tgo-state-success)'
      : '2px solid var(--tgo-state-success)'

  return (
    <div
      className="overflow-hidden transition-all duration-500"
      style={{
        borderRadius: 'var(--tgo-radius-xl)',
        backgroundColor: 'var(--tgo-surface-card)',
        border: cardBorder,
        boxShadow: 'var(--tgo-elevation-card)',
        opacity: !canAfford ? 0.6 : 1,
        filter: !canAfford ? 'grayscale(1)' : 'none',
      }}
    >
      <div className="relative h-48" style={{ backgroundColor: 'var(--tgo-surface-1)' }}>
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package size={48} style={{ color: 'var(--tgo-text-muted)', opacity: 0.3 }} />
          </div>
        )}

        {/* Points Badge */}
        <div className="absolute top-3 right-3">
          <div
            className="flex items-center gap-1 text-white font-bold px-3 py-1.5"
            style={{
              borderRadius: 'var(--tgo-radius-md)',
              backgroundColor: 'rgba(0,0,0,0.85)',
            }}
          >
            <Star size={14} className="fill-white" />
            {item.pointsCost} pts
          </div>
        </div>

        {/* Stock Badge */}
        {item.stock !== null && (
          <div className="absolute top-3 left-3">
            <div
              className="text-white text-xs font-bold px-3 py-1.5"
              style={{
                borderRadius: 'var(--tgo-radius-md)',
                backgroundColor: inStock ? 'rgba(0,0,0,0.85)' : 'var(--tgo-state-danger)',
              }}
            >
              {inStock ? `${item.stock} disponibles` : 'Sin stock'}
            </div>
          </div>
        )}
      </div>

      <div className="p-4">
        <h3 className="font-bold text-lg mb-2" style={{ color: 'var(--tgo-text-primary)' }}>
          {item.name}
        </h3>
        <p
          className="text-sm line-clamp-2 mb-4"
          style={{ color: 'var(--tgo-text-muted)' }}
        >
          {item.description}
        </p>

        {/* Progress Bar */}
        {!canAfford && (
          <div className="mb-4">
            <div
              className="flex items-center justify-between text-xs mb-1"
              style={{ color: 'var(--tgo-text-muted)' }}
            >
              <span>Tus puntos</span>
              <span>{memberPoints} / {item.pointsCost}</span>
            </div>
            <div
              className="h-2 rounded-full overflow-hidden"
              style={{ backgroundColor: 'var(--tgo-surface-1)' }}
            >
              <div
                className="h-full transition-all"
                style={{
                  width: `${progress}%`,
                  background: `linear-gradient(90deg, var(--tgo-state-interactive), var(--tgo-state-interactive-muted))`,
                }}
              />
            </div>
            <p
              className="text-xs font-medium mt-1"
              style={{ color: 'var(--tgo-state-discovery)' }}
            >
              Necesitas {pointsNeeded} puntos más
            </p>
          </div>
        )}

        {/* Tier Requirement */}
        {!meetsTier && (
          <div
            className="mb-4 p-2"
            style={{
              borderRadius: 'var(--tgo-radius-md)',
              backgroundColor: 'var(--tgo-state-discovery-soft)',
              border: '1px solid var(--tgo-state-discovery)',
            }}
          >
            <div
              className="flex items-center gap-2 text-xs font-medium"
              style={{ color: 'var(--tgo-state-discovery)' }}
            >
              <Lock size={12} />
              Requiere nivel {item.tierRequirement}
            </div>
          </div>
        )}

        {/* Recurrence Requirement */}
        {hasRecurrenceRequirement && (
          <div
            className="mb-4 p-2"
            style={{
              borderRadius: 'var(--tgo-radius-md)',
              backgroundColor: 'rgba(168, 85, 247, 0.05)',
              border: '1px solid rgba(168, 85, 247, 0.2)',
            }}
          >
            <div className="flex items-center gap-2 text-purple-700 text-xs font-medium">
              <Package size={12} />
              Requiere compras recurrentes de este producto
            </div>
          </div>
        )}

        {/* Cash Value */}
        {item.cashValue && (
          <div className="mb-4 text-xs" style={{ color: 'var(--tgo-text-muted)' }}>
            Valor estimado: ${item.cashValue}
          </div>
        )}

        <button
          onClick={handleRedeem}
          disabled={!canRedeem || loading}
          className="w-full py-3 font-bold text-sm text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            borderRadius: 'var(--tgo-radius-md)',
            backgroundColor: canRedeem ? 'var(--tgo-state-interactive)' : 'var(--tgo-surface-1)',
            color: canRedeem ? 'white' : 'var(--tgo-text-muted)',
          }}
        >
          {loading ? (
            'Procesando...'
          ) : !canAfford ? (
            'Puntos insuficientes'
          ) : !meetsTier ? (
            'Nivel insuficiente'
          ) : !inStock ? (
            'Sin stock'
          ) : hasRecurrenceRequirement ? (
            'Requiere compras recurrentes'
          ) : (
            <span className="flex items-center justify-center gap-2">
              <TrendingUp size={16} />
              Canjear
            </span>
          )}
        </button>
      </div>
    </div>
  )
}
