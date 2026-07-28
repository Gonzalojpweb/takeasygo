'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import { ChevronRight } from 'lucide-react'

interface WelcomeStageProps {
  onComplete: () => void
}

const bulletPoints = [
  'Comé mejor.',
  'Movete con precisión.',
  'Viví tu ciudad de una forma más simple e inteligente.',
]

export default function WelcomeStage({ onComplete }: WelcomeStageProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="absolute inset-0 flex flex-col items-center justify-center px-8"
      style={{ backgroundColor: 'var(--tgo-surface-0)' }}
    >
      {/* Logo */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="mb-12"
      >
        <Image
          src="/tgoicon-512.png"
          alt="TGO"
          width={72}
          height={72}
          className="drop-shadow-xl"
          unoptimized
          priority
        />
      </motion.div>

      {/* Title */}
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="text-4xl font-bold tracking-tight mb-4 text-center"
        style={{ color: 'var(--tgo-text-primary)' }}
      >
        Bienvenido.
      </motion.h1>

      {/* Subtitle */}
      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="text-base mb-10 text-center max-w-[300px] leading-relaxed"
        style={{ color: 'var(--tgo-text-muted)' }}
      >
        Descubrí lugares increíbles cerca tuyo.
      </motion.p>

      {/* Bullet points */}
      <div className="flex flex-col gap-3 mb-12 w-full max-w-[300px]">
        {bulletPoints.map((text, i) => (
          <motion.div
            key={text}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              delay: 0.6 + i * 0.15,
              duration: 0.5,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="flex items-center gap-3"
          >
            <div
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: 'var(--tgo-brand-primary)' }}
            />
            <span className="text-sm font-medium" style={{ color: 'var(--tgo-text-primary)' }}>
              {text}
            </span>
          </motion.div>
        ))}
      </div>

      {/* CTA Button */}
      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        whileTap={{ scale: 0.96 }}
        onClick={onComplete}
        className="w-full max-w-[300px] h-14 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm uppercase tracking-widest transition-all duration-150"
        style={{
          backgroundColor: 'var(--tgo-brand-primary)',
          color: 'var(--tgo-card)',
          boxShadow: '0 12px 24px -4px rgba(247, 66, 17, 0.4)',
        }}
      >
        Vamos
        <ChevronRight size={16} />
      </motion.button>
    </motion.div>
  )
}
