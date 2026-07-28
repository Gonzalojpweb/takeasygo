'use client'

import { motion } from 'framer-motion'
import { ChevronRight, Shield } from 'lucide-react'

interface PrivacyStageProps {
  onNext: () => void
}

export default function PrivacyStage({ onNext }: PrivacyStageProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="absolute inset-0 flex flex-col items-center justify-center px-8"
    >
      {/* Shield icon */}
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: 0.1, duration: 0.5, type: 'spring', bounce: 0.4 }}
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-8"
        style={{ backgroundColor: 'rgba(22, 163, 74, 0.1)' }}
      >
        <Shield size={28} color="#12B76A" />
      </motion.div>

      {/* Title */}
      <motion.h2
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="text-2xl font-bold tracking-tight mb-6 text-center"
        style={{ color: 'var(--tgo-text-primary)' }}
      >
        Tus datos son tuyos.
      </motion.h2>

      {/* Privacy text */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="max-w-[300px] mb-10"
      >
        <p
          className="text-sm leading-relaxed text-center mb-4"
          style={{ color: 'var(--tgo-text-muted)' }}
        >
          Solo utilizamos esta información para ofrecerte mejores recomendaciones y una experiencia más personalizada.
        </p>
        <p
          className="text-sm leading-relaxed text-center"
          style={{ color: 'var(--tgo-text-muted)' }}
        >
          Nunca comercializamos tus datos personales ni compartimos información privada con terceros sin tu consentimiento.
        </p>
      </motion.div>

      {/* Trust line */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        className="text-xs text-center mb-10 italic"
        style={{ color: 'var(--tgo-surface-3)' }}
      >
        Porque la confianza también forma parte de una buena experiencia.
      </motion.p>

      {/* CTA */}
      <motion.button
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.5 }}
        whileTap={{ scale: 0.96 }}
        onClick={onNext}
        className="w-full max-w-[300px] h-14 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm uppercase tracking-widest transition-all duration-150"
        style={{
          backgroundColor: 'var(--tgo-brand-primary)',
          color: 'var(--tgo-card)',
          boxShadow: '0 12px 24px -4px rgba(247, 66, 17, 0.4)',
        }}
      >
        Entendido
        <ChevronRight size={14} />
      </motion.button>
    </motion.div>
  )
}
