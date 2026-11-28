'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Check, CheckCircle2, Info, Loader2, PieChart, Wand2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Mitad y mitad: configuración guiada para el dueño ───────────────────────
// Tres pasos en una sola pantalla: 1) qué pizzas pueden ir mitad y mitad,
// 2) cómo se cobra (cada opción con la cuenta hecha con SUS pizzas), 3) precio
// de media (solo «suma de medias»), con vista previa de lo que paga el cliente
// y un resumen antes de guardar. La regla vale en la carta online y en el POS.

export type HalfPricing = 'max' | 'average' | 'half_sum'

export interface HalfFlavorRow {
  locationId: string
  locationName: string
  /** Categoría (o «Categoría · Subcategoría»): solo se combinan sabores de la misma. */
  category: string
  itemId: string
  name: string
  /** Precio de la Grande en centavos. */
  grandePrice: number
  /** Precio de media en centavos (null = mitad de la Grande). */
  halfPrice: number | null
}

interface Props {
  tenantSlug: string
  initialPricing: HalfPricing
  flavors: HalfFlavorRow[]
}

const RULES: Array<{ value: HalfPricing; title: string; short: string }> = [
  { value: 'max', title: 'La más cara', short: 'Cobrás el precio de la Grande del sabor más caro.' },
  { value: 'average', title: 'Promedio', short: 'Cobrás la mitad de cada Grande y se suman.' },
  { value: 'half_sum', title: 'Suma de medias', short: 'Vos definís cuánto vale media pizza de cada sabor.' },
]
const RULE_LABEL: Record<HalfPricing, string> = { max: 'La más cara', average: 'Promedio', half_sum: 'Suma de medias' }

const pesos = (c: number) => `$${Math.round(c / 100).toLocaleString('es-AR')}`
const keyOf = (f: HalfFlavorRow) => `${f.locationId}:${f.itemId}`
const groupKey = (f: HalfFlavorRow) => `${f.locationId}:${f.category}`

function parsePesos(v: string): number | null | 'invalid' {
  const t = v.trim()
  if (!t) return null
  const n = Number(t.replace(/\$/g, '').replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 'invalid'
}

function centsToInput(c: number | null): string {
  return c ? String(Math.round(c / 100)) : ''
}

export default function HalfAndHalfSettings({ tenantSlug, initialPricing, flavors }: Props) {
  const [open, setOpen] = useState(false)
  const [savedPricing, setSavedPricing] = useState<HalfPricing>(initialPricing)
  const [savedHalf, setSavedHalf] = useState<Record<string, number | null>>(() => Object.fromEntries(flavors.map(f => [keyOf(f), f.halfPrice])))
  const [pricing, setPricing] = useState<HalfPricing>(initialPricing)
  const [inputs, setInputs] = useState<Record<string, string>>(() => Object.fromEntries(flavors.map(f => [keyOf(f), centsToInput(f.halfPrice)])))
  const [saving, setSaving] = useState(false)

  const multiSede = new Set(flavors.map(f => f.locationId)).size > 1

  // Grupos por sede + categoría: solo los que tienen 2 o más pizzas con Grande se pueden combinar.
  const groups = useMemo(() => {
    const map = new Map<string, HalfFlavorRow[]>()
    for (const f of flavors) map.set(groupKey(f), [...(map.get(groupKey(f)) ?? []), f])
    return [...map.values()].map(items => ({ key: groupKey(items[0]), label: multiSede ? `${items[0].category} · ${items[0].locationName}` : items[0].category, items, usable: items.length >= 2 }))
  }, [flavors, multiSede])
  const usableGroups = groups.filter(g => g.usable)
  const usableFlavors = usableGroups.flatMap(g => g.items)

  /** Precio de media efectivo de un sabor (lo cargado o la mitad de la Grande). */
  const halfOf = (f: HalfFlavorRow): number => {
    const p = parsePesos(inputs[keyOf(f)] ?? '')
    return typeof p === 'number' ? p : Math.round(f.grandePrice / 2)
  }
  const totalFor = (a: HalfFlavorRow, b: HalfFlavorRow, rule: HalfPricing) =>
    rule === 'max' ? Math.max(a.grandePrice, b.grandePrice)
      : rule === 'average' ? Math.round(a.grandePrice / 2) + Math.round(b.grandePrice / 2)
        : halfOf(a) + halfOf(b)

  // Par de ejemplo: la más barata y la más cara del primer grupo usable (muestra bien la diferencia).
  const examplePair = useMemo(() => {
    const g = usableGroups[0]
    if (!g) return null
    const sorted = [...g.items].sort((x, y) => x.grandePrice - y.grandePrice)
    return [sorted[0], sorted[sorted.length - 1]] as const
  }, [usableGroups])

  // Vista previa: el dueño elige dos sabores del mismo grupo.
  const [previewGroup, setPreviewGroup] = useState<string>('')
  const pg = usableGroups.find(g => g.key === previewGroup) ?? usableGroups[0]
  const [pa, setPa] = useState<string>('')
  const [pb, setPb] = useState<string>('')
  const flavorA = pg?.items.find(f => f.itemId === pa) ?? examplePair?.[0] ?? pg?.items[0]
  const flavorB = pg?.items.find(f => f.itemId === pb && f.itemId !== flavorA?.itemId) ?? pg?.items.find(f => f.itemId !== flavorA?.itemId && f.itemId === examplePair?.[1]?.itemId) ?? pg?.items.find(f => f.itemId !== flavorA?.itemId)

  // Validación del paso 3.
  const rowIssues = useMemo(() => {
    const out: Record<string, { level: 'error' | 'warn'; text: string } | null> = {}
    for (const f of usableFlavors) {
      const p = parsePesos(inputs[keyOf(f)] ?? '')
      if (p === 'invalid') out[keyOf(f)] = { level: 'error', text: 'Escribí un monto válido (solo números).' }
      else if (typeof p === 'number' && p >= f.grandePrice) out[keyOf(f)] = { level: 'warn', text: 'Es igual o más que la pizza entera.' }
      else if (typeof p === 'number' && p < f.grandePrice * 0.3) out[keyOf(f)] = { level: 'warn', text: 'Parece bajo para media pizza.' }
      else out[keyOf(f)] = null
    }
    return out
  }, [inputs, usableFlavors])
  const hasErrors = pricing === 'half_sum' && Object.values(rowIssues).some(i => i?.level === 'error')

  // Cambios pendientes.
  const halfChanges = pricing === 'half_sum'
    ? usableFlavors
      .map(f => ({ f, value: parsePesos(inputs[keyOf(f)] ?? '') }))
      .filter(({ f, value }) => value !== 'invalid' && value !== (savedHalf[keyOf(f)] ?? null))
    : []
  const dirty = pricing !== savedPricing || halfChanges.length > 0

  function openPanel() {
    setPricing(savedPricing)
    setInputs(Object.fromEntries(flavors.map(f => [keyOf(f), centsToInput(savedHalf[keyOf(f)] ?? null)])))
    setOpen(true)
  }

  function fillSuggested() {
    setInputs(prev => {
      const next = { ...prev }
      for (const f of usableFlavors) if (!next[keyOf(f)]?.trim()) next[keyOf(f)] = String(Math.round(f.grandePrice / 200))
      return next
    })
  }

  async function save() {
    if (hasErrors || saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/settings/half-and-half`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pricing,
          halfPrices: halfChanges.map(({ f, value }) => ({ locationId: f.locationId, itemId: f.itemId, halfPrice: value })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar')
      setSavedPricing(pricing)
      setSavedHalf(prev => ({ ...prev, ...Object.fromEntries(halfChanges.map(({ f, value }) => [keyOf(f), value as number | null])) }))
      toast.success(`Listo: la mitad y mitad se cobra «${RULE_LABEL[pricing]}» en la carta y en el POS`)
      setOpen(false)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const summary = pricing === 'max'
    ? 'El cliente paga la Grande del sabor más caro.'
    : pricing === 'average'
      ? 'El cliente paga la mitad de cada Grande.'
      : 'El cliente paga la media que definiste de cada sabor.'

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-white text-sm font-medium transition-colors"
      >
        <PieChart size={16} />
        Mitad y mitad
        <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold">
          {usableGroups.length ? RULE_LABEL[savedPricing] : 'Sin configurar'}
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Mitad y mitad">
          <div className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl sm:rounded-2xl" data-lenis-prevent>
            {/* Encabezado */}
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h2 className="text-lg font-bold">Mitad y mitad</h2>
                <p className="text-sm text-muted-foreground">Elegí cómo cobrás una pizza de dos sabores. Se aplica en la carta online y en el POS.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" className="rounded-full p-2 hover:bg-muted"><X size={18} /></button>
            </div>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
              {/* Paso 1 */}
              <Step n={1} title="Tus pizzas para mitad y mitad">
                {usableGroups.length === 0 ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <p className="font-semibold">Todavía no podés ofrecer mitad y mitad.</p>
                    <p className="mt-1">Necesitás al menos dos pizzas en la misma categoría con la variante <b>Grande</b> y su precio:</p>
                    <ol className="mt-2 list-decimal space-y-0.5 pl-5">
                      <li>Abrí la pizza en el editor de Menú (más abajo en esta página).</li>
                      <li>En «Variantes», agregá <b>Grande</b> con su precio.</li>
                      <li>Hacé lo mismo con otra pizza de la misma categoría.</li>
                    </ol>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {groups.map(g => (
                      <div key={g.key} className={cn('rounded-xl border p-3', g.usable ? 'border-border' : 'border-dashed border-border bg-muted/30')}>
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          {g.usable ? <CheckCircle2 size={16} className="text-emerald-600" /> : <Info size={16} className="text-muted-foreground" />}
                          {g.label}
                          <span className="font-normal text-muted-foreground">· {g.items.length} {g.items.length === 1 ? 'pizza' : 'pizzas'}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {g.usable
                            ? g.items.map(f => f.name).join(', ')
                            : `${g.items[0].name} es la única con Grande en esta categoría: necesita otra para combinar.`}
                        </p>
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground">Solo se combinan sabores de la misma categoría. Para sumar una pizza, cargale la variante «Grande».</p>
                  </div>
                )}
              </Step>

              {/* Paso 2 */}
              <Step n={2} title="¿Cómo la cobrás?">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {RULES.map(r => {
                    const selected = pricing === r.value
                    const ex = examplePair ? totalFor(examplePair[0], examplePair[1], r.value) : null
                    return (
                      <button
                        key={r.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setPricing(r.value)}
                        className={cn('relative flex flex-col rounded-xl border-2 p-3 text-left transition-colors', selected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40')}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold">{r.title}</span>
                          <span className={cn('flex h-5 w-5 items-center justify-center rounded-full border', selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>
                            {selected && <Check size={13} strokeWidth={3} />}
                          </span>
                        </span>
                        <span className="mt-1 text-xs text-muted-foreground">{r.short}</span>
                        {examplePair && ex != null && (
                          <span className="mt-3 rounded-lg bg-muted/60 px-2 py-1.5 text-xs">
                            {examplePair[0].name} + {examplePair[1].name}
                            <span className="block text-base font-bold text-foreground">{pesos(ex)}</span>
                          </span>
                        )}
                        {savedPricing === r.value && <span className="mt-2 text-[11px] font-semibold text-emerald-700">Lo que usás hoy</span>}
                      </button>
                    )
                  })}
                </div>
              </Step>

              {/* Paso 3 (solo suma de medias) */}
              {pricing === 'half_sum' && usableFlavors.length > 0 && (
                <Step n={3} title="Precio de media pizza">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">Si dejás un casillero vacío, se cobra la mitad de su Grande.</p>
                    <button type="button" onClick={fillSuggested} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">
                      <Wand2 size={14} /> Completar vacíos con la mitad
                    </button>
                  </div>
                  <div className="space-y-3">
                    {usableGroups.map(g => (
                      <div key={g.key}>
                        <p className="mb-1 text-xs font-semibold text-muted-foreground">{g.label}</p>
                        <div className="divide-y divide-border rounded-xl border border-border">
                          {g.items.map(f => {
                            const issue = rowIssues[keyOf(f)]
                            return (
                              <div key={keyOf(f)} className="px-3 py-2.5">
                                <div className="flex items-center gap-3">
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium">{f.name}</p>
                                    <p className="text-xs text-muted-foreground">Grande {pesos(f.grandePrice)} · sugerido {pesos(f.grandePrice / 2)}</p>
                                  </div>
                                  <label className={cn('flex h-10 w-32 items-center rounded-lg border bg-background px-2 focus-within:border-primary', issue?.level === 'error' ? 'border-red-400' : 'border-border')}>
                                    <span className="text-sm text-muted-foreground">$</span>
                                    <input
                                      value={inputs[keyOf(f)] ?? ''}
                                      onChange={e => setInputs(prev => ({ ...prev, [keyOf(f)]: e.target.value }))}
                                      placeholder={String(Math.round(f.grandePrice / 200))}
                                      inputMode="numeric"
                                      aria-label={`Precio de media de ${f.name}`}
                                      className="w-full bg-transparent px-1 text-right text-sm outline-none"
                                    />
                                  </label>
                                </div>
                                {issue && (
                                  <p className={cn('mt-1 flex items-center gap-1 text-xs', issue.level === 'error' ? 'text-red-600' : 'text-amber-700')}>
                                    <AlertTriangle size={12} /> {issue.text}
                                  </p>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </Step>
              )}

              {/* Vista previa */}
              {pg && flavorA && flavorB && (
                <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-primary">Así lo paga tu cliente</p>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                    {usableGroups.length > 1 && (
                      <select className="h-10 rounded-lg border border-border bg-background px-2 text-sm sm:col-span-3" value={pg.key} onChange={e => { setPreviewGroup(e.target.value); setPa(''); setPb('') }} aria-label="Categoría de la vista previa">
                        {usableGroups.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
                      </select>
                    )}
                    <select className="h-10 rounded-lg border border-border bg-background px-2 text-sm" value={flavorA.itemId} onChange={e => setPa(e.target.value)} aria-label="Primera mitad">
                      {pg.items.map(f => <option key={f.itemId} value={f.itemId}>{f.name}</option>)}
                    </select>
                    <span className="text-center text-sm font-bold text-muted-foreground">+</span>
                    <select className="h-10 rounded-lg border border-border bg-background px-2 text-sm" value={flavorB.itemId} onChange={e => setPb(e.target.value)} aria-label="Segunda mitad">
                      {pg.items.filter(f => f.itemId !== flavorA.itemId).map(f => <option key={f.itemId} value={f.itemId}>{f.name}</option>)}
                    </select>
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      {pricing === 'max' && `La más cara: ${flavorA.grandePrice >= flavorB.grandePrice ? flavorA.name : flavorB.name} Grande`}
                      {pricing === 'average' && `${pesos(flavorA.grandePrice / 2)} (mitad de ${flavorA.name}) + ${pesos(flavorB.grandePrice / 2)} (mitad de ${flavorB.name})`}
                      {pricing === 'half_sum' && `${pesos(halfOf(flavorA))} (media ${flavorA.name}) + ${pesos(halfOf(flavorB))} (media ${flavorB.name})`}
                    </p>
                    <p className="text-2xl font-extrabold">{pesos(totalFor(flavorA, flavorB, pricing))}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Pie: resumen + guardar */}
            <div className="flex flex-col gap-3 border-t border-border px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm">
                <b>{RULE_LABEL[pricing]}:</b> <span className="text-muted-foreground">{summary}</span>
              </p>
              <div className="flex gap-2 sm:flex-shrink-0">
                <button type="button" onClick={() => setOpen(false)} className="h-10 flex-1 rounded-lg border border-border px-4 text-sm sm:flex-none">Cancelar</button>
                <button
                  type="button"
                  onClick={save}
                  disabled={!dirty || hasErrors || saving}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50 sm:flex-none"
                >
                  {saving && <Loader2 size={15} className="animate-spin" />}
                  {dirty ? 'Guardar cambios' : 'Sin cambios'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{n}</span>
        {title}
      </h3>
      {children}
    </section>
  )
}
