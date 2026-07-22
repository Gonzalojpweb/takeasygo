'use client'

import { motion } from 'framer-motion'

interface OnboardingProgressProps {
  current: number
  total: number
  accentColor: string
}

export default function OnboardingProgress({
  current,
  total,
  accentColor,
}: OnboardingProgressProps) {
  const progress = ((current + 1) / total) * 100

  return (
    <div className="relative h-[3px] w-full" style={{ backgroundColor: 'var(--tgo-surface-3, #EDEAE6)' }}>
      <motion.div
        className="absolute left-0 top-0 h-full rounded-r-full"
        style={{ backgroundColor: accentColor }}
        animate={{ width: `${progress}%` }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  )
}
