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
          <h2 className="text-lg font-black text-slate-900 tracking-tight">Canjes del Club</h2>
          <p className="text-[10px] text-slate-500 font-medium">Usá tus puntos en tus locales favoritos</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {items.map((item) => (
          <Link 
            key={item._id}
            href={`/${item.tenantSlug}/club/lookup`}
            className="bg-white rounded-3xl p-3 border border-slate-100 shadow-md shadow-slate-100 flex flex-col items-center text-center group"
          >
            <div className="w-20 h-20 rounded-2xl overflow-hidden mb-2 relative">
              <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
              <div className="absolute top-1.5 right-1.5 bg-amber-400 text-white p-1 rounded-lg shadow-sm">
                <Star size={10} className="fill-white" />
              </div>
            </div>
            
            <h3 className="font-bold text-slate-900 text-[11px] leading-tight mb-2 line-clamp-2 h-7">{item.name}</h3>
            
            <div className="w-full bg-slate-50 rounded-xl py-1.5 px-2.5 flex items-center justify-between">
              <div className="flex flex-col items-start">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Puntos</span>
                <span className="text-xs font-black text-amber-600 leading-none">{item.pointsCost}</span>
              </div>
              <div className="w-5 h-5 rounded-lg bg-white flex items-center justify-center text-slate-400 group-hover:bg-amber-400 group-hover:text-white transition-colors">
                <ChevronRight size={12} />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
