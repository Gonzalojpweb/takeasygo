'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Star, TrendingUp, Lock, Package } from 'lucide-react'
import { toast } from 'sonner'

interface StoreItem {
  _id: string
  name: string
  description: string
  imageUrl: string
  pointsCost: number
  cashValue?: number
  stock?: number | null
  tierRequirement: string
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
  const [loading, setLoading] = useState(false)

  const canAfford = memberPoints >= item.pointsCost
  const meetsTier = TIER_ORDER[memberTier] >= TIER_ORDER[item.tierRequirement]
  const inStock = item.stock === null || item.stock === undefined || item.stock > 0
  const canRedeem = canAfford && meetsTier && inStock

  const pointsNeeded = item.pointsCost - memberPoints
  const progress = Math.min((memberPoints / item.pointsCost) * 100, 100)

  async function handleRedeem() {
    if (!canRedeem) return
    
    setLoading(true)
    try {
      await onRedeem(item._id)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="overflow-hidden transition-all hover:shadow-xl hover:-translate-y-1 border-2 border-border/60">
      <div className="relative h-48 bg-muted">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package size={48} className="text-muted-foreground/30" />
          </div>
        )}
        
        {/* Points Badge */}
        <div className="absolute top-3 right-3">
          <Badge className="bg-black/80 backdrop-blur-sm text-white font-bold px-3 py-1.5">
            <Star size={14} className="fill-white mr-1" />
            {item.pointsCost} pts
          </Badge>
        </div>

        {/* Stock Badge */}
        {item.stock !== null && (
          <div className="absolute top-3 left-3">
            <Badge 
              variant={inStock ? 'default' : 'destructive'}
              className="bg-black/80 backdrop-blur-sm"
            >
              {inStock ? `${item.stock} disponibles` : 'Sin stock'}
            </Badge>
          </div>
        )}
      </div>

      <CardContent className="p-4">
        <h3 className="font-bold text-lg mb-2">{item.name}</h3>
        <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
          {item.description}
        </p>

        {/* Progress Bar */}
        {!canAfford && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>Tus puntos</span>
              <span>{memberPoints} / {item.pointsCost}</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-primary to-primary/70 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-orange-600 font-medium mt-1">
              Necesitas {pointsNeeded} puntos más
            </p>
          </div>
        )}

        {/* Tier Requirement */}
        {!meetsTier && (
          <div className="mb-4 p-2 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-center gap-2 text-amber-700 text-xs font-medium">
              <Lock size={12} />
              Requiere nivel {item.tierRequirement}
            </div>
          </div>
        )}

        {/* Cash Value */}
        {item.cashValue && (
          <div className="mb-4 text-xs text-muted-foreground">
            Valor estimado: ${item.cashValue}
          </div>
        )}

        <Button
          onClick={handleRedeem}
          disabled={!canRedeem || loading}
          className="w-full"
          variant={canRedeem ? 'default' : 'outline'}
        >
          {loading ? (
            'Procesando...'
          ) : !canAfford ? (
            'Puntos insuficientes'
          ) : !meetsTier ? (
            'Nivel insuficiente'
          ) : !inStock ? (
            'Sin stock'
          ) : (
            <>
              <TrendingUp size={16} className="mr-2" />
              Canjear
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
