'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface InfoTooltipProps {
  description: string
  className?: string
}

export default function InfoTooltip({ description, className }: InfoTooltipProps) {
  const [open, setOpen] = useState(false)

  return (
    <span
      className={cn(
        'relative inline-flex items-center justify-center w-3.5 h-3.5 rounded-full',
        'text-[8px] font-bold leading-none cursor-help select-none',
        'bg-muted-foreground/20 text-muted-foreground/60',
        'hover:bg-primary/20 hover:text-primary transition-colors',
        className
      )}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={() => setOpen(prev => !prev)}
      role="tooltip"
      aria-label={description}
    >
      !
      {open && (
        <span
          className={cn(
            'absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5',
            'whitespace-normal text-[10px] leading-tight font-medium',
            'bg-zinc-900 text-white px-2 py-1.5 rounded-lg shadow-xl',
            'w-48 text-center pointer-events-none z-50'
          )}
        >
          {description}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-900" />
        </span>
      )}
    </span>
  )
}
