'use client'

// ============================================================================
// «¿Cómo lo contás en la cocina?» — elección de unidad de un insumo nuevo
// ============================================================================
// Tres tarjetas con ejemplos de cocina, sin opción marcada de antemano: antes
// venía «kg» por defecto y un «20» pensado en unidades quedaba en kilos.
// ============================================================================

import { useId } from 'react'
import { Droplet, Hash, Lightbulb, Scale } from 'lucide-react'
import { cn } from '@/lib/utils'
import { UNIT_CHOICES } from '@/lib/inventory/coach/tips'

const UNIT_ICON = { kg: Scale, l: Droplet, unit: Hash } as const

export function UnitChoice({ value, onChange, invalid }: { value: string; onChange: (unit: 'kg' | 'l' | 'unit') => void; invalid?: boolean }) {
  const id = useId()
  return (
    <fieldset aria-describedby={`${id}-hint`} aria-invalid={invalid || undefined}>
      <legend className="text-sm font-bold">¿Cómo lo contás en la cocina?</legend>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        Elegilo bien: el stock, las compras y los conteos de este ingrediente se van a llevar así.
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {UNIT_CHOICES.map((u) => {
          const Icon = UNIT_ICON[u.value]
          const on = value === u.value
          return (
            <label
              key={u.value}
              className={cn(
                'flex cursor-pointer flex-col gap-1 rounded-xl border-2 p-3 text-sm transition-colors focus-within:ring-[3px] focus-within:ring-primary/40',
                on ? 'border-primary bg-primary/10' : 'border-border bg-background hover:bg-muted',
                invalid && !value && 'border-red-600/60',
              )}
            >
              <input type="radio" name={`${id}-unit`} value={u.value} checked={on} onChange={() => onChange(u.value)} className="sr-only" />
              <span className="flex items-center gap-2 font-black">
                <Icon size={18} aria-hidden /> {u.title}
              </span>
              <span className="text-xs text-muted-foreground">{u.examples}</span>
              <span className="text-xs font-semibold">{u.how}</span>
            </label>
          )
        })}
      </div>
      {invalid && !value && <p className="mt-1 text-sm font-semibold text-red-700 dark:text-red-300">Elegí cómo lo contás antes de crearlo.</p>}
    </fieldset>
  )
}

export function DuplicateNameTip() {
  return (
    <p className="flex gap-2 rounded-xl bg-background/70 p-2.5 text-xs">
      <Lightbulb size={16} aria-hidden className="shrink-0 text-amber-600" />
      <span>
        Antes de crear, fijate que no exista con otro nombre («Mejillón» y «Mejillones» serían dos ingredientes distintos). Si ya existe con este mismo
        nombre, usamos ese en lugar de duplicarlo.
      </span>
    </p>
  )
}
