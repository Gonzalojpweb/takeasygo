'use client'

import { Heart } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LikeBadgeProps {
  count: number
  /** 'overlay' = absolute positioned on image (grid layout), 'inline' = next to text (list layout) */
  variant?: 'overlay' | 'inline'
  className?: string
}

export default function LikeBadge({ count, variant = 'inline', className }: LikeBadgeProps) {
  if (!count || count <= 0) return null

  if (variant === 'overlay') {
    return (
      <div className={cn(
        'absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/90 backdrop-blur-sm shadow-sm z-10',
        className
      )}>
        <Heart size={11} className="text-red-500 fill-red-500" />
        <span className="text-[10px] font-bold text-foreground tabular-nums">{count}</span>
      </div>
    )
  }

  return (
    <span className={cn('inline-flex items-center gap-0.5 text-[10px] font-bold text-red-500 tabular-nums', className)}>
      <Heart size={10} className="fill-red-500" />
      {count}
    </span>
  )
}
