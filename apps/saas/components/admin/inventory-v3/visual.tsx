'use client'

// ============================================================================
// Inventario V3 — piezas visuales (tablero, íconos, pasos)
// ============================================================================
// Referencia de diseño: inventoryUI.png (raíz del repo). Lo visual nunca va
// solo: cada ícono o color acompaña un texto (accesible y sin adivinar).
// · SkuIcon: ícono y color por categoría de insumo (los insumos no tienen
//   foto; decisión 2026-10-23).
// · DishThumb: foto del plato del menú, o un ícono si no tiene.
// · KpiTile, ProgressBar, Stepper, HeroCard.
// ============================================================================

import { Apple, Beef, Box, Carrot, ChefHat, ChevronRight, CupSoda, Fish, Milk, Package, Wheat } from 'lucide-react'
import { cn } from '@/lib/utils'

type IconType = React.ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>

const CATEGORY_LOOK: Record<string, { icon: IconType; tone: string; label: string }> = {
  meat_poultry: { icon: Beef, tone: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300', label: 'Carnes y aves' },
  fish_seafood: { icon: Fish, tone: 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300', label: 'Pescados y mariscos' },
  vegetables: { icon: Carrot, tone: 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300', label: 'Verduras' },
  fruits: { icon: Apple, tone: 'bg-lime-100 text-lime-700 dark:bg-lime-950/50 dark:text-lime-300', label: 'Frutas' },
  dairy: { icon: Milk, tone: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300', label: 'Lácteos' },
  dry_goods: { icon: Wheat, tone: 'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300', label: 'Almacén' },
  beverages: { icon: CupSoda, tone: 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300', label: 'Bebidas' },
  packaging: { icon: Package, tone: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', label: 'Descartables' },
  other: { icon: Box, tone: 'bg-muted text-muted-foreground', label: 'Otros' },
}

export function categoryLook(category: string | null | undefined) {
  return CATEGORY_LOOK[category ?? 'other'] ?? CATEGORY_LOOK.other
}

/** Ícono del insumo según su categoría (decorativo: el nombre siempre va al lado). */
export function SkuIcon({ category, size = 'md', className }: { category: string | null | undefined; size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  const look = categoryLook(category)
  const Icon = look.icon
  const box = { sm: 'size-8 rounded-lg', md: 'size-11 rounded-xl', lg: 'size-14 rounded-2xl', xl: 'size-20 rounded-3xl' }[size]
  const px = { sm: 16, md: 22, lg: 28, xl: 40 }[size]
  return (
    <span aria-hidden className={cn('inline-flex shrink-0 items-center justify-center', box, look.tone, className)}>
      <Icon size={px} aria-hidden />
    </span>
  )
}

/** Foto del plato (del menú) o un ícono si no tiene. */
export function DishThumb({ imageUrl, size = 'md' }: { imageUrl?: string | null; size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'size-16 rounded-2xl' : 'size-12 rounded-xl'
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageUrl} alt="" loading="lazy" className={cn('shrink-0 object-cover', box)} />
  }
  return (
    <span aria-hidden className={cn('inline-flex shrink-0 items-center justify-center bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300', box)}>
      <ChefHat size={size === 'lg' ? 28 : 22} aria-hidden />
    </span>
  )
}

export function ProgressBar({ value, label, tone = 'ok' }: { value: number; label: string; tone?: 'ok' | 'warning' | 'danger' }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div className="flex items-center gap-2">
      <div role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-[width] duration-500', tone === 'ok' && 'bg-emerald-500', tone === 'warning' && 'bg-amber-500', tone === 'danger' && 'bg-red-500')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-10 text-right text-xs font-bold tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  )
}

/** Indicador del tablero: número grande, qué es, y a dónde lleva. */
export function KpiTile({
  icon: Icon,
  tone,
  value,
  label,
  hint,
  progress,
  onClick,
}: {
  icon: IconType
  tone: 'blue' | 'orange' | 'red' | 'green' | 'neutral'
  value: string
  label: string
  hint?: string
  progress?: { value: number; label: string; tone?: 'ok' | 'warning' | 'danger' }
  onClick?: () => void
}) {
  const toneCls = {
    blue: 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
    orange: 'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300',
    red: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300',
    green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
    neutral: 'bg-muted text-muted-foreground',
  }[tone]
  const body = (
    <>
      <span aria-hidden className={cn('inline-flex size-11 shrink-0 items-center justify-center rounded-xl', toneCls)}>
        <Icon size={22} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-2xl font-black leading-tight tabular-nums">{value}</span>
        <span className="block text-sm font-semibold text-muted-foreground">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>}
        {progress && (
          <span className="mt-2 block">
            <ProgressBar value={progress.value} label={progress.label} tone={progress.tone} />
          </span>
        )}
      </span>
      {onClick && <ChevronRight size={18} aria-hidden className="shrink-0 self-center text-muted-foreground" />}
    </>
  )
  const cls = 'flex w-full items-start gap-3 rounded-2xl border-2 border-border bg-card p-4 text-left'
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(cls, 'transition-colors hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40')}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  )
}

/** Pasos de un flujo (1 Productos → 2 Cantidades → 3 Confirmar). */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol aria-label="Pasos" className="flex items-center gap-2">
      {steps.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo'
        return (
          <li key={s} className="flex min-w-0 flex-1 items-center gap-2" aria-current={state === 'current' ? 'step' : undefined}>
            <span
              className={cn(
                'inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-black',
                state === 'current' && 'bg-primary text-primary-foreground',
                state === 'done' && 'bg-emerald-500 text-white',
                state === 'todo' && 'bg-muted text-muted-foreground',
              )}
            >
              {state === 'done' ? '✓' : i + 1}
            </span>
            <span className={cn('truncate text-sm', state === 'current' ? 'font-bold' : 'text-muted-foreground')}>{s}</span>
            {i < steps.length - 1 && <span aria-hidden className="hidden h-px flex-1 bg-border sm:block" />}
          </li>
        )
      })}
    </ol>
  )
}
