'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'

interface LoadingScreenProps {
  loadingText?: string
}

export default function LoadingScreen({ loadingText = 'Preparando tu experiencia...' }: LoadingScreenProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
      style={{ backgroundColor: 'var(--tgo-surface-0)' }}
    >
      <div className="flex flex-col items-center gap-10">
        {/* Logo Container */}
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="relative"
        >
          {/* Breathing logo */}
          <motion.div
            animate={{ scale: [1, 1.04, 1] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Image
              src="/tgoicon-512.png"
              alt="TGO"
              width={80}
              height={80}
              className="drop-shadow-xl"
              unoptimized
              priority
            />
          </motion.div>

          {/* Gentle glow pulse */}
          <motion.div
            animate={{
              scale: [1, 1.25, 1],
              opacity: [0.1, 0.2, 0.1],
            }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute inset-0 rounded-[24px] -z-10 blur-3xl"
            style={{ backgroundColor: 'rgba(247, 66, 17, 0.3)' }}
          />
        </motion.div>

        {/* Loading text */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="text-sm font-medium tracking-wide"
          style={{ color: 'var(--tgo-text-muted)' }}
        >
          {loadingText}
        </motion.p>

        {/* Shimmer progress line */}
        <div className="w-28 h-[2px] rounded-full overflow-hidden relative" style={{ backgroundColor: 'var(--tgo-surface-1)' }}>
          <motion.div
            animate={{ x: ['-100%', '400%'] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute inset-0 w-1/3 bg-gradient-to-r from-transparent via-orange-500/70 to-transparent"
          />
        </div>
      </div>
    </motion.div>
  )
}
