'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

interface FieldHintProps {
  description: string
  className?: string
}

export function FieldHint({ description, className }: FieldHintProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0, above: true })

  useEffect(() => {
    if (!open || !triggerRef.current) return

    const update = () => {
      const rect = triggerRef.current!.getBoundingClientRect()
      const tooltipW = 224
      const tooltipH = 100
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
          'inline-flex items-center justify-center w-4 h-4 rounded-full',
          'text-[10px] font-bold leading-none cursor-help select-none',
          'bg-muted-foreground/20 text-muted-foreground/60',
          'hover:bg-primary/20 hover:text-primary transition-colors flex-shrink-0',
          className
        )}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen(prev => !prev)}
        role="tooltip"
        aria-label={description}
      >
        ?
      </span>
      {open && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="relative whitespace-normal text-[11px] leading-relaxed font-medium bg-zinc-900 text-white px-3 py-2.5 rounded-lg shadow-2xl w-56 text-left">
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

interface SectionTipProps {
  icon?: string
  type?: 'tip' | 'warn' | 'metric'
  children: React.ReactNode
  className?: string
}

export function SectionTip({ icon, type = 'tip', children, className }: SectionTipProps) {
  const styleMap = {
    tip: 'bg-blue-50 border-blue-200 text-blue-800',
    warn: 'bg-amber-50 border-amber-200 text-amber-800',
    metric: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  }
  const iconMap = { tip: '💡', warn: '⚠️', metric: '📊' }

  return (
    <div className={cn(
      'rounded-xl border px-4 py-3 text-[11px] leading-relaxed font-medium',
      styleMap[type],
      className
    )}>
      <span className="mr-1.5">{icon || iconMap[type]}</span>
      {children}
    </div>
  )
}

interface BannerContextProps {
  module: 'club' | 'go-plus' | 'wallet' | 'tienda'
  helpUrl?: string
  className?: string
}

const BANNER_CONTENT: Record<string, { title: string; desc: string; helpLabel: string }> = {
  club: {
    title: 'Club de Fidelización',
    desc: 'Identificá a tus clientes recurrentes y premialos. Cada miembro acumula puntos por sus compras que puede canjear en la Tienda.',
    helpLabel: 'Ver guía del Club',
  },
  'go-plus': {
    title: 'Puntos y Reward Advance',
    desc: 'Incentivá a tus clientes a volver. Un cliente promedio puede canjear un premio cada 4-5 visitas. Configurando bien estos valores, aumentás la retención y el ticket promedio.',
    helpLabel: 'Ver guía de GO+',
  },
  wallet: {
    title: 'Wallet Digital',
    desc: 'La tarjeta digital de tu club aparece en el celular del cliente con sus puntos y el estado de su membresía. Notificá automáticamente a quienes pasen cerca de tu local.',
    helpLabel: 'Ver guía de Wallet',
  },
  tienda: {
    title: 'Tienda de Canje',
    desc: 'Creá productos que tus miembros puedan canjear con sus puntos. Cada canje genera un código único (TGO-XXXX) que validás al entregar el producto.',
    helpLabel: 'Ver guía de Tienda',
  },
}

export function BannerContext({ module, className }: BannerContextProps) {
  const content = BANNER_CONTENT[module]
  const pathname = usePathname()
  const tenantSlug = pathname.split('/')[1] || ''
  if (!content) return null

  return (
    <div className={cn(
      'flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3.5',
      className
    )}>
      <span className="text-lg leading-none mt-0.5">
        {module === 'club' ? '🎯' : module === 'go-plus' ? '⚡' : module === 'wallet' ? '💳' : '🎁'}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-foreground">{content.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{content.desc}</p>
      </div>
      <a
        href={`/${tenantSlug}/admin/ayuda`}
        className="shrink-0 text-[11px] font-semibold text-primary hover:underline mt-0.5 ml-auto"
      >
        {content.helpLabel} →
      </a>
    </div>
  )
}
