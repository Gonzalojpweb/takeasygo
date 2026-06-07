'use client'

import React, { useEffect, useState } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocation } from '@/components/explore/LocationContext'
import { cn } from '@/lib/utils'
import BottomNav from '@/components/explore/BottomNav'
export const dynamic = 'force-dynamic'

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

export default function PromocionesPage() {
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
      <div className="flex flex-col h-full bg-[var(--c-bg)] items-center justify-center">
        <Loader2 size={32} className="text-[#f14722] animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[var(--c-bg)] consumer-dark overflow-y-auto pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 glass-card border-b border-[var(--c-border)]">
        <div className="flex items-center gap-4 p-4">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-xl bg-[var(--c-surface)] flex items-center justify-center text-[#f7f4f2] hover:bg-[var(--c-border)] transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-lg font-bold text-[#f7f4f2]">Ofertas</h1>
            <p className="text-xs text-[#5a524d]">Todas las promociones disponibles</p>
          </div>
        </div>
      </div>

      {/* Promos List */}
      <div className="flex-1 p-4 space-y-4">
        {promos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-[#f7f4f2] font-medium mb-1">Sin ofertas por ahora</p>
            <p className="text-sm text-[#5a524d] text-center max-w-[200px]">
              No hay promociones disponibles en tu zona
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
                  className="block"
                >
                  <div
                    className={cn(
                      "bg-white rounded-3xl overflow-hidden shadow-xl shadow-slate-200/70",
                      "border border-slate-100 active:scale-[0.985] transition-all duration-200"
                    )}
                  >
                    <div className="relative h-[168px] bg-gradient-to-br from-slate-900 to-slate-800">
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
                          <div className="w-9 h-9 rounded-2xl overflow-hidden bg-white/95 backdrop-blur-md shadow-md ring-2 ring-white/50 flex-shrink-0">
                            <img
                              src={promo.tenantLogo}
                              alt={promo.tenantName || ''}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="w-9 h-9 rounded-2xl bg-white/95 backdrop-blur-md flex items-center justify-center shadow-md" />
                        )}

                        {discount > 0 && (
                          <div className="bg-emerald-500 text-white text-xs font-black px-3 py-1 rounded-2xl shadow-md">
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
