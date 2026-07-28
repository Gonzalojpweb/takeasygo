'use client'

import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'

interface AgeStageProps {
  value: number | null
  onChange: (age: number) => void
  onNext: () => void
}

const AGE_RANGE = Array.from({ length: 65 }, (_, i) => i + 16) // 16-80

export default function AgeStage({ value, onChange, onNext }: AgeStageProps) {
  const [localValue, setLocalValue] = useState(value || 25)
  const wheelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (wheelRef.current) {
      const index = localValue - 16
      const itemHeight = 44
      wheelRef.current.scrollTop = index * itemHeight
    }
  }, [])

  const handleScroll = () => {
    if (!wheelRef.current) return
    const scrollTop = wheelRef.current.scrollTop
    const itemHeight = 44
    const index = Math.round(scrollTop / itemHeight)
    const newAge = AGE_RANGE[Math.max(0, Math.min(index, AGE_RANGE.length - 1))]
    setLocalValue(newAge)
  }

  const handleSubmit = () => {
    onChange(localValue)
    onNext()
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="absolute inset-0 flex flex-col items-center justify-center px-8"
    >
      {/* Title */}
      <motion.h2
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.5 }}
        className="text-2xl font-bold tracking-tight mb-2 text-center"
        style={{ color: 'var(--tgo-text-primary)' }}
      >
        ¿Cuántos años tenés?
      </motion.h2>

      {/* Subtitle */}
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="text-sm text-center mb-6"
        style={{ color: 'var(--tgo-text-muted)' }}
      >
        La edad nos ayuda a recomendar experiencias más relevantes para vos.
      </motion.p>

      {/* Wheel picker */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="relative w-full max-w-[200px] h-[132px] mb-8 overflow-hidden rounded-2xl"
        style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
      >
        {/* Selection indicator */}
        <div
          className="absolute top-1/2 left-2 right-2 h-[44px] -translate-y-1/2 rounded-xl pointer-events-none z-10"
          style={{
            backgroundColor: 'rgba(247, 66, 17, 0.08)',
            border: '1px solid rgba(247, 66, 17, 0.2)',
          }}
        />

        {/* Gradient masks */}
        <div
          className="absolute top-0 left-0 right-0 h-12 pointer-events-none z-20"
          style={{
            background: 'linear-gradient(to bottom, var(--tgo-surface-0), transparent)',
          }}
        />
        <div
          className="absolute bottom-0 left-0 right-0 h-12 pointer-events-none z-20"
          style={{
            background: 'linear-gradient(to top, var(--tgo-surface-0), transparent)',
          }}
        />

        {/* Scrollable list */}
        <div
          ref={wheelRef}
          onScroll={handleScroll}
          className="absolute inset-0 overflow-y-scroll snap-y snap-mandatory no-scrollbar"
          style={{ scrollBehavior: 'smooth' }}
        >
          {/* Spacer for centering */}
          <div className="h-[44px]" />
          {AGE_RANGE.map((age) => (
            <div
              key={age}
              className="h-[44px] flex items-center justify-center snap-center"
            >
              <span
                className="text-2xl font-bold transition-all duration-150"
                style={{
                  color: age === localValue ? 'var(--tgo-brand-primary)' : 'var(--tgo-surface-3)',
                }}
              >
                {age}
              </span>
            </div>
          ))}
          {/* Spacer for centering */}
          <div className="h-[44px]" />
        </div>
      </motion.div>

      {/* CTA */}
      <motion.button
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        whileTap={{ scale: 0.96 }}
        onClick={handleSubmit}
        className="w-full max-w-[300px] h-14 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm uppercase tracking-widest transition-all duration-150"
        style={{
          backgroundColor: 'var(--tgo-brand-primary)',
          color: 'var(--tgo-card)',
          boxShadow: '0 12px 24px -4px rgba(247, 66, 17, 0.4)',
        }}
      >
        Continuar
        <ChevronRight size={14} />
      </motion.button>
    </motion.div>
  )
}
