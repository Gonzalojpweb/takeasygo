'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'

export default function LoadingScreen() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#0d0b0a]"
    >
      <div className="flex flex-col items-center gap-12">
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
            className="absolute inset-0 bg-orange-500 rounded-[24px] -z-10 blur-3xl"
          />
        </motion.div>

        {/* Shimmer progress line */}
        <div className="w-28 h-[2px] bg-zinc-800 rounded-full overflow-hidden relative">
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
