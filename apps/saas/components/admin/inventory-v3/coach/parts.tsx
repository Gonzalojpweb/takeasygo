'use client'

// ============================================================================
// Guía en vivo — piezas visuales (anillo de avance, avisos, etapas)
// ============================================================================
// Lo visual nunca va solo: cada color e ícono tiene su texto al lado.
// ============================================================================

import { useState } from 'react'
import {
  ArrowRight,
  BookOpen,
  CalendarCheck,
  ChefHat,
  ChevronDown,
  CircleCheck,
  CircleMinus,
  CirclePause,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Copy,
  EyeOff,
  Lightbulb,
  OctagonAlert,
  Power,
  Receipt,
  Scale,
  Tag,
  TriangleAlert,
  Trophy,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CoachFinding, CoachStage, FindingLevel } from '@/lib/inventory/coach/rules'
import type { StageContent } from '@/lib/inventory/coach/content'
import { btnGhost, btnPrimary, btnSecondary } from '../ui'

type IconType = React.ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>

export const FINDING_ICON: Record<CoachFinding['icon'], IconType> = {
  pause: CirclePause,
  scale: Scale,
  minus: CircleMinus,
  copy: Copy,
  clipboard: ClipboardCheck,
  tag: Tag,
  chef: ChefHat,
  trophy: Trophy,
  alert: TriangleAlert,
  receipt: Receipt,
}

export const STAGE_ICON: Record<StageContent['icon'], IconType> = {
  chef: ChefHat,
  book: BookOpen,
  clipboard: ClipboardList,
  power: Power,
  calendar: CalendarCheck,
}

export const LEVEL_LOOK: Record<FindingLevel, { label: string; badge: IconType; card: string; chip: string; iconBox: string }> = {
  stop: {
    label: 'Frena la venta',
    badge: OctagonAlert,
    card: 'border-red-600/40 bg-red-50/60 dark:bg-red-950/25',
    chip: 'border-red-600/40 bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200',
    iconBox: 'bg-red-600 text-white',
  },
  warn: {
    label: 'Conviene revisarlo',
    badge: TriangleAlert,
    card: 'border-amber-600/40 bg-amber-50/60 dark:bg-amber-950/25',
    chip: 'border-amber-600/40 bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-100',
    iconBox: 'bg-amber-500 text-white',
  },
  tip: {
    label: 'Consejo',
    badge: Lightbulb,
    card: 'border-sky-600/30 bg-sky-50/60 dark:bg-sky-950/25',
    chip: 'border-sky-600/40 bg-sky-100 text-sky-900 dark:bg-sky-950/60 dark:text-sky-100',
    iconBox: 'bg-sky-600 text-white',
  },
  win: {
    label: 'Bien hecho',
    badge: Trophy,
    card: 'border-emerald-600/30 bg-emerald-50/60 dark:bg-emerald-950/25',
    chip: 'border-emerald-600/40 bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-100',
    iconBox: 'bg-emerald-600 text-white',
  },
}

/** Anillo de avance con el porcentaje en el centro. */
export function ProgressRing({ pct, size = 64, label }: { pct: number; size?: number; label: string }) {
  const stroke = Math.max(5, Math.round(size / 10))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const value = Math.max(0, Math.min(100, pct))
  return (
    <div role={label ? 'img' : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : true} className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (value / 100) * c}
          className={cn('transition-[stroke-dashoffset] duration-700', value >= 100 ? 'stroke-emerald-600' : 'stroke-primary')}
        />
      </svg>
      <span aria-hidden className="absolute text-sm font-black tabular-nums" style={{ fontSize: size < 56 ? 11 : 14 }}>
        {value}%
      </span>
    </div>
  )
}

/** Recorrido horizontal compacto (5 puntos con su nombre). */
export function MiniJourney({ stages, titles }: { stages: CoachStage[]; titles: Record<string, string> }) {
  return (
    <ol aria-label="Etapas del recorrido" className="flex w-full items-start">
      {stages.map((s, i) => (
        <li key={s.id} className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center" aria-current={s.state === 'current' ? 'step' : undefined}>
          <div className="flex w-full items-center">
            <span aria-hidden className={cn('h-0.5 flex-1', i === 0 ? 'invisible' : stages[i - 1].state === 'done' ? 'bg-emerald-600' : 'bg-border')} />
            <span
              aria-hidden
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-black',
                s.state === 'done' && 'bg-emerald-600 text-white',
                s.state === 'current' && 'bg-primary text-primary-foreground ring-4 ring-primary/20',
                s.state === 'todo' && 'bg-muted text-muted-foreground',
              )}
            >
              {s.state === 'done' ? <CircleCheck size={16} /> : i + 1}
            </span>
            <span aria-hidden className={cn('h-0.5 flex-1', i === stages.length - 1 ? 'invisible' : s.state === 'done' ? 'bg-emerald-600' : 'bg-border')} />
          </div>
          <span className={cn('hidden px-1 text-[11px] font-bold leading-tight sm:block', s.state === 'current' ? 'text-foreground' : 'text-muted-foreground')}>
            {titles[s.id]}
          </span>
          <span className="sr-only">
            {titles[s.id]}: {s.state === 'done' ? 'hecho' : s.state === 'current' ? 'etapa actual' : 'pendiente'}
          </span>
        </li>
      ))}
    </ol>
  )
}

/** Aviso de la guía: qué pasó, por qué importa, cómo se arregla y botones. */
export function FindingCard({
  finding,
  onAction,
  onDismiss,
  defaultOpen,
}: {
  finding: CoachFinding
  onAction: (i: number) => void
  onDismiss?: () => void
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen))
  const look = LEVEL_LOOK[finding.level]
  const Icon = FINDING_ICON[finding.icon]
  const Badge = look.badge
  const hasDetail = finding.fix.length > 0 || Boolean(finding.why)
  return (
    <article className={cn('rounded-2xl border-2 p-4', look.card)} aria-label={`${look.label}: ${finding.title}`}>
      <div className="flex items-start gap-3">
        <span aria-hidden className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', look.iconBox)}>
          <Icon size={20} />
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-black uppercase tracking-wide', look.chip)}>
            <Badge size={12} aria-hidden /> {look.label}
          </span>
          <h4 className="text-base font-black leading-snug">{finding.title}</h4>
          <p className="text-sm leading-relaxed">{finding.what}</p>
        </div>
      </div>

      {hasDetail && finding.level !== 'win' && (
        <div className="mt-3 pl-0 sm:pl-[52px]">
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-primary"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <ChevronDown size={16} aria-hidden className={cn('transition-transform', open && 'rotate-180')} />
            {open ? 'Ocultar cómo se arregla' : 'Por qué importa y cómo se arregla'}
          </button>
          {open && (
            <div className="mt-2 space-y-3 rounded-xl bg-background/80 p-3 text-sm">
              {finding.why && (
                <p>
                  <strong>Por qué importa: </strong>
                  {finding.why}
                </p>
              )}
              {finding.fix.length > 0 && (
                <div>
                  <p className="font-bold">Cómo se arregla</p>
                  <ol className="mt-1.5 space-y-1.5">
                    {finding.fix.map((step, i) => (
                      <li key={i} className="flex gap-2">
                        <span aria-hidden className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-black text-primary">
                          {i + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {(finding.actions.length > 0 || onDismiss) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 sm:pl-[52px]">
          {finding.actions.map((a, i) => (
            <button key={a.label} type="button" className={i === 0 ? btnPrimary : btnSecondary} onClick={() => onAction(i)}>
              {a.label}
              {i === 0 && <ArrowRight size={16} aria-hidden />}
            </button>
          ))}
          {onDismiss && (
            <button type="button" className={cn(btnGhost, 'text-muted-foreground')} onClick={onDismiss}>
              <EyeOff size={16} aria-hidden /> Ya lo vi
            </button>
          )}
        </div>
      )}
    </article>
  )
}

/** Una etapa del recorrido, desplegable, con todo lo que hay que saber. */
export function StageBlock({
  content,
  stage,
  defaultOpen,
  onHelp,
  children,
}: {
  content: StageContent
  stage: CoachStage
  defaultOpen: boolean
  onHelp: () => void
  children?: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const Icon = STAGE_ICON[content.icon]
  const done = stage.state === 'done'
  const current = stage.state === 'current'
  return (
    <li className="relative pl-14" aria-current={current ? 'step' : undefined}>
      <span
        aria-hidden
        className={cn(
          'absolute left-0 top-0 flex size-11 items-center justify-center rounded-2xl',
          done && 'bg-emerald-600 text-white',
          current && 'bg-primary text-primary-foreground shadow-lg shadow-primary/25',
          !done && !current && 'bg-muted text-muted-foreground',
        )}
      >
        {done ? <CircleCheck size={22} /> : <Icon size={22} />}
      </span>
      <div className={cn('rounded-2xl border-2 p-4', current ? 'border-primary bg-primary/[0.03]' : 'border-border')}>
        <button type="button" className="flex w-full items-start justify-between gap-3 text-left" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <span className="min-w-0">
            <span className="block text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Etapa {content.number} · {done ? 'Hecha' : current ? 'Te toca ahora' : 'Pendiente'}
            </span>
            <span className="mt-0.5 block text-base font-black">{content.title}</span>
            <span className="mt-0.5 block text-sm text-muted-foreground">{content.goal}</span>
          </span>
          <ChevronDown size={20} aria-hidden className={cn('mt-1 shrink-0 transition-transform', open && 'rotate-180')} />
        </button>

        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className={cn('h-full rounded-full transition-all duration-700', done ? 'bg-emerald-600' : 'bg-primary')} style={{ width: `${done ? 100 : stage.pct}%` }} />
          </div>
          <p className="mt-1 text-xs font-semibold text-muted-foreground">{stage.progressLabel}</p>
        </div>

        {open && (
          <div className="mt-4 space-y-4 text-sm">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-bold">
              <Clock size={14} aria-hidden /> Lleva {content.time}
            </p>
            <p className="leading-relaxed">{content.why}</p>

            <div>
              <p className="font-black">Cómo se hace</p>
              <ol className="mt-2 space-y-2">
                {content.steps.map((s, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span aria-hidden className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-black text-primary-foreground">
                      {i + 1}
                    </span>
                    <span className="leading-relaxed">{s}</span>
                  </li>
                ))}
              </ol>
            </div>

            {children}

            <div className="flex gap-3 rounded-xl border-2 border-amber-500/30 bg-amber-50 p-3 dark:bg-amber-950/30">
              <ChefHat size={22} aria-hidden className="shrink-0 text-amber-700 dark:text-amber-300" />
              <p>
                <strong>Tip de cocina: </strong>
                {content.chefTip}
              </p>
            </div>

            {content.mistakes.length > 0 && (
              <div>
                <p className="font-black">Errores comunes (y cómo salir)</p>
                <ul className="mt-2 space-y-2">
                  {content.mistakes.map((m, i) => (
                    <li key={i} className="overflow-hidden rounded-xl border-2 border-border">
                      <p className="flex gap-2 bg-red-50 p-2.5 font-semibold text-red-900 dark:bg-red-950/30 dark:text-red-100">
                        <TriangleAlert size={16} aria-hidden className="mt-0.5 shrink-0" />
                        <span>
                          <span className="sr-only">Error: </span>
                          {m.mistake}
                        </span>
                      </p>
                      <p className="flex gap-2 p-2.5">
                        <CircleCheck size={16} aria-hidden className="mt-0.5 shrink-0 text-emerald-600" />
                        <span>
                          <span className="sr-only">Cómo se arregla: </span>
                          {m.fix}
                        </span>
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button type="button" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-primary underline-offset-2 hover:underline" onClick={onHelp}>
              <BookOpen size={16} aria-hidden /> Leer más sobre esto
            </button>
          </div>
        )}
      </div>
    </li>
  )
}
