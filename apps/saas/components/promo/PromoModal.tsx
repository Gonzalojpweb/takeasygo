'use client'

import { type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PromoModalProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  className?: string
}

export function PromoModal({ open, onClose, children, className }: PromoModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 380 }}
            className={cn(
              'relative w-full sm:max-w-lg bg-white dark:bg-neutral-900 shadow-2xl',
              'rounded-t-2xl sm:rounded-2xl',
              'max-h-[85dvh] sm:max-h-[90vh]',
              'overflow-y-auto flex flex-col',
              className
            )}
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-10 rounded-full p-1.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors bg-white/80 dark:bg-neutral-800/80 backdrop-blur-sm"
              aria-label="Cerrar"
            >
              <X size={16} strokeWidth={2.5} />
            </button>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
