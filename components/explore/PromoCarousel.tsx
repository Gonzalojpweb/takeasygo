'use client'

import React from 'react'
import { ArrowRight, Percent } from 'lucide-react'
import Link from 'next/link'

interface Promo {
  _id: string
  title: string
  description: string
  imageUrl?: string
  price: number
  originalPrice?: number
  tenantId: string
  tenantSlug?: string // Enriquecido en el API
}

export default function PromoCarousel({ promos }: { promos: Promo[] }) {
  if (!promos || promos.length === 0) return null

  return (
    <div className="py-4 overflow-hidden">
      <div className="flex items-center justify-between px-4 mb-3">
        <div>
          <h2 className="text-lg font-black text-slate-900 tracking-tight">Ofertas Destacadas</h2>
          <p className="text-[10px] text-slate-500 font-medium">¡Aprovechá estos beneficios hoy!</p>
        </div>
        <button className="text-primary font-bold text-[10px] uppercase tracking-widest flex items-center gap-1 group">
          Ver todas <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto px-4 pb-4 no-scrollbar scroll-smooth snap-x">
        {promos.map((promo) => (
          <Link 
            key={promo._id} 
            href={`/${promo.tenantSlug}?promo=${promo._id}`}
            className="shrink-0 w-[240px] h-[140px] bg-white rounded-3xl relative overflow-hidden shadow-lg shadow-slate-200/50 snap-center group border border-slate-100"
          >
            {/* Background Decor */}
            <div className="absolute -right-2 -top-2 w-20 h-20 bg-primary/5 rounded-full blur-xl group-hover:scale-125 transition-transform duration-500" />
            
            <div className="absolute inset-0 p-4 flex flex-col justify-between z-10">
              <div className="flex justify-between items-start">
                <div className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center shadow-md">
                  <Percent size={16} className="stroke-[3]" />
                </div>
                {promo.originalPrice && (
                  <div className="bg-emerald-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter">
                    {Math.round((1 - promo.price / promo.originalPrice) * 100)}% OFF
                  </div>
                )}
              </div>

              <div>
                <h3 className="font-bold text-slate-900 text-sm leading-tight line-clamp-1">{promo.title}</h3>
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">{promo.description}</p>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-base font-black text-slate-900">${promo.price}</span>
                  {promo.originalPrice && (
                    <span className="text-[10px] text-slate-400 font-bold line-through">${promo.originalPrice}</span>
                  )}
                </div>
              </div>
            </div>

            {promo.imageUrl && (
              <div className="absolute top-2 right-2 w-24 h-24 pointer-events-none group-hover:scale-110 transition-transform duration-500">
                 <img src={promo.imageUrl} alt={promo.title} className="w-full h-full object-contain" />
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}
