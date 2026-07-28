'use client'

import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'

interface NameStageProps {
  value: string
  onChange: (name: string) => void
  onNext: () => void
}

export default function NameStage({ value, onChange, onNext }: NameStageProps) {
  const [localValue, setLocalValue] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 400)
    return () => clearTimeout(timer)
  }, [])

  const handleSubmit = () => {
    onChange(localValue.trim())
    onNext()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && localValue.trim()) {
      handleSubmit()
    }
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
        ¿Cómo preferís que te llamemos?
      </motion.h2>

      {/* Subtitle */}
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="text-sm text-center mb-8"
        style={{ color: 'var(--tgo-text-muted)' }}
      >
        Queremos que esta experiencia se sienta un poco más tuya.
      </motion.p>

      {/* Input */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="w-full max-w-[300px] mb-8"
      >
        <input
          ref={inputRef}
          type="text"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escribí tu nombre"
          maxLength={30}
          className="w-full h-14 rounded-2xl px-5 text-base font-medium outline-none transition-all duration-150"
          style={{
            backgroundColor: 'rgba(255,255,255,0.05)',
            color: 'var(--tgo-text-primary)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'var(--tgo-brand-primary)'
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
          }}
        />
      </motion.div>

      {/* CTA */}
      <motion.button
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        whileTap={{ scale: 0.96 }}
        onClick={handleSubmit}
        disabled={!localValue.trim()}
        className="w-full max-w-[300px] h-14 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm uppercase tracking-widest transition-all duration-150 disabled:opacity-30"
        style={{
          backgroundColor: 'var(--tgo-brand-primary)',
          color: 'var(--tgo-card)',
          boxShadow: localValue.trim() ? '0 12px 24px -4px rgba(247, 66, 17, 0.4)' : 'none',
        }}
      >
        Continuar
        <ChevronRight size={14} />
      </motion.button>
    </motion.div>
  )
}
