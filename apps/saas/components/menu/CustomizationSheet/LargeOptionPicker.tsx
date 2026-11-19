'use client'

import { useMemo, useState } from 'react'
import { Check, Search, X } from 'lucide-react'
import { toPesos } from '@takeasygo/business/browser'
import { displaySections } from '@/lib/menu/option-sections'

// ============================================================================
// Selector para grupos grandes (p. ej. 60 sabores) — menú del cliente
// ============================================================================
// v2 (19/11, capturas front1–3): la lista de una columna medía ~4.000 px y el
// cliente perdía de vista lo que ya había elegido. Ahora:
//   · barra FIJA arriba mientras scrollea: «2 de 4», los elegidos (se quitan
//     con un toque), buscador y familias;
//   · grilla compacta de 2 columnas (3 en pantallas anchas): menos de la
//     mitad de alto;
//   · familias: las del local o, si no cargó ninguna, sugeridas por nombre;
//     tocar una muestra solo esa;
//   · agotados al final de cada familia, en gris y sin poder elegirlos.
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
  required?: boolean
  primaryColor: string
  textColor: string
  /** Fondo del sheet: la barra fija lo usa para tapar lo que pasa por debajo. */
  bgColor?: string
  onToggle: (optionName: string) => void
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function LargeOptionPicker({ groupName, options, selectedNames, max, required, primaryColor, textColor, bgColor = '#ffffff', onToggle }: Props) {
  const [q, setQ] = useState('')
  const [fam, setFam] = useState<string | null>(null)

  const sections = useMemo(() => displaySections(options), [options])
  const families = sections.map(([name, list]) => [name, list.length] as const).filter(([name]) => name)

  const visible = useMemo(() => {
    const nq = norm(q.trim())
    return sections
      .filter(([name]) => nq || !fam || name === fam)
      .map(([name, list]) => [
        name,
        list
          .filter(o => !nq || norm(o.name).includes(nq))
          .sort((a, b) => Number(!!a.soldOut) - Number(!!b.soldOut)),
      ] as [string, Option[]])
      .filter(([, list]) => list.length > 0)
  }, [sections, q, fam])

  const multi = max != null && max > 1
  const full = multi && selectedNames.length >= max
  const total = visible.reduce((n, [, l]) => n + l.length, 0)
  const label = groupName.toLowerCase()

  return (
    <div>
      {/* Barra fija: lo elegido nunca se pierde de vista */}
      <div className="sticky top-0 z-10 -mx-4 space-y-2 px-4 pb-2 pt-1" style={{ backgroundColor: bgColor, boxShadow: `0 6px 10px -10px rgba(0,0,0,.35)` }}>
        <div className="flex items-center gap-2">
          {multi && (
            <span
              className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums"
              style={full ? { backgroundColor: primaryColor, color: '#fff' } : { backgroundColor: `${primaryColor}15`, color: primaryColor }}
              aria-live="polite"
            >
              {full ? `¡Listo! ${selectedNames.length} de ${max}` : `${selectedNames.length} de ${max}`}
            </span>
          )}
          <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-0.5" style={{ scrollbarWidth: 'none' }}>
            {selectedNames.length === 0 ? (
              <span className="truncate text-xs text-zinc-500">
                {required ? `Elegí ${multi ? `hasta ${max}` : '1'} ${multi ? label : ''}`.trim() : `Podés elegir ${label}`}
              </span>
            ) : selectedNames.map(name => (
              <button key={name} type="button" onClick={() => onToggle(name)}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold"
                style={{ borderColor: primaryColor, color: primaryColor, backgroundColor: '#fff' }}
                aria-label={`Quitar ${name}`}>
                {name} <X size={12} strokeWidth={3} aria-hidden />
              </button>
            ))}
          </div>
        </div>

        <label className="relative block">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={`Buscar entre ${options.length} ${label}…`}
            aria-label={`Buscar ${label}`}
            autoComplete="off"
            enterKeyHint="search"
            className="h-10 w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-9 text-sm outline-none focus:border-zinc-400"
            style={{ color: textColor }}
          />
          {q && (
            <button type="button" onClick={() => setQ('')} aria-label="Borrar búsqueda"
              className="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-zinc-400 hover:bg-zinc-100">
              <X size={14} />
            </button>
          )}
        </label>

        {families.length > 1 && !q && (
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4" style={{ scrollbarWidth: 'none' }} role="tablist" aria-label="Familias">
            {[[null, options.length] as const, ...families].map(([f, n]) => {
              const on = fam === f
              return (
                <button key={f ?? '__all'} type="button" role="tab" aria-selected={on} onClick={() => setFam(f)}
                  className="h-8 shrink-0 rounded-full border px-3 text-xs font-semibold"
                  style={on ? { backgroundColor: primaryColor, borderColor: primaryColor, color: '#fff' } : { borderColor: '#e4e4e7', color: '#52525b', backgroundColor: '#fff' }}>
                  {f ?? 'Todos'} <span className="opacity-60">{n}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Grilla compacta */}
      {total === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">No encontramos «{q}».</p>
      ) : (
        <div className="space-y-4 pt-3">
          {visible.map(([name, list]) => (
            <section key={name || '__none'} aria-label={name || label}>
              {name && (fam === null || q) && (
                <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-zinc-500">{name}</h4>
              )}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
                      className="flex min-h-[48px] items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-transform active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100"
                      style={{
                        borderColor: on ? primaryColor : '#e4e4e7',
                        backgroundColor: on ? `${primaryColor}12` : o.soldOut ? '#f4f4f5' : '#fff',
                        opacity: o.soldOut ? 0.6 : full && !on ? 0.45 : 1,
                      }}
                    >
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border-2"
                        style={on ? { backgroundColor: primaryColor, borderColor: primaryColor } : { borderColor: '#d4d4d8' }}>
                        {on && <Check size={12} strokeWidth={3.5} className="text-white" aria-hidden />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`line-clamp-2 text-[13px] font-medium leading-tight ${o.soldOut ? 'line-through' : ''}`}
                          style={{ color: on ? primaryColor : o.soldOut ? '#a1a1aa' : textColor }}>
                          {o.name}
                        </span>
                        {o.soldOut ? (
                          <span className="block text-[10px] font-bold uppercase tracking-wide text-zinc-500">Agotado</span>
                        ) : o.extraPrice > 0 ? (
                          <span className="block text-[11px] text-zinc-500">+${toPesos(o.extraPrice).toLocaleString('es-AR')}</span>
                        ) : null}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
          {full && (
            <p className="text-center text-xs text-zinc-500">Para cambiar uno, tocalo arriba o en la lista.</p>
          )}
        </div>
      )}
    </div>
  )
}
