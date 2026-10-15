'use client'

import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import type { QrPromoData } from './types'

interface DiscountContentProps {
  promo: QrPromoData
  onContinue: () => void
  accentColor?: string
}

export function DiscountContent({ promo, onContinue, accentColor = '#F74211' }: DiscountContentProps) {
  return (
    <div className="flex flex-col items-center text-center px-5 pt-8 pb-6 space-y-4">
      {/* Eyebrow */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.7 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="text-[11px] tracking-[0.15em] uppercase opacity-70"
        style={{ fontFamily: 'var(--tgo-font-body)' }}
      >
        {promo.badgeLabel || 'SOLO POR HOY'}
      </motion.p>

      {/* Discount Badge (único) */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2, duration: 0.4 }}
      >
        <span className="inline-block rounded-full bg-emerald-500 px-4 py-1.5 font-bold text-white text-[14px]">
          {promo.discountPercentage}% OFF
        </span>
      </motion.div>

      {/* Título */}
      <motion.h2
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
        className="text-[26px] font-bold leading-tight max-w-xs"
        style={{ 
          color: '#1a1a1a',
          fontFamily: 'var(--tgo-font-display)'
        }}
      >
        {promo.title}
      </motion.h2>

      {/* Copy */}
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 0.8, y: 0 }}
        transition={{ delay: 0.4, duration: 0.4 }}
        className="text-[14px] opacity-80 max-w-xs"
        style={{ 
          color: '#1a1a1a',
          fontFamily: 'var(--tgo-font-body)'
        }}
      >
        {promo.subtitle.replace('{discount}', `${promo.discountPercentage}%`)}
      </motion.p>

      {/* CTA */}
      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.4 }}
        whileTap={{ scale: 0.98 }}
        onClick={onContinue}
        className="w-full h-12 rounded-full flex items-center justify-center gap-2 font-bold text-[14px] transition-all duration-150"
        style={{
          backgroundColor: accentColor,
          color: '#1a1a1a',
          fontFamily: 'var(--tgo-font-body)',
        }}
      >
        {promo.buttonText}
        <ArrowRight size={16} />
      </motion.button>

      {/* Legales */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.5 }}
        transition={{ delay: 0.6, duration: 0.4 }}
        className="text-[11px] opacity-50 text-center"
        style={{ 
          color: '#1a1a1a',
          fontFamily: 'var(--tgo-font-body)'
        }}
      >
        {promo.termsText}
      </motion.p>
    </div>
  )
}
