'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronRight, MapPin } from 'lucide-react'
import { BARRIOS_CABA } from '../constants'

interface ZoneStageProps {
  value: string
  onChange: (zone: string) => void
  onNext: () => void
}

export default function ZoneStage({ value, onChange, onNext }: ZoneStageProps) {
  const [selected, setSelected] = useState(value)
  const [useLocation, setUseLocation] = useState(false)

  const handleSelect = (barrio: string) => {
    setSelected(barrio)
    setUseLocation(false)
  }

  const handleUseLocation = () => {
    setUseLocation(true)
    setSelected('')
  }

  const handleSubmit = () => {
    onChange(useLocation ? 'ubicacion_actual' : selected)
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
        ¿En qué zona te movés habitualmente?
      </motion.h2>

      {/* Subtitle */}
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="text-sm text-center mb-6"
        style={{ color: 'var(--tgo-text-muted)' }}
      >
        Así podemos mostrarte primero los lugares que realmente tenés cerca.
      </motion.p>

      {/* Use location button */}
      <motion.button
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.4 }}
        whileTap={{ scale: 0.97 }}
        onClick={handleUseLocation}
        className="w-full h-12 rounded-xl flex items-center justify-center gap-2 font-medium text-sm mb-4 transition-all duration-150"
        style={{
          backgroundColor: useLocation ? 'rgba(247, 66, 17, 0.1)' : 'var(--tgo-card)',
          color: useLocation ? 'var(--tgo-brand-primary)' : 'var(--tgo-text-muted)',
          border: `1px solid ${useLocation ? 'rgba(247, 66, 17, 0.3)' : 'var(--tgo-border)'}`,
        }}
      >
        <MapPin size={16} />
        Usar mi ubicación actual
      </motion.button>

      {/* Divider */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-px" style={{ backgroundColor: 'var(--tgo-border)' }} />
        <span className="text-xs" style={{ color: 'var(--tgo-surface-3)' }}>o elegí tu barrio</span>
        <div className="flex-1 h-px" style={{ backgroundColor: 'var(--tgo-border)' }} />
      </div>

      {/* Barrios grid */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="flex-1 overflow-y-auto pb-4 no-scrollbar"
      >
        <div className="grid grid-cols-2 gap-2">
          {BARRIOS_CABA.map((barrio, i) => (
            <motion.button
              key={barrio}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 + Math.min(i * 0.02, 0.5), duration: 0.3 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleSelect(barrio)}
              className="h-10 rounded-xl px-3 text-xs font-medium text-left transition-all duration-150 truncate"
              style={{
                backgroundColor:
                  selected === barrio
                    ? 'rgba(247, 66, 17, 0.1)'
                    : 'var(--tgo-card)',
                color: selected === barrio ? 'var(--tgo-brand-primary)' : 'var(--tgo-text-muted)',
                border: `1px solid ${selected === barrio ? 'rgba(247, 66, 17, 0.3)' : 'var(--tgo-border)'}`,
              }}
            >
              {barrio}
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* Privacy note */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.4 }}
        className="text-[11px] text-center mb-4 leading-relaxed"
        style={{ color: 'var(--tgo-surface-3)' }}
      >
        Tu ubicación nunca se comparte con los establecimientos.
      </motion.p>

      {/* CTA */}
      <motion.button
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        whileTap={{ scale: 0.96 }}
        onClick={handleSubmit}
        disabled={!selected && !useLocation}
        className="w-full h-14 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm uppercase tracking-widest transition-all duration-150 disabled:opacity-30"
        style={{
          backgroundColor: 'var(--tgo-brand-primary)',
          color: 'var(--tgo-card)',
          boxShadow: selected || useLocation ? '0 12px 24px -4px rgba(247, 66, 17, 0.4)' : 'none',
        }}
      >
        Continuar
        <ChevronRight size={14} />
      </motion.button>
    </motion.div>
  )
}
