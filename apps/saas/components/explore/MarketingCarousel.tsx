'use client'

import React from 'react'
import { ArrowRight, Gift, Sparkles } from 'lucide-react'
import Link from 'next/link'

interface Campaign {
  tenantId: string
  tenantName: string
  tenantSlug: string
  title: string
  subtitle: string
  imageUrl?: string
  discountPercentage: number
  type: string
  buttonText: string
}

export default function MarketingCarousel({ campaigns }: { campaigns: Campaign[] }) {
  if (!campaigns || campaigns.length === 0) return null

  return (
    <div className="py-4" style={{ backgroundColor: 'var(--tgo-surface-1)' }}>
      <div className="flex items-center justify-between px-4 mb-3">
        <div>
          <h2
            className="text-lg font-black tracking-tight"
            style={{ color: 'var(--tgo-text-primary)' }}
          >
            Beneficios Exclusivos
          </h2>
          <p className="text-[10px] font-medium" style={{ color: 'var(--tgo-text-muted)' }}>
            Aprovechá hoy en tus locales favoritos
          </p>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto px-4 pb-2 no-scrollbar snap-x">
        {campaigns.map((camp) => (
          <Link
            key={camp.tenantId}
            href={`/${camp.tenantSlug}`}
            className="shrink-0 w-[260px] snap-center overflow-hidden flex flex-col"
            style={{
              borderRadius: 'var(--tgo-radius-2xl)',
              backgroundColor: 'var(--tgo-surface-card)',
              border: '1px solid var(--tgo-border)',
              boxShadow: 'var(--tgo-elevation-card)',
            }}
          >
            <div className="h-32 relative">
              {camp.imageUrl ? (
                <img src={camp.imageUrl} alt={camp.title} className="w-full h-full object-cover" />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center"
                  style={{ backgroundColor: 'var(--tgo-state-interactive-soft)' }}
                >
                  <Gift size={32} style={{ color: 'var(--tgo-state-interactive)', opacity: 0.2 }} />
                </div>
              )}
              <div
                className="absolute top-3 left-3 px-2.5 py-1 flex items-center gap-1.5"
                style={{
                  borderRadius: 'var(--tgo-radius-md)',
                  backgroundColor: 'var(--tgo-surface-card)',
                  boxShadow: 'var(--tgo-elevation-overlay)',
                }}
              >
                <Sparkles size={10} style={{ color: 'var(--tgo-state-interactive)' }} />
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 900,
                    textTransform: 'uppercase',
                    letterSpacing: 'var(--tgo-tracking-widest)',
                    color: 'var(--tgo-text-primary)',
                  }}
                >
                  {camp.tenantName}
                </span>
              </div>
            </div>

            <div className="p-4">
              <h3
                className="font-bold text-sm leading-tight mb-1"
                style={{ color: 'var(--tgo-text-primary)' }}
              >
                {camp.title}
              </h3>
              <p
                className="text-[10px] font-medium leading-snug line-clamp-2 mb-3"
                style={{ color: 'var(--tgo-text-muted)' }}
              >
                {camp.subtitle.replace('{discount}', `${camp.discountPercentage}%`)}
              </p>

              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 900,
                      textTransform: 'uppercase',
                      letterSpacing: 'var(--tgo-tracking-widest)',
                      color: 'var(--tgo-text-muted)',
                    }}
                  >
                    Descuento
                  </span>
                  <span
                    className="text-xl font-black leading-none"
                    style={{ color: 'var(--tgo-state-interactive)' }}
                  >
                    -{camp.discountPercentage}%
                  </span>
                </div>
                <div
                  className="w-9 h-9 flex items-center justify-center text-white"
                  style={{
                    borderRadius: 'var(--tgo-radius-md)',
                    backgroundColor: 'var(--tgo-state-interactive)',
                    boxShadow: 'var(--tgo-elevation-overlay)',
                  }}
                >
                  <ArrowRight size={16} className="stroke-[3]" />
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
