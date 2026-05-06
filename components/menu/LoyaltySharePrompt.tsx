'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Share2, Instagram, MessageCircle, Star, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LoyaltySharePromptProps {
  tenantName: string
  clubName: string
  discountAmount: number
  pointsUsed?: number
}

export default function LoyaltySharePrompt({
  tenantName,
  clubName,
  discountAmount,
  pointsUsed
}: LoyaltySharePromptProps) {
  const [shared, setShared] = useState(false)

  const shareText = `¡Acabo de ahorrar $${discountAmount.toLocaleString()} en ${tenantName} usando mis puntos del ${clubName}! 🍕✨ ¡Sumate vos también!`
  const shareUrl = typeof window !== 'undefined' ? window.location.origin : ''

  const shareWhatsApp = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(shareText + ' ' + shareUrl)}`
    window.open(url, '_blank')
    setShared(true)
  }

  const shareInstagram = () => {
    // Instagram doesn't support direct text sharing via URL like WA, 
    // but we can copy the text to clipboard and open IG.
    navigator.clipboard.writeText(shareText)
    window.open('https://www.instagram.com/', '_blank')
    setShared(true)
  }

  return (
    <div className="relative overflow-hidden rounded-[2.5rem] bg-zinc-950 text-white p-8 border border-white/10 shadow-2xl">
      {/* Decorative elements */}
      <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-orange-500/20 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl" />
      
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Sparkles className="text-white" size={24} />
          </div>
          <div>
            <h3 className="text-xl font-black tracking-tight leading-none italic uppercase">
              ¡Ahorro nivel VIP!
            </h3>
            <p className="text-[10px] uppercase tracking-[0.2em] text-orange-500 font-black mt-1">
              Beneficio Exclusivo {clubName}
            </p>
          </div>
        </div>

        <div className="space-y-4 mb-8">
          <p className="text-zinc-400 text-sm leading-relaxed">
            Acabas de usar {pointsUsed} puntos para descontar <span className="text-white font-bold">${discountAmount.toLocaleString()}</span> de tu orden.
          </p>
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 italic text-sm text-zinc-300">
            "{shareText}"
          </div>
          <p className="text-[10px] text-zinc-500 font-medium">
            📸 Subí una captura a tus historias, etiquetanos y <span className="text-orange-400 font-bold">ganá 50 puntos extra</span> para tu próxima visita.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button 
            onClick={shareInstagram}
            className="flex-1 h-12 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold border-none shadow-lg shadow-pink-500/20"
          >
            <Instagram size={18} className="mr-2" />
            Compartir en IG
          </Button>
          <Button 
            onClick={shareWhatsApp}
            className="flex-1 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold border-none shadow-lg shadow-emerald-500/20"
          >
            <MessageCircle size={18} className="mr-2" />
            WhatsApp
          </Button>
        </div>

        {shared && (
          <div className="mt-6 flex items-center justify-center gap-2 text-orange-400 animate-bounce">
            <Star size={14} fill="currentColor" />
            <span className="text-[10px] font-black uppercase tracking-widest">¡Gracias por compartir!</span>
            <Star size={14} fill="currentColor" />
          </div>
        )}
      </div>
    </div>
  )
}
