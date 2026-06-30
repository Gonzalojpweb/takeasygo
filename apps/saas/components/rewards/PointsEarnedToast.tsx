'use client'

import { NumberTicker } from '@/components/ui/number-ticker'
import { motion } from 'framer-motion'

interface Props {
  pointsEarned: number
  totalPoints: number
  progressToNext?: number
  clubName?: string
}

export default function PointsEarnedToast({ pointsEarned, totalPoints, progressToNext, clubName }: Props) {
  const progress = Math.min(progressToNext ?? 100, 100)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">✨</span>
        <span className="text-sm font-bold">
          Sumaste{' '}
          <span className="text-emerald-600">
            +<NumberTicker value={pointsEarned} />
          </span>{' '}
          puntos
        </span>
      </div>
      <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-500"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
      <p className="text-xs text-zinc-500">
        {totalPoints} pts totales
        {clubName && ` en ${clubName}`}
        {progress >= 100 ? ' — ¡Podés canjear!' : ` — ${100 - Math.round(progress)}% para tu próximo canje`}
      </p>
    </div>
  )
}
