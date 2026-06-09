'use client'

import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { QrPromoData } from './types'

interface InfoContentProps {
  promo: QrPromoData
  onContinue: () => void
}

export function InfoContent({ promo, onContinue }: InfoContentProps) {
  return (
    <div className="flex flex-col items-center gap-5 px-6 py-6 text-center">
      <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-md">
        {promo.subtitle}
      </p>

      <Button
        onClick={onContinue}
        size="lg"
        className="sm:w-auto w-[120px] rounded-2xl gap-2 shadow-lg shadow-primary/25 text-base h-12"
      >
        {promo.buttonText}
        <ArrowRight size={16} />
      </Button>
    </div>
  )
}
