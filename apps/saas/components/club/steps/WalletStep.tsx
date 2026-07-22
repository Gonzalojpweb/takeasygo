'use client'

import { motion } from 'framer-motion'
import { Wallet, ChevronRight } from 'lucide-react'

interface WalletStepProps {
  accentColor: string
  ctaText?: string
  onNext: () => void
}

export default function WalletStep({ accentColor, ctaText, onNext }: WalletStepProps) {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-2">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="mb-8"
      >
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: `${accentColor}10` }}
        >
          <Wallet size={40} style={{ color: accentColor }} />
        </div>
      </motion.div>

      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="text-2xl font-bold tracking-tight mb-3 text-center"
        style={{ fontFamily: 'var(--tgo-type-section)', color: 'var(--tgo-text-primary, #1A1A1A)' }}
      >
        Todo vive en tu Wallet
      </motion.h2>

      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="text-base text-center mb-10 leading-relaxed max-w-[300px]"
        style={{ color: 'var(--tgo-text-secondary, #6B6560)', fontFamily: 'var(--tgo-type-body)' }}
      >
        Tus puntos, tus canjes y tus beneficios, siempre a mano.
      </motion.p>

      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        whileTap={{ scale: 0.96 }}
        onClick={onNext}
        className="w-full h-14 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm uppercase tracking-widest transition-all duration-150"
        style={{
          backgroundColor: accentColor,
          color: '#FFFFFF',
          boxShadow: `0 12px 24px -4px ${accentColor}66`,
        }}
      >
        {ctaText || 'Unirme al Club'}
        <ChevronRight size={16} />
      </motion.button>
    </div>
  )
}
