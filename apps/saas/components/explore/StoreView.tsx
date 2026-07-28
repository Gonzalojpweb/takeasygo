'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Package, Filter, Star, ArrowLeft, Gift } from 'lucide-react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/tgo'
import StoreItemCard from './StoreItemCard'
import RedemptionSuccess from './RedemptionSuccess'
import MyRedemptions from './MyRedemptions'
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
  isFeatured: boolean
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
  menuUrl?: string
}

const CATEGORIES = [
  { value: 'all', label: 'Todos', icon: '🏠' },
  { value: 'food', label: 'Comida', icon: '🍔' },
  { value: 'drink', label: 'Bebida', icon: '🥤' },
  { value: 'merch', label: 'Merch', icon: '👕' },
  { value: 'experience', label: 'Experiencia', icon: '🎟️' },
]

export default function StoreView({ tenantSlug, memberId, memberPoints, memberTier, tenantBranding, onBack, menuUrl }: Props) {
  const haptic = useHaptic()
  const router = useRouter()
  const [items, setItems] = useState<StoreItem[]>([])
  const [config, setConfig] = useState<StoreConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [redeemedItem, setRedeemedItem] = useState<{ item: StoreItem; redemptionCode: string; expiresAt: string } | null>(null)
  const [points, setPoints] = useState(memberPoints)
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
        body: JSON.stringify({ memberId, storeItemId: itemId }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.currentPurchases !== undefined && data.requiredPurchases !== undefined) {
          toast.error(`Necesitás ${data.requiredPurchases} compras para canjear. Llevás ${data.currentPurchases}.`)
          return
        }
        throw new Error(data.error || 'Error al canjear')
      }

      const redemption = data.redemption || data

      setRedeemedItem({
        item: items.find(i => i._id === itemId)!,
        redemptionCode: redemption.redemptionCode,
        expiresAt: redemption.expiresAt,
      })

      setPoints(data.member?.points ?? points - items.find(i => i._id === itemId)!.pointsCost)

      if (data.microSosApplied && data.pendingAdvance > 0) {
        toast.success(`Canje exitoso. Tenés ${data.pendingAdvance} puntos pendientes para consolidar en tu próxima compra.`, { duration: 6000 })
      }
    } catch (err: any) {
      toast.error(err.message || 'Error al canjear')
    }
  }

  if (showMyRedemptions) {
    return (
      <MyRedemptions
        tenantSlug={tenantSlug}
        memberId={memberId}
        onBack={() => setShowMyRedemptions(false)}
        menuUrl={menuUrl}
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
          loyalty: { points, tier: memberTier },
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
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: 'var(--tgo-surface-0)' }}
      >
        <div style={{ color: 'var(--tgo-text-muted)' }}>Cargando...</div>
      </div>
    )
  }

  if (!config?.enabled) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ backgroundColor: 'var(--tgo-surface-0)' }}
      >
        <div className="max-w-md w-full" style={{ borderRadius: 'var(--tgo-radius-xl)', backgroundColor: 'var(--tgo-card)', border: '1px solid var(--tgo-border)' }}>
          <EmptyState
            icon={<Gift size={48} />}
            title="Tienda no disponible"
            subtitle="La tienda de recompensas no está habilitada en este momento."
            secondaryAction={onBack ? { label: "Volver", onClick: onBack } : undefined}
          />
        </div>
      </div>
    )
  }

  const brandColor = tenantBranding?.primaryColor || 'var(--tgo-brand-primary)'

  return (
    <div
      className="min-h-screen"
      style={{ background: `linear-gradient(180deg, var(--tgo-surface-0), var(--tgo-surface-1) 50%)` }}
    >
      {/* Header */}
      <div className="relative pt-12 pb-8 px-4" style={{ backgroundColor: brandColor }}>
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            {onBack && (
              <button
                onClick={() => { haptic.impact('light'); onBack() }}
                aria-label="Volver al club"
                className="text-white hover:bg-white/10 transition-colors p-2"
              >
                <ArrowLeft size={24} />
              </button>
            )}
            <h1 className="text-3xl font-black text-white tracking-tight">
              {config.title}
            </h1>
          </div>

          {menuUrl && (
            <button
              onClick={() => { haptic.impact('light'); router.push(menuUrl) }}
              aria-label="Volver al menú"
              className="w-fit mb-4 text-white hover:bg-white/10 transition-colors px-4 py-2 text-sm font-medium"
            >
              <ArrowLeft size={18} className="mr-2 inline" />
              Volver al Menú
            </button>
          )}

          {/* Points Balance */}
          <div
            className="p-4 mb-6"
            style={{
              borderRadius: 'var(--tgo-radius-xl)',
              backgroundColor: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
                >
                  <Star size={24} className="text-yellow-300 fill-yellow-300" />
                </div>
                <div className="text-right">
                  <p className="text-3xl font-black text-white">{points}</p>
                  <p className="text-xs text-white font-medium">Puntos disponibles</p>
                </div>
              </div>
              <div
                className="px-3 py-1 text-black font-bold text-sm"
                style={{ borderRadius: 'var(--tgo-radius-md)', backgroundColor: 'white' }}
              >
                {memberTier === 'none' ? 'Sin nivel' : memberTier}
              </div>
            </div>
          </div>

          {config.heroImageUrl && (
            <img
              src={config.heroImageUrl}
              alt="Hero"
              className="w-full h-48 object-cover mb-4"
              style={{ borderRadius: 'var(--tgo-radius-xl)' }}
            />
          )}

          <p className="text-white text-sm">{config.description}</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Category Filters */}
        <div
          className="flex items-center gap-2 mb-6 overflow-x-auto pb-2"
          role="tablist"
          aria-label="Filtrar por categoría"
        >
          <Filter size={18} className="shrink-0" style={{ color: 'var(--tgo-text-muted)' }} />
          {CATEGORIES.map(cat => (
            <button
              key={cat.value}
              role="tab"
              aria-selected={filterCategory === cat.value}
              onClick={() => { haptic.selection(); setFilterCategory(cat.value) }}
              className="shrink-0 px-4 py-2 text-sm font-bold transition-all"
              style={{
                borderRadius: 'var(--tgo-radius-md)',
                backgroundColor: filterCategory === cat.value ? 'var(--tgo-state-trust)' : 'var(--tgo-card)',
                color: filterCategory === cat.value ? 'white' : 'var(--tgo-text-primary)',
                border: `1px solid ${filterCategory === cat.value ? 'var(--tgo-state-trust)' : 'var(--tgo-border)'}`,
              }}
            >
              {cat.icon} {cat.label}
            </button>
          ))}
          <button
            onClick={() => { haptic.impact('light'); setShowMyRedemptions(true) }}
            aria-label="Ver mis canjes"
            className="shrink-0 ml-auto px-4 py-2 text-sm font-bold transition-all"
            style={{
              borderRadius: 'var(--tgo-radius-md)',
              border: '1px solid var(--tgo-border)',
              backgroundColor: 'var(--tgo-card)',
              color: 'var(--tgo-text-primary)',
            }}
          >
            Mis Canjes
          </button>
        </div>

        {/* Featured Items */}
        {featuredItems.length > 0 && (
          <div className="mb-8">
            <h2
              className="text-lg font-bold mb-4 flex items-center gap-2"
              style={{ color: 'var(--tgo-text-primary)' }}
            >
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
            <h2
              className="text-lg font-bold mb-4 flex items-center gap-2"
              style={{ color: 'var(--tgo-text-primary)' }}
            >
              <Package size={18} />
              Todos los artículos
            </h2>
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
          </div>
        )}

        {filteredItems.length === 0 && (
          <EmptyState
            icon={<Package size={48} />}
            title="No hay artículos disponibles"
            subtitle="Probá con otra categoría o volvé más tarde."
          />
        )}
      </div>
    </div>
  )
}
