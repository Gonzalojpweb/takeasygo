'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Package, Filter, Star, ArrowLeft, Gift } from 'lucide-react'
import { toast } from 'sonner'
import StoreItemCard from './StoreItemCard'
import RedemptionSuccess from './RedemptionSuccess'
import MyRedemptions from './MyRedemptions'

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
  isFeatured: boolean
}

interface Member {
  _id: string
  loyalty: {
    points: number
    tier: string
  }
}

interface StoreConfig {
  enabled: boolean
  title: string
  description: string
  heroImageUrl: string
}

interface Props {
  tenantSlug: string
  memberId: string
  memberPoints: number
  memberTier: string
  tenantBranding?: {
    primaryColor: string
    secondaryColor: string
    logoUrl: string
  }
  onBack?: () => void
}

const CATEGORIES = [
  { value: 'all', label: 'Todos', icon: '🏠' },
  { value: 'food', label: 'Comida', icon: '🍔' },
  { value: 'drink', label: 'Bebida', icon: '🥤' },
  { value: 'merch', label: 'Merch', icon: '👕' },
  { value: 'experience', label: 'Experiencia', icon: '🎟️' },
]

export default function StoreView({ tenantSlug, memberId, memberPoints, memberTier, tenantBranding, onBack }: Props) {
  const [items, setItems] = useState<StoreItem[]>([])
  const [config, setConfig] = useState<StoreConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [showRedemptions, setShowRedemptions] = useState(false)
  const [redeemedItem, setRedeemedItem] = useState<{ item: StoreItem; redemptionCode: string; expiresAt: string } | null>(null)
  const [points, setPoints] = useState(memberPoints)
  const [redemption, setRedemption] = useState<any>(null)
  const [showMyRedemptions, setShowMyRedemptions] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const [itemsRes, configRes] = await Promise.all([
        fetch(`/api/${tenantSlug}/store/items?isActive=true`),
        fetch(`/api/${tenantSlug}/store/config`),
      ])
      
      const itemsData = await itemsRes.json()
      const configData = await configRes.json()

      if (itemsRes.ok) setItems(itemsData.items || [])
      if (configRes.ok) setConfig(configData.config)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  const filteredItems = items.filter(item => 
    filterCategory === 'all' || item.category === filterCategory
  )

  const featuredItems = filteredItems.filter(item => item.isFeatured)
  const regularItems = filteredItems.filter(item => !item.isFeatured)

  const handleRedeem = async (itemId: string) => {
    try {
      const res = await fetch(`/api/${tenantSlug}/store/redemptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al canjear')
      
      setRedeemedItem({
        item: items.find(i => i._id === itemId)!,
        redemptionCode: data.redemptionCode,
        expiresAt: data.expiresAt,
      })
      
      // Update points
      setPoints(data.newPoints || points - items.find(i => i._id === itemId)!.pointsCost)
      
      // Refresh items and member data
      fetchData()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  if (showMyRedemptions) {
    return (
      <MyRedemptions
        tenantSlug={tenantSlug}
        memberId={memberId}
        onBack={() => setShowMyRedemptions(false)}
      />
    )
  }

  if (redeemedItem) {
    return (
      <RedemptionSuccess
        tenantSlug={tenantSlug}
        redemption={{
          ...redeemedItem,
          pointsUsed: redeemedItem.item.pointsCost,
        }}
        item={redeemedItem.item}
        member={{
          id: memberId,
          loyalty: { points: memberPoints, tier: memberTier },
        }}
        onBack={() => {
          setRedeemedItem(null)
          fetchData()
        }}
      />
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Cargando...</div>
      </div>
    )
  }

  if (!config?.enabled) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center">
          <Gift size={48} className="mx-auto text-muted-foreground/30 mb-4" />
          <h2 className="text-xl font-bold mb-2">Tienda no disponible</h2>
          <p className="text-muted-foreground mb-4">
            La tienda de recompensas no está habilitada en este momento.
          </p>
          {onBack && (
            <Button onClick={onBack} variant="outline">
              Volver
            </Button>
          )}
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {/* Header */}
      <div 
        className="relative pt-12 pb-8 px-4"
        style={{ backgroundColor: tenantBranding?.primaryColor || '#000' }}
      >
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            {onBack && (
              <Button
                onClick={onBack}
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/10"
              >
                <ArrowLeft size={24} />
              </Button>
            )}
            <h1 className="text-3xl font-black text-white tracking-tight">
              {config.title}
            </h1>
          </div>

          {/* Points Balance */}
          <Card className="bg-white/10 backdrop-blur-sm border-white/20 p-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                  <Star size={24} className="text-yellow-300 fill-yellow-300" />
                </div>
                <div className="text-right">
                  <p className="text-3xl font-black text-white">{points}</p>
                  <p className="text-xs text-white/80">Puntos disponibles</p>
                </div>
              </div>
              <Badge className="bg-white text-black font-bold">
                {memberTier === 'none' ? 'Sin nivel' : memberTier}
              </Badge>
            </div>
          </Card>

          {config.heroImageUrl && (
            <img
              src={config.heroImageUrl}
              alt="Hero"
              className="w-full h-48 object-cover rounded-2xl mb-4"
            />
          )}

          <p className="text-white/80 text-sm">{config.description}</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Category Filters */}
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
          <Filter size={18} className="text-muted-foreground shrink-0" />
          {CATEGORIES.map(cat => (
            <Button
              key={cat.value}
              size="sm"
              variant={filterCategory === cat.value ? 'default' : 'outline'}
              onClick={() => setFilterCategory(cat.value)}
              className="shrink-0"
            >
              {cat.icon} {cat.label}
            </Button>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowMyRedemptions(true)}
            className="shrink-0 ml-auto"
          >
            Mis Canjes
          </Button>
        </div>

        {/* Featured Items */}
        {featuredItems.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Star size={18} className="text-amber-500 fill-amber-500" />
              Destacados
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {featuredItems.map(item => (
                <StoreItemCard
                  key={item._id}
                  item={item}
                  memberPoints={points}
                  memberTier={memberTier}
                  onRedeem={handleRedeem}
                />
              ))}
            </div>
          </div>
        )}

        {/* Regular Items */}
        {regularItems.length > 0 && (
          <div>
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Package size={18} />
              Todos los artículos
            </h2>
            {regularItems.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {regularItems.map(item => (
                  <StoreItemCard
                    key={item._id}
                    item={item}
                    memberPoints={points}
                    memberTier={memberTier}
                    onRedeem={handleRedeem}
                  />
                ))}
              </div>
            ) : (
              <Card className="p-8 text-center">
                <Package size={48} className="mx-auto text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground">
                  No hay artículos en esta categoría
                </p>
              </Card>
            )}
          </div>
        )}

        {filteredItems.length === 0 && (
          <Card className="p-8 text-center">
            <Package size={48} className="mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">
              No hay artículos disponibles
            </p>
          </Card>
        )}
      </div>
    </div>
  )
}
