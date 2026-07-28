'use client'

import React, { useEffect, useState } from 'react'
import { microcopy } from '@/components/tgo/microcopy'
import { ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocation } from '@/components/explore/LocationContext'
import BottomNav from '@/components/explore/BottomNav'

interface Promo {
  _id: string
  title: string
  description: string
  imageUrl?: string
  price: number
  originalPrice?: number
  tenantId: string
  locationId?: string
  tenantSlug?: string
  type?: string
  tenantLogo?: string
  tenantName?: string
}

export default function PromocionesClient() {
  const router = useRouter()
  const { currentAddress, loading: locationLoading } = useLocation()
  const [promos, setPromos] = useState<Promo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (currentAddress) {
      fetchPromos()
    }
  }, [currentAddress])

  const fetchPromos = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/explore/promotions?lat=${currentAddress?.coordinates.lat}&lng=${currentAddress?.coordinates.lng}`)
      const json = await res.json()
      setPromos(json.promotions || [])
    } catch (err) {
      console.error('Error fetching promotions:', err)
    } finally {
      setLoading(false)
    }
  }

  if (locationLoading || loading) {
    return (
      <div
        className="flex flex-col h-full items-center justify-center"
        style={{ backgroundColor: 'var(--tgo-surface-0)' }}
      >
        <Loader2 size={32} style={{ color: 'var(--tgo-text-muted)' }} className="animate-spin" />
      </div>
    )
  }

  return (
    <div
      className="flex flex-col h-full overflow-y-auto pb-24"
      style={{ backgroundColor: 'var(--tgo-surface-0)' }}
    >
      {/* Header */}
      <div
        className="sticky top-0 z-10"
        style={{
          backgroundColor: 'var(--tgo-surface-0)',
          borderBottom: '1px solid var(--tgo-border)',
        }}
      >
        <div className="flex items-center gap-4 p-4">
          <button
            onClick={() => router.back()}
            className="flex items-center justify-center transition-colors"
            style={{
              width: 40,
              height: 40,
              borderRadius: 'var(--tgo-radius-md)',
              backgroundColor: 'var(--tgo-surface-1)',
              color: 'var(--tgo-text-primary)',
            }}
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--tgo-text-primary)' }}>
              {microcopy.promotions.title}
            </h1>
            <p className="text-xs" style={{ color: 'var(--tgo-text-muted)' }}>
              {microcopy.promotions.subtitle}
            </p>
          </div>
        </div>
      </div>

      {/* Promos List */}
      <div className="flex-1 p-4 space-y-4">
        {promos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="font-medium mb-1" style={{ color: 'var(--tgo-text-primary)' }}>
              {microcopy.promotions.empty}
            </p>
            <p
              className="text-sm text-center max-w-[200px]"
              style={{ color: 'var(--tgo-text-muted)' }}
            >
              {microcopy.promotions.emptySub}
            </p>
          </div>
        ) : (
          promos
            .filter(promo => promo.tenantSlug)
            .map(promo => {
              const isSale = promo.type === 'sale'
              const discount = isSale && promo.originalPrice
                ? Math.round(((promo.originalPrice - promo.price) / promo.originalPrice) * 100)
                : 0

              return (
                <Link
                  key={promo._id}
                  href={promo.locationId
                    ? `/${promo.tenantSlug}/menu/${promo.locationId}`
                    : `/${promo.tenantSlug}`}
                  className="block active:scale-[0.985] transition-all duration-200"
                  style={{
                    borderRadius: 'var(--tgo-radius-2xl)',
                    backgroundColor: 'var(--tgo-card)',
                    border: '1px solid var(--tgo-border)',
                    boxShadow: 'var(--shadow-card)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    className="relative h-[168px]"
                    style={{ background: 'linear-gradient(135deg, var(--tgo-surface-3), var(--tgo-surface-2))' }}
                  >
                    {promo.imageUrl && (
                      <img
                        src={promo.imageUrl}
                        alt={promo.title}
                        className="absolute inset-0 w-full h-full object-cover opacity-90"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

                    {/* Top Badges */}
                    <div className="absolute top-3 left-3 right-3 flex justify-between items-start z-10">
                      {promo.tenantLogo ? (
                        <div
                          className="w-9 h-9 overflow-hidden flex-shrink-0"
                          style={{
                            borderRadius: 'var(--tgo-radius-xl)',
                            backgroundColor: 'var(--tgo-card)',
                            boxShadow: 'var(--tgo-elevation-overlay)',
                          }}
                        >
                          <img
                            src={promo.tenantLogo}
                            alt={promo.tenantName || ''}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div
                          className="w-9 h-9 flex items-center justify-center"
                          style={{
                            borderRadius: 'var(--tgo-radius-xl)',
                            backgroundColor: 'var(--tgo-card)',
                          }}
                        />
                      )}

                      {discount > 0 && (
                        <div
                          className="text-white text-xs font-black px-3 py-1"
                          style={{
                            borderRadius: 'var(--tgo-radius-xl)',
                            backgroundColor: 'var(--tgo-state-success)',
                            boxShadow: 'var(--tgo-elevation-overlay)',
                          }}
                        >
                          {discount}% OFF
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="absolute bottom-0 left-0 right-0 p-4 z-10">
                      <div className="flex items-center gap-2 mb-1">
                        {promo.tenantName && (
                          <span className="text-white/70 text-xs font-medium">
                            {promo.tenantName}
                          </span>
                        )}
                      </div>
                      <h3 className="text-white font-bold text-lg leading-tight line-clamp-2 mb-1 tracking-tight">
                        {promo.title}
                      </h3>
                      <p className="text-white/80 text-sm line-clamp-2 leading-snug mb-3">
                        {promo.description}
                      </p>

                      {isSale && (
                        <div className="flex items-baseline gap-2">
                          <span className="text-2xl font-black text-white tracking-tighter">
                            ${promo.price.toLocaleString('es-AR')}
                          </span>
                          {promo.originalPrice && (
                            <span className="text-white/60 line-through text-base">
                              ${promo.originalPrice.toLocaleString('es-AR')}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              )
            })
        )}
      </div>

      <BottomNav />
    </div>
  )
}
