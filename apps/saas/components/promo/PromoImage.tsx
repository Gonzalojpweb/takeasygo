'use client'

import { cn } from '@/lib/utils'

interface PromoImageProps {
  src?: string
  alt?: string
  className?: string
}

export function PromoImage({ src, alt = '', className }: PromoImageProps) {
  if (!src) return null
  return (
    <div className={cn('relative w-full aspect-[16/9] overflow-hidden bg-muted', className)}>
      <img
        src={src}
        alt={alt}
        className="w-full h-full object-cover"
      />
    </div>
  )
}
