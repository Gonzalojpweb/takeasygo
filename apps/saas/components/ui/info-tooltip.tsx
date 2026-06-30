'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

interface InfoTooltipProps {
  description: string
  className?: string
}

export default function InfoTooltip({ description, className }: InfoTooltipProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0, above: true })

  useEffect(() => {
    if (!open || !triggerRef.current) return

    const update = () => {
      const rect = triggerRef.current!.getBoundingClientRect()
      const tooltipW = 192
      const tooltipH = 80
      const gap = 6

      const above = rect.top > tooltipH + gap + 16
      let left = rect.left + rect.width / 2 - tooltipW / 2
      if (left < 8) left = 8
      if (left + tooltipW > window.innerWidth - 8) left = window.innerWidth - tooltipW - 8

      setPos({
        top: above ? rect.top - gap : rect.bottom + gap,
        left,
        above,
      })
    }

    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open])

  return (
    <>
      <span
        ref={triggerRef}
        className={cn(
          'inline-flex items-center justify-center w-3.5 h-3.5 rounded-full',
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
      </span>
      {open && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="relative whitespace-normal text-[10px] leading-tight font-medium bg-zinc-900 text-white px-2.5 py-2 rounded-lg shadow-2xl w-48 text-center">
            {description}
            <span
              className={cn(
                'absolute left-1/2 -translate-x-1/2 border-4 border-transparent',
                pos.above
                  ? 'top-full border-t-zinc-900'
                  : 'bottom-full border-b-zinc-900'
              )}
            />
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
