'use client'

import { motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'

interface GreetingStageProps {
  userName: string
  onComplete: () => void
}

export default function GreetingStage({ userName, onComplete }: GreetingStageProps) {
  const displayName = userName?.split(' ')[0] || ''

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="absolute inset-0 flex flex-col items-center justify-center px-8"
      style={{ backgroundColor: '#0d0b0a' }}
    >
      {/* Wave emoji */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.5, type: 'spring', bounce: 0.4 }}
        className="text-5xl mb-8"
      >
        👋
      </motion.div>

      {/* Greeting */}
      <motion.h2
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="text-3xl font-bold tracking-tight mb-2 text-center"
        style={{ color: '#F7F4F2' }}
      >
        Hola, {displayName}
      </motion.h2>

      {/* Message */}
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55, duration: 0.5 }}
        className="text-base text-center leading-relaxed max-w-[280px]"
        style={{ color: '#A09A95' }}
      >
        Qué bueno tenerte con nosotros.
      </motion.p>

      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7, duration: 0.5 }}
        className="text-sm text-center leading-relaxed max-w-[280px] mt-3"
        style={{ color: '#6B6560' }}
      >
        A partir de ahora vamos a ayudarte a descubrir lugares increíbles cerca tuyo.
      </motion.p>

      {/* CTA */}
      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: 0.5 }}
        whileTap={{ scale: 0.96 }}
        onClick={onComplete}
        className="mt-12 w-full max-w-[300px] h-14 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm uppercase tracking-widest transition-all duration-150"
        style={{
          backgroundColor: '#F74211',
          color: '#FFFFFF',
          boxShadow: '0 12px 24px -4px rgba(247, 66, 17, 0.4)',
        }}
      >
        Continuar
        <ChevronRight size={14} />
      </motion.button>
    </motion.div>
  )
}
