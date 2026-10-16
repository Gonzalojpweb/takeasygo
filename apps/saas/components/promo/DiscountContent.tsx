'use client'

import { motion } from 'framer-motion'
import { Info, ArrowRight } from 'lucide-react'
import type { QrPromoData } from './types'

interface DiscountContentProps {
  promo: QrPromoData
  onContinue: () => void
  accentColor?: string
}

export function DiscountContent({ promo, onContinue, accentColor = '#F74211' }: DiscountContentProps) {
  return (
    <div className="flex flex-col items-center gap-6 px-6 py-8 text-center">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.5 }}
        className="flex flex-wrap items-center justify-center gap-3"
      >
        <span
          className="text-[10px] font-black uppercase tracking-[0.1em] px-3 py-1 rounded-full"
          style={{
            backgroundColor: `${accentColor}10`,
            color: accentColor,
          }}
        >
          DISFRUTÁ
        </span>
        <span className="text-[20px] font-black text-white bg-emerald-500 p-2 rounded-full">
          {promo.discountPercentage}% OFF
        </span>
      </motion.div>

      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="text-xl font-bold leading-relaxed max-w-md"
        style={{
          color: 'var(--tgo-text-secondary, #6B6560)',
          fontFamily: 'var(--tgo-type-body)',
        }}
      >
        {promo.subtitle.replace('{discount}', `${promo.discountPercentage}%`)}
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="flex gap-3 items-start rounded-2xl w-full max-w-[80%] text-left"
        style={{
          backgroundColor: 'var(--tgo-surface-1, #FAFAF8)',
          border: `1px solid ${accentColor}30`,
        }}
      >
        <Info size={18} className="flex-shrink-0" style={{ color: accentColor }} />
        <div>
          <p
            className="text-xs font-semibold"
            style={{ color: 'var(--tgo-text-primary, #1A1A1A)', fontFamily: 'var(--tgo-type-body-sm)' }}
          >
            {promo.takeawayWarningTitle || 'Exclusivo para takeaway'}
          </p>
          <p
            className="text-[11px] mt-1 leading-normal"
            style={{ color: 'var(--tgo-text-secondary, #6B6560)', fontFamily: 'var(--tgo-type-body-sm)' }}
          >
            {promo.takeawayWarningText || 'Válido solo para pedidos para llevar.'}
          </p>
        </div>
      </motion.div>

      <motion.button
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
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
