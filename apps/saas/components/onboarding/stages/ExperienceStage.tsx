'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronRight, Check } from 'lucide-react'
import { EXPERIENCE_OPTIONS } from '../constants'

interface ExperienceStageProps {
  value: string[]
  onChange: (experiences: string[]) => void
  onNext: () => void
}

export default function ExperienceStage({ value, onChange, onNext }: ExperienceStageProps) {
  const [selected, setSelected] = useState<string[]>(value)

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) {
        return prev.filter((e) => e !== id)
      }
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
        ¿Qué experiencias disfrutás más?
      </motion.h2>

      {/* Subtitle */}
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="text-sm text-center mb-6"
        style={{ color: 'var(--tgo-text-muted)' }}
      >
        No preguntamos solo comida. Preguntamos experiencias.
      </motion.p>

      {/* List */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25, duration: 0.5 }}
        className="flex-1 overflow-y-auto pb-4 no-scrollbar"
      >
        <div className="flex flex-col gap-2">
          {EXPERIENCE_OPTIONS.map((exp, i) => {
            const isSelected = selected.includes(exp.id)
            return (
              <motion.button
                key={exp.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + Math.min(i * 0.04, 0.5), duration: 0.3 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => toggle(exp.id)}
                className="h-12 rounded-xl px-4 flex items-center justify-between transition-all duration-150"
                style={{
                  backgroundColor: isSelected
                    ? 'rgba(247, 66, 17, 0.1)'
                    : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isSelected ? 'rgba(247, 66, 17, 0.3)' : 'rgba(255,255,255,0.06)'}`,
                }}
              >
                <span
                  className="text-sm font-medium"
                  style={{ color: isSelected ? 'var(--tgo-brand-primary)' : 'var(--tgo-text-muted)' }}
                >
                  {exp.label}
                </span>
                {isSelected && (
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: 'var(--tgo-brand-primary)' }}
                  >
                    <Check size={12} color="var(--tgo-text-on-accent)" strokeWidth={3} />
                  </div>
                )}
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
        className="w-full h-14 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm uppercase tracking-widest transition-all duration-150"
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
