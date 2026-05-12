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
    <div className="py-4 bg-slate-50/50">
      <div className="flex items-center justify-between px-4 mb-3">
        <div>
          <h2 className="text-lg font-black text-slate-900 tracking-tight">Beneficios Exclusivos</h2>
          <p className="text-[10px] text-slate-500 font-medium">Aprovechá hoy en tus locales favoritos</p>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto px-4 pb-2 no-scrollbar snap-x">
        {campaigns.map((camp, i) => (
          <Link 
            key={camp.tenantId} 
            href={`/${camp.tenantSlug}`}
            className="shrink-0 w-[260px] bg-white rounded-3xl border border-slate-100 shadow-lg shadow-slate-200/50 snap-center overflow-hidden flex flex-col"
          >
            <div className="h-32 relative">
              {camp.imageUrl ? (
                <img src={camp.imageUrl} alt={camp.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-primary/10 flex items-center justify-center">
                   <Gift size={32} className="text-primary/20" />
                </div>
              )}
              <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-sm shadow-sm px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                <Sparkles size={10} className="text-primary fill-primary" />
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-900">
                  {camp.tenantName}
                </span>
              </div>
            </div>

            <div className="p-4">
              <h3 className="font-bold text-slate-900 text-sm leading-tight mb-1">{camp.title}</h3>
              <p className="text-[10px] text-slate-500 font-medium leading-snug line-clamp-2 mb-3">
                {camp.subtitle.replace('{discount}', `${camp.discountPercentage}%`)}
              </p>
              
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Descuento</span>
                  <span className="text-xl font-black text-primary leading-none">-{camp.discountPercentage}%</span>
                </div>
                <div className="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center shadow-md">
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
