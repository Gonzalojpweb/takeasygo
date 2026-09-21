'use client'

import { useState } from 'react'
import { Star } from 'lucide-react'
import ClubDiscountConfig from './ClubDiscountConfig'

interface Props {
  tenantSlug: string
  categories: any[]
}

export default function ClubDiscountModal({ tenantSlug, categories }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#f74211] hover:bg-[#f74211]/90 text-white text-sm font-bold transition-colors shadow-lg shadow-[#f74211]/20 cursor-pointer"
      >
        <Star size={16} />
        Descuento Club
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Dialog */}
          <div className="relative bg-zinc-900 border border-zinc-700/50 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-700/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#f74211]/10 flex items-center justify-center">
                  <Star size={20} className="text-[#f74211]" />
                </div>
                <div>
                  <h2 className="text-white font-bold text-lg">Descuento Club</h2>
                  <p className="text-zinc-400 text-xs">Configurá el descuento exclusivo para miembros</p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <ClubDiscountConfig tenantSlug={tenantSlug} categories={categories} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
