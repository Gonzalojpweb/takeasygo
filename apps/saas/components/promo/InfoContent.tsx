'use client'

import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import type { QrPromoData } from './types'

interface InfoContentProps {
  promo: QrPromoData
  onContinue: () => void
  accentColor?: string
}

export function InfoContent({ promo, onContinue, accentColor = '#F74211' }: InfoContentProps) {
  return (
    <div className="flex flex-col items-center gap-6 px-6 py-8 text-center">
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.5 }}
        className="text-base sm:text-lg leading-relaxed max-w-md"
        style={{
          color: 'var(--tgo-text-secondary, #6B6560)',
          fontFamily: 'var(--tgo-type-body)',
        }}
      >
        {promo.subtitle}
      </motion.p>

      <motion.button
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        whileTap={{ scale: 0.96 }}
        onClick={onContinue}
        className="w-full h-14 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm uppercase tracking-widest transition-all duration-150"
        style={{
          backgroundColor: accentColor,
          color: '#FFFFFF',
          boxShadow: `0 12px 24px -4px ${accentColor}66`,
        }}
      >
        {promo.buttonText}
        <ArrowRight size={16} />
      </motion.button>
    </div>
  )
}
