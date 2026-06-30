'use client'

import { Info, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { QrPromoData } from './types'

interface DiscountContentProps {
  promo: QrPromoData
  onContinue: () => void
}

export function DiscountContent({ promo, onContinue }: DiscountContentProps) {
  return (
    <div className="flex flex-col items-center gap-6 px-6 py-8 text-center">
      <div className="flex flex-wrap items-center justify-center gap-6 relative top-2">
        <span className="text-[10px] font-black uppercase tracking-[0.1em] text-primary bg-primary/10 px-3 py-1 rounded-full">
          DISFRUTÁ
        </span>
        <span className="text-[20px] font-black text-white bg-emerald-500 p-2 rounded-full">
          {promo.discountPercentage}% OFF
        </span>
      </div>

      <p className="text-xl font-bold italic sm:text-lg text-muted-foreground leading-relaxed max-w-md">
        {promo.subtitle.replace('{discount}', `${promo.discountPercentage}%`)}
      </p>

      <div className="flex gap-3 items-start rounded-2xl bg-primary/5 dark:bg-neutral-800 border border-primary/15 dark:border-neutral-700 w-full max-w-[80%] text-left">
        <Info size={18} className="text-primary flex-shrink-0" />
        <div>
          <p className="text-xs font-semibold text-foreground">
            {promo.takeawayWarningTitle || 'Exclusivo para takeaway'}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1 leading-normal">
            {promo.takeawayWarningText || 'Válido solo para pedidos para llevar.'}
          </p>
        </div>
      </div>

      <Button
        onClick={onContinue}
        size="lg"
        className="w-[60%] sm:w-auto min-w-[160px] md:min-w-[1400px] rounded-2xl gap-2 shadow-lg shadow-primary/25 text-base h-12"
      >
        {promo.buttonText}
        <ArrowRight size={16} />
      </Button>
    </div>
  )
}
