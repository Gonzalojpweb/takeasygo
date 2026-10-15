'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface PromoImageProps {
  src?: string
  alt?: string
  className?: string
}

export function PromoImage({ src, alt = '', className }: PromoImageProps) {
  if (!src) return null
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={cn('relative w-full aspect-[16/9] overflow-hidden -mx-8 px-8', className)}
      style={{
        backgroundColor: 'var(--tgo-surface-1, #FAFAF8)',
      }}
    >
      <img
        src={src}
        alt={alt}
        className="w-full h-full object-cover rounded-2xl"
        style={{
          borderRadius: 'var(--tgo-radius-2xl, 24px)',
        }}
      />
    </motion.div>
  )
}
