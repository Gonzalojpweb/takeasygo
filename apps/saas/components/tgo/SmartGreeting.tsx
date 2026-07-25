'use client'

// ── SmartGreeting ─────────────────────────────────────────────────────────────
//
// Componente vivo que rota frases contextuales de saludo.
//
// Responsabilidades:
//   1. Detectar período del día (mañana/tarde/noche)
//   2. Rotar frases contextuales cada ~10s
//   3. Animar transiciones entre frases (fade + slide)
//
// Dependencias:
//   - framer-motion (ya en el proyecto)
//   - tokens --tgo-* (ya en globals.css)
//
// Uso:
//   <SmartGreeting userName="Gonzalo" />
//   <SmartGreeting userName="Gonzalo" phrases={['Solo mostrar estas frases']} />
//   <SmartGreeting userName="Gonzalo" interval={15000} />

import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SmartGreetingProps {
  /** Nombre del usuario (primera palabra) */
  userName?: string
  /** Frases personalizadas. Si no se provee, usa frases contextuales por defecto */
  phrases?: string[]
  /** Intervalo en ms entre rotaciones. Default: 10000 */
  interval?: number
  /** Si true, no rota (muestra solo la primera frase). Default: false */
  static?: boolean
}

// ── Período del día ──────────────────────────────────────────────────────────

type DayPeriod = 'morning' | 'afternoon' | 'night'

function getDayPeriod(): DayPeriod {
  const hour = new Date().getHours()
  if (hour >= 6 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 19) return 'afternoon'
  return 'night'
}

function getPeriodLabel(period: DayPeriod): string {
  switch (period) {
    case 'morning': return 'Buenos días'
    case 'afternoon': return 'Buenas tardes'
    case 'night': return 'Buenas noches'
  }
}

// ── Frases contextuales por defecto ──────────────────────────────────────────

const CONTEXTUAL_PHRASES: Record<DayPeriod, string[]> = {
  morning: [
    'Ideal para arrancar el día con algo rico.',
    'Hay lugares abiertos cerca tuyo.',
    'Desayuná tranquilo, la ciudad se está despertando.',
    'Temprano hay poca espera en los cafés.',
  ],
  afternoon: [
    'La ciudad está movida hoy.',
    'Hay opciones para almorzar cerca.',
    'Poca espera para almorzar en tu zona.',
    'Ideal para salir a merendar después.',
  ],
  night: [
    'La ciudad sigue viva esta noche.',
    'Hay lugares abiertos cerca tuyo.',
    'Para esta noche, opciones que te van a gustar.',
    'Merendar o cenar, la ciudad te espera.',
  ],
}

// ── Animación ─────────────────────────────────────────────────────────────────

const variants = {
  enter: { opacity: 0, y: 6 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function SmartGreeting({
  userName,
  phrases,
  interval = 10000,
  static: isStatic = false,
}: SmartGreetingProps) {
  const period = getDayPeriod()
  const periodLabel = getPeriodLabel(period)

  // Frases a rotar: las provistas o las contextuales del período
  const availablePhrases = useMemo(() => {
    if (phrases && phrases.length > 0) return phrases
    return CONTEXTUAL_PHRASES[period]
  }, [phrases, period])

  const [phraseIndex, setPhraseIndex] = useState(0)

  // Rotación de frases
  useEffect(() => {
    if (isStatic || availablePhrases.length <= 1) return

    const timer = setInterval(() => {
      setPhraseIndex((prev) => (prev + 1) % availablePhrases.length)
    }, interval)

    return () => clearInterval(timer)
  }, [isStatic, availablePhrases.length, interval])

  const currentPhrase = availablePhrases[phraseIndex] ?? availablePhrases[0]

  return (
    <div style={{ minWidth: 0 }}>
      {/* Saludo principal */}
      <h1
        style={{
          fontSize: 'var(--tgo-type-title)',
          fontWeight: 700,
          color: 'var(--tgo-text-primary)',
          letterSpacing: 'var(--tgo-tracking-tight)',
          lineHeight: 1.3,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {periodLabel}, {userName ?? ''}
      </h1>

      {/* Frase contextual animada */}
      <div style={{ marginTop: 2, height: '1.4em', overflow: 'hidden' }}>
        <AnimatePresence mode="wait">
          <motion.p
            key={currentPhrase}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              duration: 0.3,
              ease: [0.25, 0.1, 0.25, 1],
            }}
            style={{
              fontSize: 'var(--tgo-type-body-sm)',
              color: 'var(--tgo-text-secondary)',
              lineHeight: 1.4,
            }}
          >
            {currentPhrase}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  )
}
