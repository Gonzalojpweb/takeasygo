'use client'

import React from 'react'
import { ArrowRight } from 'lucide-react'
import Link from 'next/link'

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

export default function PromoCarousel({ promos }: { promos: Promo[] }) {
  if (!promos || promos.length === 0) return null

  return (
    <div className="py-5">
      {/* Header */}
      <div className="flex items-center justify-between px-4 mb-4">
        <div>
          <h2
            className="text-xl font-black tracking-[-0.02em]"
            style={{ color: 'var(--tgo-text-primary)' }}
          >
            Ofertas Destacadas
          </h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--tgo-text-muted)' }}>
            ¡Aprovechá estos beneficios hoy!
          </p>
        </div>
        <Link
          href="/app/promociones"
          className="font-semibold text-sm flex items-center gap-1.5 hover:underline"
          style={{ color: 'var(--tgo-text-link)' }}
        >
          Ver todas <ArrowRight size={16} />
        </Link>
      </div>

      {/* Carousel */}
      <div className="flex gap-4 overflow-x-auto px-4 pb-6 snap-x snap-mandatory scrollbar-none scroll-smooth">
        {promos
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
                className="shrink-0 w-[88%] max-w-[300px] snap-start active:scale-[0.985] transition-all duration-200"
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
                  {/* Background Image */}
                  {promo.imageUrl && (
                    <img
                      src={promo.imageUrl}
                      alt={promo.title}
                      className="absolute inset-0 w-full h-full object-cover opacity-90"
                    />
                  )}

                  {/* Gradient Overlay */}
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
                    <h3 className="text-white font-bold text-lg leading-tight line-clamp-2 mb-1.5 tracking-tight">
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
          })}
      </div>
    </div>
  )
}
