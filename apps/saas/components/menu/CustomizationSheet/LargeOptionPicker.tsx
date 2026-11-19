'use client'

import { useMemo, useState } from 'react'
import { Check, Search, X } from 'lucide-react'
import { toPesos } from '@takeasygo/business/browser'
import { groupBySection } from '@/lib/menu/option-sections'

// ============================================================================
// Selector para grupos grandes (p. ej. 60 sabores) — menú del cliente
// ============================================================================
// Aprobado 19/11: buscador, chips por familia, contador «2 / 4», elegidos
// arriba (se quitan con un toque) y los agotados al final de cada familia,
// en gris y sin poder elegirlos. Sin scroll interno: el sheet ya scrollea.
// ============================================================================

interface Option {
  _id?: string
  name: string
  extraPrice: number
  section?: string
  soldOut?: boolean
}

interface Props {
  groupName: string
  options: Option[]
  selectedNames: string[]
  /** Tope de elecciones (single = 1, fixed = N, multiple = maxSelections). */
  max?: number
  primaryColor: string
  textColor: string
  onToggle: (optionName: string) => void
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function LargeOptionPicker({ groupName, options, selectedNames, max, primaryColor, textColor, onToggle }: Props) {
  const [q, setQ] = useState('')
  const [fam, setFam] = useState<string | null>(null)

  const families = useMemo(() => {
    const out: string[] = []
    for (const o of options) { const s = o.section?.trim(); if (s && !out.includes(s)) out.push(s) }
    return out
  }, [options])

  const sections = useMemo(() => {
    const nq = norm(q.trim())
    const list = options.filter(o => (!nq || norm(o.name).includes(nq)) && (!fam || o.section?.trim() === fam))
    return groupBySection(list, 'Otros').map(([name, opts]) =>
      [name, [...opts].sort((a, b) => Number(!!a.soldOut) - Number(!!b.soldOut))] as [string, Option[]])
  }, [options, q, fam])

  const full = max != null && max > 1 && selectedNames.length >= max
  const total = sections.reduce((n, [, l]) => n + l.length, 0)

  return (
    <div className="space-y-3">
      {/* Elegidos */}
      <div className="flex flex-wrap items-center gap-1.5">
        {max != null && max > 1 && (
          <span className="mr-1 text-xs font-bold tabular-nums" style={{ color: primaryColor }}>{selectedNames.length} / {max}</span>
        )}
        {selectedNames.length === 0 ? (
          <span className="text-xs text-zinc-400">Todavía no elegiste {groupName.toLowerCase()}</span>
        ) : selectedNames.map(name => (
          <button key={name} type="button" onClick={() => onToggle(name)}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}
            aria-label={`Quitar ${name}`}>
            {name} <X size={12} strokeWidth={3} />
          </button>
        ))}
      </div>

      {/* Buscador */}
      <label className="relative block">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
        <input
          type="search"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={`Buscar en ${groupName.toLowerCase()}…`}
          autoComplete="off"
          className="h-10 w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-zinc-400"
          style={{ color: textColor }}
        />
      </label>

      {/* Familias */}
      {families.length > 1 && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5" style={{ scrollbarWidth: 'none' }}>
          {[null, ...families].map(f => {
            const on = fam === f
            return (
              <button key={f ?? '__all'} type="button" onClick={() => setFam(f)} aria-pressed={on}
                className="h-8 shrink-0 rounded-full border px-3 text-xs font-semibold"
                style={on ? { backgroundColor: primaryColor, borderColor: primaryColor, color: '#fff' } : { borderColor: '#e4e4e7', color: '#52525b' }}>
                {f ?? 'Todas'}
              </button>
            )
          })}
        </div>
      )}

      {/* Lista */}
      {total === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-400">No encontramos «{q}».</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200">
          {sections.map(([name, list]) => (
            <div key={name || '__none'}>
              {name && (
                <div className="flex justify-between border-b border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  <span>{name}</span><span>{list.filter(o => !o.soldOut).length}</span>
                </div>
              )}
              {list.map(o => {
                const on = selectedNames.includes(o.name)
                const disabled = !!o.soldOut || (full && !on)
                return (
                  <button
                    key={o._id ?? o.name}
                    type="button"
                    disabled={disabled}
                    aria-pressed={on}
                    onClick={() => onToggle(o.name)}
                    className="flex min-h-[48px] w-full items-center gap-3 border-b border-zinc-100 px-3 text-left last:border-b-0 disabled:cursor-not-allowed"
                    style={{ opacity: o.soldOut ? 0.55 : full && !on ? 0.45 : 1 }}
                  >
                    <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border-2"
                      style={on ? { backgroundColor: primaryColor, borderColor: primaryColor } : { borderColor: '#d4d4d8' }}>
                      {on && <Check size={13} strokeWidth={3.5} className="text-white" />}
                    </span>
                    <span className={`min-w-0 flex-1 text-sm font-medium ${o.soldOut ? 'line-through' : ''}`} style={{ color: o.soldOut ? '#a1a1aa' : textColor }}>
                      {o.name}
                    </span>
                    {o.soldOut ? (
                      <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">Agotado</span>
                    ) : o.extraPrice > 0 ? (
                      <span className="text-xs text-zinc-500">+${toPesos(o.extraPrice).toLocaleString('es-AR')}</span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
