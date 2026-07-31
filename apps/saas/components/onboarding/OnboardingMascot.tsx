'use client'

// ── OnboardingMascot ─────────────────────────────────────────────────────────
//
// Pin TGO animado que persiste durante las primeras vistas del onboarding.
// - El pin flota con un bob continuo (como colgando de un hilo)
// - El pin se reposiciona verticalmente entre pasos (parallax sutil)
// - El dot naranja viaja entre posiciones con spring physics
// - Glow pulsante sincronizado con el ritmo del pin
//
// Uso: `<OnboardingMascot step="welcome" />`

import { motion, useAnimationFrame } from 'framer-motion'
import { useRef, useState } from 'react'

type MascotStep = 'welcome' | 'name' | 'age'

interface OnboardingMascotProps {
  step: MascotStep
}

// Pin vertical offset per step (px from default position)
const PIN_OFFSETS: Record<MascotStep, number> = {
  welcome: 0,
  name: 6,
  age: 14,
}

// Dot position inside the SVG viewBox (200x200)
// Bigger range = more noticeable movement
const DOT_POSITIONS: Record<MascotStep, { cx: number; cy: number }> = {
  welcome: { cx: 100, cy: 78 },
  name:    { cx: 100, cy: 68 },  // moves UP — "pay attention to me"
  age:     { cx: 100, cy: 90 },  // moves DOWN — "settle in"
}

export default function OnboardingMascot({ step }: OnboardingMascotProps) {
  const dotTarget = DOT_POSITIONS[step]
  const pinOffset = PIN_OFFSETS[step]
  const bobRef = useRef<HTMLDivElement>(null)
  const [bobPhase, setBobPhase] = useState(0)

  // Continuous bob animation via requestAnimationFrame
  useAnimationFrame((t) => {
    if (!bobRef.current) return
    // Slow, gentle bob — 2.5s period, 3px amplitude
    const y = Math.sin(t / 400) * 3
    bobRef.current.style.transform = `translateX(-50%) translateY(${y}px)`
    setBobPhase(y)
  })

  return (
    <motion.div
      ref={bobRef}
      initial={{ opacity: 0, y: -60, scale: 0.6 }}
      animate={{
        opacity: 1,
        y: pinOffset,
        scale: 1,
      }}
      exit={{ opacity: 0, y: 40, scale: 0.5 }}
      transition={{
        opacity: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
        y: { type: 'spring', stiffness: 120, damping: 14, mass: 0.8 },
        scale: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
      }}
      style={{
        position: 'absolute',
        top: 28,
        left: '50%',
        zIndex: 30,
        width: 56,
        height: 56,
        pointerEvents: 'none',
      }}
    >
      <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
        <defs>
          <linearGradient id="mascotBgGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--tgo-state-trust, #1c1d38)" />
            <stop offset="100%" stopColor="#111225" />
          </linearGradient>
          <filter id="mascotBlur" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>

        {/* Background rect */}
        <rect x="0" y="0" width="200" height="200" rx="46" fill="url(#mascotBgGrad)" />

        {/* Landing shadow — grows when pin is higher */}
        <motion.ellipse
          cx="100"
          cy="155"
          animate={{
            rx: step === 'welcome' ? 22 : step === 'name' ? 18 : 24,
            ry: step === 'welcome' ? 5 : step === 'name' ? 4 : 6,
            opacity: step === 'name' ? 0.15 : 0.25,
          }}
          transition={{ type: 'spring', stiffness: 150, damping: 16 }}
          fill="rgba(0,0,0,0.2)"
        />

        {/* Pin shape */}
        <motion.path
          d="M100,50 C118.5,50 133,64.5 133,83 C133,108 100,150 100,150 C100,150 67,108 67,83 C67,64.5 81.5,50 100,50 Z"
          fill="var(--tgo-card, #f3eee2)"
          animate={{
            y: bobPhase * 0.3,
          }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        />

        {/* Pin hole */}
        <motion.circle
          cx="100"
          cy="80"
          r="14"
          fill="var(--tgo-state-trust, #14152a)"
          animate={{
            y: bobPhase * 0.3,
          }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        />

        {/* Dot glow — pulses with step rhythm */}
        <motion.circle
          r="18"
          fill="var(--tgo-brand-primary, #f74211)"
          filter="url(#mascotBlur)"
          animate={{
            cx: dotTarget.cx,
            cy: dotTarget.cy,
            opacity: [0.2, 0.5, 0.2],
            scale: [0.85, 1.15, 0.85],
          }}
          transition={{
            cx: { type: 'spring', stiffness: 200, damping: 18 },
            cy: { type: 'spring', stiffness: 200, damping: 18 },
            opacity: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
            scale: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
          }}
          style={{ transformOrigin: `${dotTarget.cx}px ${dotTarget.cy}px` }}
        />

        {/* Orange dot — main character */}
        <motion.circle
          r="14"
          fill="var(--tgo-brand-primary, #f74211)"
          animate={{
            cx: dotTarget.cx,
            cy: dotTarget.cy,
          }}
          transition={{
            type: 'spring',
            stiffness: 250,
            damping: 16,
            mass: 0.6,
          }}
        />

        {/* Inner highlight on dot */}
        <motion.circle
          r="5"
          fill="rgba(255,255,255,0.4)"
          animate={{
            cx: dotTarget.cx - 3,
            cy: dotTarget.cy - 3,
          }}
          transition={{
            type: 'spring',
            stiffness: 250,
            damping: 16,
            mass: 0.6,
          }}
        />
      </svg>
    </motion.div>
  )
}

export type { MascotStep }
