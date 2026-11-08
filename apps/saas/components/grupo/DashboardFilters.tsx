'use client'

import { useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { CalendarRange, Filter, Loader2, X } from 'lucide-react'

interface Props {
  periods: { id: string; label: string }[]
  period: string
  range: { from: string; to: string }
  available: { slug: string; name: string; locations: { id: string; name: string }[] }[]
  brands: string[]
  locations: string[]
}

/** Período, fechas a elección y filtro de marcas/sedes. Todo va en la dirección (se puede guardar o compartir). */
export default function DashboardFilters({ periods, period, range, available, brands, locations }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, start] = useTransition()
  const [showDates, setShowDates] = useState(period === 'custom')
  const [showFilter, setShowFilter] = useState(false)
  const [from, setFrom] = useState(range.from)
  const [to, setTo] = useState(range.to)
  const [selBrands, setSelBrands] = useState<string[]>(brands)
  const [selLocations, setSelLocations] = useState<string[]>(locations)

  function go(next: { periodo?: string; desde?: string; hasta?: string; marcas?: string[]; sedes?: string[] }) {
    const q = new URLSearchParams()
    const p = next.periodo ?? period
    q.set('periodo', p)
    if (p === 'custom') { q.set('desde', next.desde ?? range.from); q.set('hasta', next.hasta ?? range.to) }
    const m = next.marcas ?? brands
    const s = next.sedes ?? locations
    if (m.length) q.set('marcas', m.join(','))
    if (s.length) q.set('sedes', s.join(','))
    start(() => router.push(`${pathname}?${q.toString()}`))
  }

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v])
  const activeFilters = brands.length + locations.length
  const multi = available.length > 1 || available.some(b => b.locations.length > 1)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {periods.map(p => (
          <button key={p.id} type="button" onClick={() => { setShowDates(false); go({ periodo: p.id }) }}
            className={`rounded-full border px-3 py-1 text-sm ${p.id === period ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground hover:bg-muted'}`}>
            {p.label}
          </button>
        ))}
        <button type="button" onClick={() => setShowDates(v => !v)}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${period === 'custom' ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground hover:bg-muted'}`}>
          <CalendarRange size={14} /> Elegir fechas
        </button>
        {multi && (
          <button type="button" onClick={() => setShowFilter(v => !v)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${activeFilters ? 'border-primary text-primary' : 'border-border text-foreground hover:bg-muted'}`}>
            <Filter size={14} /> Marcas y sedes{activeFilters ? ` (${activeFilters})` : ''}
          </button>
        )}
        {pending && <Loader2 size={16} className="animate-spin text-muted-foreground" />}
      </div>

      {showDates && (
        <form className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3"
          onSubmit={e => { e.preventDefault(); if (from && to && from <= to) go({ periodo: 'custom', desde: from, hasta: to }) }}>
          <label className="text-xs text-muted-foreground">Desde
            <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className="mt-1 block rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground" />
          </label>
          <label className="text-xs text-muted-foreground">Hasta
            <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} className="mt-1 block rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground" />
          </label>
          <button type="submit" className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">Ver</button>
        </form>
      )}

      {showFilter && multi && (
        <div className="space-y-3 rounded-xl border border-border bg-card p-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {available.map(b => (
              <div key={b.slug} className="space-y-1">
                <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <input type="checkbox" checked={selBrands.includes(b.slug)} onChange={() => setSelBrands(v => toggle(v, b.slug))} />
                  {b.name}
                </label>
                {b.locations.length > 1 && b.locations.map(l => (
                  <label key={l.id} className="ml-6 flex items-center gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" checked={selLocations.includes(l.id)} onChange={() => setSelLocations(v => toggle(v, l.id))} />
                    {l.name}
                  </label>
                ))}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Sin nada tildado se ven todas. Tildá marcas o sedes para mirar solo esas.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => { setShowFilter(false); go({ marcas: selBrands, sedes: selLocations }) }} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">Aplicar</button>
            {activeFilters > 0 && (
              <button type="button" onClick={() => { setSelBrands([]); setSelLocations([]); setShowFilter(false); go({ marcas: [], sedes: [] }) }} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm"><X size={14} /> Ver todo</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
