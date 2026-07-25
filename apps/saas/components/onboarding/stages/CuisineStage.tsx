'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronRight, Check } from 'lucide-react'
import { CUISINE_OPTIONS } from '../constants'

interface CuisineStageProps {
  value: string[]
  onChange: (cuisines: string[]) => void
  onNext: () => void
}

const MAX_SELECT = 5

export default function CuisineStage({ value, onChange, onNext }: CuisineStageProps) {
  const [selected, setSelected] = useState<string[]>(value)

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) {
        return prev.filter((c) => c !== id)
      }
      if (prev.length >= MAX_SELECT) return prev
      return [...prev, id]
    })
  }

  const handleSubmit = () => {
    onChange(selected)
    onNext()
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="absolute inset-0 flex flex-col px-8 pt-6"
    >
      {/* Title */}
      <motion.h2
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.5 }}
        className="text-2xl font-bold tracking-tight mb-2 text-center"
        style={{ color: 'var(--tgo-text-primary)' }}
      >
        ¿Qué te gusta comer?
      </motion.h2>

      {/* Counter */}
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="text-sm text-center mb-6"
        style={{ color: 'var(--tgo-text-muted)' }}
      >
        Elegí hasta {MAX_SELECT}.{' '}
        <span style={{ color: selected.length > 0           ? 'var(--tgo-brand-primary)' : 'var(--tgo-surface-3)' }}>
          {selected.length}/{MAX_SELECT}
        </span>
      </motion.p>

      {/* Grid */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25, duration: 0.5 }}
        className="flex-1 overflow-y-auto pb-4 no-scrollbar"
      >
        <div className="grid grid-cols-3 gap-2">
          {CUISINE_OPTIONS.map((cuisine, i) => {
            const isSelected = selected.includes(cuisine.id)
            return (
              <motion.button
                key={cuisine.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 + Math.min(i * 0.03, 0.4), duration: 0.3 }}
                whileTap={{ scale: 0.93 }}
                onClick={() => toggle(cuisine.id)}
                className="relative h-[72px] rounded-xl flex flex-col items-center justify-center gap-1 transition-all duration-150"
                style={{
                  backgroundColor: isSelected
                    ? 'rgba(247, 66, 17, 0.1)'
                    : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isSelected ? 'rgba(247, 66, 17, 0.3)' : 'rgba(255,255,255,0.06)'}`,
                }}
              >
                {/* Check badge */}
                {isSelected && (
                  <div
                    className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: 'var(--tgo-brand-primary)' }}
                  >
                    <Check size={10} color="var(--tgo-text-on-accent)" strokeWidth={3} />
                  </div>
                )}
                <span className="text-xl">{cuisine.emoji}</span>
                <span
                  className="text-[10px] font-medium leading-tight text-center px-1"
                  style={{ color: isSelected ? 'var(--tgo-brand-primary)' : 'var(--tgo-text-muted)' }}
                >
                  {cuisine.label}
                </span>
              </motion.button>
            )
          })}
        </div>
      </motion.div>

      {/* CTA */}
      <motion.button
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        whileTap={{ scale: 0.96 }}
        onClick={handleSubmit}
        disabled={selected.length === 0}
        className="w-full h-14 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm uppercase tracking-widest transition-all duration-150 disabled:opacity-30"
        style={{
          backgroundColor: 'var(--tgo-brand-primary)',
          color: 'var(--tgo-surface-card)',
          boxShadow: selected.length > 0 ? '0 12px 24px -4px rgba(247, 66, 17, 0.4)' : 'none',
        }}
      >
        Continuar
        <ChevronRight size={14} />
      </motion.button>
    </motion.div>
  )
}
