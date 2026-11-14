'use client'

// ============================================================================
// Consejos en vivo dentro de un formulario (receta, recepción…)
// ============================================================================
// Aparecen mientras se completa, antes de guardar. Anunciados con aria-live
// para quien usa lector de pantalla. Color + ícono + texto, nunca color solo.
// ============================================================================

import { CircleCheck, Info, OctagonAlert, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LiveTip } from '@/lib/inventory/coach/tips'

const LOOK = {
  stop: { icon: OctagonAlert, cls: 'border-red-600/40 bg-red-50 text-red-950 dark:bg-red-950/30 dark:text-red-50', label: 'Atención' },
  warn: { icon: TriangleAlert, cls: 'border-amber-600/40 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-50', label: 'Revisá' },
  ok: { icon: CircleCheck, cls: 'border-emerald-600/30 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-50', label: 'Bien' },
  info: { icon: Info, cls: 'border-border bg-muted/60 text-foreground', label: 'Dato' },
} as const

export function LiveTips({ tips, title = 'La guía te avisa' }: { tips: LiveTip[]; title?: string }) {
  return (
    <div aria-live="polite" className="space-y-2">
      {tips.length > 0 && <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">{title}</p>}
      {tips.map((t) => {
        const look = LOOK[t.tone]
        const Icon = look.icon
        return (
          <p key={t.key} className={cn('flex items-start gap-2 rounded-xl border-2 p-3 text-sm', look.cls)}>
            <Icon size={18} aria-hidden className="mt-0.5 shrink-0" />
            <span>
              <span className="sr-only">{look.label}: </span>
              {t.text}
            </span>
          </p>
        )
      })}
    </div>
  )
}
