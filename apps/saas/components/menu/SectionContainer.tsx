'use client'

import { cn } from '@/lib/utils'

interface SectionContainerProps {
  children: React.ReactNode
  variant?: 'default' | 'club'
  className?: string
  primaryColor?: string
  sectionContainerColor?: string
}

export function SectionContainer({ children, variant = 'default', className = '', primaryColor, sectionContainerColor }: SectionContainerProps) {
  // Usar sectionContainerColor si está definido, si no usar primaryColor (para club) o default (para default)
  const containerStyle = variant === 'club'
    ? { backgroundColor: (sectionContainerColor || primaryColor) + '0D' }
    : variant === 'default' && sectionContainerColor
      ? { backgroundColor: sectionContainerColor }
      : undefined

  return (
    <section
      className={cn(
        // Base styles - rounded-3xl (24px), mx-4 (16px), my-6 (24px), p-4
        'rounded-3xl mx-4 my-6 p-4',
        // Variant-specific styles (default usa bg-neutral-50 solo si no hay sectionContainerColor)
        variant === 'default' && !sectionContainerColor && 'bg-neutral-50',
        className
      )}
      style={containerStyle}
    >
      {children}
    </section>
  )
}
