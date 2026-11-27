'use client'

import { cn } from '@/lib/utils'
import {
  MODULE_KEYS,
  MODULE_LABELS,
  STOREFRONT_TEMPLATES,
  VERTICALS,
  getVertical,
  type ModuleKey,
  type StorefrontTemplateId,
} from '@/lib/verticals'

// ─── Rubro, plantilla visual y módulos (multi-rubro, etapa 1) ────────────────
// Se usa en el alta rápida, en el alta clásica y en la edición del comercio.
// Al cambiar el rubro se proponen su plantilla y sus módulos; después se puede
// elegir otra plantilla o sumar/quitar módulos.

export interface VerticalValue {
  vertical: string
  storefrontTemplate: StorefrontTemplateId
  modules: ModuleKey[]
}

export function defaultVerticalValue(verticalId?: string | null): VerticalValue {
  const v = getVertical(verticalId)
  return { vertical: v.id, storefrontTemplate: v.recommendedTemplate, modules: [...v.modules] }
}

interface Props {
  value: VerticalValue
  onChange: (next: VerticalValue) => void
  idPrefix?: string
  fieldClassName?: string
  labelClassName?: string
}

const defaultField = 'w-full min-h-11 rounded-xl border border-border bg-background px-3 text-[15px] text-foreground outline-none focus:border-primary'
const defaultLabel = 'mb-1.5 block text-xs font-bold text-muted-foreground'

export default function VerticalPicker({ value, onChange, idPrefix = 'vp', fieldClassName = defaultField, labelClassName = defaultLabel }: Props) {
  const vertical = getVertical(value.vertical)

  function toggleModule(k: ModuleKey) {
    const has = value.modules.includes(k)
    onChange({ ...value, modules: has ? value.modules.filter(m => m !== k) : [...value.modules, k] })
  }

  return (
    <div className="space-y-4">
      <div>
        <label className={labelClassName} htmlFor={`${idPrefix}-vertical`}>Actividad comercial</label>
        <select
          id={`${idPrefix}-vertical`}
          className={fieldClassName}
          value={value.vertical}
          onChange={e => onChange(defaultVerticalValue(e.target.value))}
        >
          {VERTICALS.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
      </div>

      <div>
        <span className={labelClassName}>Plantilla visual</span>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {STOREFRONT_TEMPLATES.map(t => (
            <button
              key={t.id}
              type="button"
              aria-pressed={value.storefrontTemplate === t.id}
              onClick={() => onChange({ ...value, storefrontTemplate: t.id })}
              className={cn('rounded-xl border px-3 py-2 text-left transition-colors', value.storefrontTemplate === t.id ? 'border-primary bg-primary/10' : 'border-border')}
            >
              <span className="block text-sm font-bold">
                {t.label}
                {t.id === vertical.recommendedTemplate && <span className="ml-1.5 text-[11px] font-medium text-muted-foreground">recomendada</span>}
              </span>
              <span className="block text-[11px] text-muted-foreground">{t.description}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className={labelClassName}>Módulos</span>
        <div className="flex flex-wrap gap-2">
          {MODULE_KEYS.map(k => {
            const on = value.modules.includes(k)
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => toggleModule(k)}
                className={cn('min-h-9 rounded-full border px-3 text-xs font-semibold transition-colors', on ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground')}
              >
                {MODULE_LABELS[k]}
              </button>
            )
          })}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">El plan sigue mandando: un módulo que el plan no incluye se muestra con candado.</p>
      </div>
    </div>
  )
}
