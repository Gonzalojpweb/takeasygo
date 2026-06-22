'use client'

import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PulsatingButtonProps {
  children: ReactNode
  className?: string
  color?: string
}

export function PulsatingButton({ children, className, color }: PulsatingButtonProps) {
  return (
    <button
      className={cn(
        'relative inline-flex items-center justify-center rounded-full px-6 py-3 font-semibold text-white transition-all',
        'bg-zinc-900 dark:bg-white dark:text-zinc-900',
        'before:content-[""] before:absolute before:inset-0 before:rounded-full before:border-2 before:border-zinc-900/40 dark:before:border-white/40 before:animate-[pulse-ring_1.5s_cubic-bezier(0.24,0,0.38,1)_infinite]',
        'after:content-[""] after:absolute after:inset-0 after:rounded-full after:border-2 after:border-zinc-900/40 dark:after:border-white/40 after:animate-[pulse-ring_1.5s_cubic-bezier(0.24,0,0.38,1)_infinite] after:animation-delay-750',
        className
      )}
      style={color ? { backgroundColor: color, borderColor: color } : undefined}
    >
      {children}
    </button>
  )
}
