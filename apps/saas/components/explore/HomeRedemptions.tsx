'use client'

import React from 'react'
import { Star, Gift, ChevronRight } from 'lucide-react'
import Link from 'next/link'

interface Redemption {
  _id: string
  name: string
  pointsCost: number
  imageUrl: string
  tenantId: string
  tenantSlug?: string
  tenantName?: string
}

export default function HomeRedemptions({ items }: { items: Redemption[] }) {
  if (!items || items.length === 0) return null

  return (
    <div className="py-6 px-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-black tracking-tight" style={{ color: 'var(--tgo-text-primary)' }}>Canjes del Club</h2>
          <p className="text-[10px] font-medium" style={{ color: 'var(--tgo-text-muted)' }}>Usá tus puntos en tus locales favoritos</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {items.map((item) => (
          <Link 
            key={item._id}
            href={`/${item.tenantSlug}/club/lookup`}
            className="rounded-3xl p-3 border shadow-md flex flex-col items-center text-center active:scale-[0.97] transition-transform duration-150"
            style={{ backgroundColor: 'var(--tgo-card)', borderColor: 'var(--tgo-border)' }}
          >
            <div className="w-20 h-20 rounded-2xl overflow-hidden mb-2 relative">
              <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
              <div className="absolute top-1.5 right-1.5 text-white p-1 rounded-lg shadow-sm" style={{ backgroundColor: 'var(--tgo-state-reward)' }}>
                <Star size={10} className="fill-white" />
              </div>
            </div>
            
            <h3 className="font-bold text-[11px] leading-tight mb-2 line-clamp-2 h-7" style={{ color: 'var(--tgo-text-primary)' }}>{item.name}</h3>
            
            <div className="w-full rounded-xl py-1.5 px-2.5 flex items-center justify-between" style={{ backgroundColor: 'var(--tgo-surface-1)' }}>
              <div className="flex flex-col items-start">
                <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--tgo-text-muted)' }}>Puntos</span>
                <span className="text-xs font-black leading-none" style={{ color: 'var(--tgo-state-reward)' }}>{item.pointsCost}</span>
              </div>
              <div className="w-5 h-5 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--tgo-card)', color: 'var(--tgo-text-muted)' }}>
                <ChevronRight size={12} />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
