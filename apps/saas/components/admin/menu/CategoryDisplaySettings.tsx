'use client'

import { LayoutGrid, List, GalleryHorizontal, Sparkles, ImageOff, Layers, Crown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CATEGORY_LAYOUTS, LAYOUT_APPLY_TO, type CategoryLayoutSetting, type LayoutApplyTo } from '@/lib/menu-layout'

export interface CategoryDisplayValue {
  layout: CategoryLayoutSetting
  applyTo: LayoutApplyTo
  combosAfter: boolean
  clubCardAfter: boolean
}

interface CategoryDisplaySource {
  displayLayout?: string | null
  displayLayoutApplyTo?: string | null
  combosAfter?: boolean
  clubCardAfter?: boolean
}

export function categoryDisplayFrom(category: CategoryDisplaySource | null): CategoryDisplayValue {
  const layout = category?.displayLayout
  const applyTo = category?.displayLayoutApplyTo
  return {
    layout: (CATEGORY_LAYOUTS as readonly string[]).includes(layout ?? '') ? (layout as CategoryLayoutSetting) : 'inherit',
    applyTo: (LAYOUT_APPLY_TO as readonly string[]).includes(applyTo ?? '') ? (applyTo as LayoutApplyTo) : 'both',
    combosAfter: category?.combosAfter === true,
    clubCardAfter: category?.clubCardAfter === true,
  }
}

const LAYOUT_OPTIONS: { value: CategoryLayoutSetting; label: string; hint: string; icon: typeof List }[] = [
  { value: 'inherit', label: 'Igual que el menú', hint: 'Usa el diseño general', icon: Sparkles },
  { value: 'list', label: 'Lista', hint: 'Filas con foto chica', icon: List },
  { value: 'grid', label: 'Grilla', hint: 'Dos columnas, foto grande', icon: LayoutGrid },
  { value: 'carousel', label: 'Carrusel', hint: 'Fila con scroll horizontal', icon: GalleryHorizontal },
]

const APPLY_OPTIONS: { value: LayoutApplyTo; label: string }[] = [
  { value: 'both', label: 'Takeaway y salón' },
  { value: 'takeaway', label: 'Solo takeaway' },
  { value: 'dine-in', label: 'Solo salón' },
]

interface Props {
  value: CategoryDisplayValue
  onChange: (value: CategoryDisplayValue) => void
  totalItems: number
  itemsWithoutPhoto: number
}

/** «Cómo se muestra» la categoría en el menú público + secciones que se ubican después de ella. */
export function CategoryDisplaySettings({ value, onChange, totalItems, itemsWithoutPhoto }: Props) {
  const set = (patch: Partial<CategoryDisplayValue>) => onChange({ ...value, ...patch })
  const showsPhotos = value.layout === 'grid' || value.layout === 'carousel'

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <LayoutGrid size={14} className="text-primary" />
        <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/70">Cómo se muestra en el menú</span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Formato de la categoría">
        {LAYOUT_OPTIONS.map(opt => {
          const Icon = opt.icon
          const active = value.layout === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => set({ layout: opt.value })}
              className={cn(
                'flex flex-col items-start gap-1 rounded-xl border-2 p-3 text-left transition-all',
                active ? 'border-primary/50 bg-primary/5' : 'border-transparent bg-muted hover:border-border',
              )}
            >
              <Icon size={16} className={active ? 'text-primary' : 'text-muted-foreground'} />
              <span className={cn('text-xs font-black', active ? 'text-primary' : 'text-foreground')}>{opt.label}</span>
              <span className="text-[10px] leading-tight text-muted-foreground">{opt.hint}</span>
            </button>
          )
        })}
      </div>

      {value.layout !== 'inherit' && (
        <div className="space-y-1.5">
          <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">Aplica en</span>
          <div className="flex flex-wrap gap-2">
            {APPLY_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => set({ applyTo: opt.value })}
                className={cn(
                  'px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all',
                  value.applyTo === opt.value
                    ? 'bg-primary/5 border-primary/40 text-primary'
                    : 'bg-muted border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {value.applyTo !== 'both' && (
            <p className="text-[11px] text-muted-foreground">En el otro menú la categoría usa el diseño general.</p>
          )}
        </div>
      )}

      {value.layout === 'carousel' && totalItems > 8 && (
        <p className="text-[11px] text-muted-foreground">
          El carrusel muestra los primeros 8 productos y una tarjeta «Ver todos ({totalItems})» que despliega la categoría en grilla.
        </p>
      )}

      {showsPhotos && itemsWithoutPhoto > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800">
          <ImageOff size={14} className="mt-0.5 shrink-0" />
          <span>
            {itemsWithoutPhoto} de {totalItems} productos no tienen foto. Se mostrará el logo del local, o la inicial del plato si no hay logo.
          </span>
        </div>
      )}

      <div className="space-y-2 pt-1">
        <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">Después de esta categoría mostrar</span>
        <ToggleRow
          icon={Layers}
          label="Carrusel de combos"
          hint="Tiene prioridad sobre la posición elegida en Diseño. Solo una categoría por menú."
          checked={value.combosAfter}
          onChange={v => set({ combosAfter: v })}
        />
        <ToggleRow
          icon={Crown}
          label="Tarjeta del Club"
          hint="Menú takeaway. Solo una categoría por menú."
          checked={value.clubCardAfter}
          onChange={v => set({ clubCardAfter: v })}
        />
      </div>
    </div>
  )
}

function ToggleRow({ icon: Icon, label, hint, checked, onChange }: {
  icon: typeof List
  label: string
  hint: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/10 bg-primary/5 p-3">
      <div className="flex min-w-0 items-start gap-2">
        <Icon size={14} className="mt-0.5 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-xs font-bold text-foreground">{label}</p>
          <p className="text-[10px] leading-tight text-muted-foreground">{hint}</p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn('relative flex h-5 w-10 shrink-0 items-center rounded-full transition-all', checked ? 'bg-primary' : 'bg-muted-foreground/20')}
      >
        <span className={cn('absolute h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-all', checked ? 'left-[22px]' : 'left-1')} />
      </button>
    </div>
  )
}
