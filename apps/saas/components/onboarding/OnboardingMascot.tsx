'use client'

// ── OnboardingMascot ─────────────────────────────────────────────────────────
//
// Pin TGO miniaturizado que persiste durante las primeras vistas del onboarding.
// El dot naranja se anima entre posiciones según el paso actual.
//
// Uso: `<OnboardingMascot step="welcome" />`

import { motion } from 'framer-motion'

type MascotStep = 'welcome' | 'name' | 'age'

interface OnboardingMascotProps {
  step: MascotStep
}

const DOT_POSITIONS: Record<MascotStep, { cx: number; cy: number }> = {
  welcome: { cx: 100, cy: 80 },   // center of pin hole
  name:    { cx: 100, cy: 74 },   // slightly above center
  age:     { cx: 100, cy: 86 },   // slightly below center
}

export default function OnboardingMascot({ step }: OnboardingMascotProps) {
  const dotTarget = DOT_POSITIONS[step]

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20, scale: 0.8 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: 'absolute',
        top: 36,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 30,
        width: 48,
        height: 48,
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

        {/* Landing shadow */}
        <ellipse cx="100" cy="152" rx="20" ry="5" fill="rgba(0,0,0,0.2)" />

        {/* Pin shape */}
        <path
          d="M100,50 C118.5,50 133,64.5 133,83 C133,108 100,150 100,150 C100,150 67,108 67,83 C67,64.5 81.5,50 100,50 Z"
          fill="var(--tgo-card, #f3eee2)"
        />

        {/* Pin hole */}
        <circle cx="100" cy="80" r="14" fill="var(--tgo-state-trust, #14152a)" />

        {/* Dot glow */}
        <motion.circle
          cx={dotTarget.cx}
          cy={dotTarget.cy}
          r="18"
          fill="var(--tgo-brand-primary, #f74211)"
          filter="url(#mascotBlur)"
          animate={{ opacity: [0.3, 0.5, 0.3], scale: [0.9, 1.1, 0.9] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          style={{ transformOrigin: `${dotTarget.cx}px ${dotTarget.cy}px` }}
        />

        {/* Orange dot */}
        <motion.circle
          animate={{
            cx: dotTarget.cx,
            cy: dotTarget.cy,
          }}
          transition={{
            type: 'spring',
            stiffness: 300,
            damping: 20,
          }}
          cx={dotTarget.cx}
          cy={dotTarget.cy}
          r="14"
          fill="var(--tgo-brand-primary, #f74211)"
        />
      </svg>
    </motion.div>
  )
}

export type { MascotStep }
