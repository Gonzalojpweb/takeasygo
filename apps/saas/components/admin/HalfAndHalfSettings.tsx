'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, PieChart, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Mitad y mitad: cómo cobra el comercio ───────────────────────────────────
// La regla vale igual en la carta online, el checkout y el POS. Las pizzas que
// admiten mitad y mitad son las que tienen la variante «Grande» con precio.

export type HalfPricing = 'max' | 'average' | 'half_sum'

export interface HalfFlavorRow {
  locationId: string
  locationName: string
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

const OPTIONS: Array<{ value: HalfPricing; title: string; detail: string }> = [
  { value: 'max', title: 'La más cara', detail: 'Se cobra la Grande del sabor más caro.' },
  { value: 'average', title: 'Promedio', detail: 'Se cobra el promedio de las dos Grandes (mitad de cada una).' },
  { value: 'half_sum', title: 'Suma de medias', detail: 'Se suma el precio de media de cada sabor. Si una pizza no tiene precio de media, vale la mitad de su Grande.' },
]

const pesos = (c: number) => `$${(c / 100).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
const toCents = (v: string) => { const n = Number(v.replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null }

export default function HalfAndHalfSettings({ tenantSlug, initialPricing, flavors }: Props) {
  const [open, setOpen] = useState(false)
  const [pricing, setPricing] = useState<HalfPricing>(initialPricing)
  const [halfInputs, setHalfInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries(flavors.map(f => [`${f.locationId}:${f.itemId}`, f.halfPrice ? String(f.halfPrice / 100).replace('.', ',') : ''])),
  )
  const [saving, setSaving] = useState(false)
  const multiSede = new Set(flavors.map(f => f.locationId)).size > 1

  // Ejemplo con las dos primeras pizzas de la misma sede.
  const example = useMemo(() => {
    const a = flavors[0]
    const b = flavors.find(f => f.locationId === a?.locationId && f.itemId !== a?.itemId)
    if (!a || !b) return null
    const half = (f: HalfFlavorRow) => {
      const typed = toCents(halfInputs[`${f.locationId}:${f.itemId}`] ?? '')
      return typed ?? Math.round(f.grandePrice / 2)
    }
    const total = pricing === 'max' ? Math.max(a.grandePrice, b.grandePrice)
      : pricing === 'average' ? Math.round(a.grandePrice / 2) + Math.round(b.grandePrice / 2)
        : half(a) + half(b)
    return `${a.name} + ${b.name} = ${pesos(total)}`
  }, [flavors, pricing, halfInputs])

  async function save() {
    setSaving(true)
    try {
      const halfPrices = pricing === 'half_sum'
        ? flavors.map(f => {
          const raw = halfInputs[`${f.locationId}:${f.itemId}`] ?? ''
          const cents = raw.trim() ? toCents(raw) : null
          if (raw.trim() && cents == null) throw new Error(`Precio de media inválido en ${f.name}`)
          return { locationId: f.locationId, itemId: f.itemId, halfPrice: cents }
        }).filter((h, i) => h.halfPrice !== (flavors[i].halfPrice ?? null))
        : []
      const res = await fetch(`/api/${tenantSlug}/settings/half-and-half`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pricing, halfPrices }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar')
      toast.success('Mitad y mitad guardada')
      setOpen(false)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-white text-sm font-medium transition-colors"
      >
        <PieChart size={16} />
        Mitad y mitad
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label="Mitad y mitad">
          <div className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-background sm:rounded-2xl" data-lenis-prevent>
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-lg font-bold">Mitad y mitad</h2>
                <p className="text-xs text-muted-foreground">Cómo se cobra una pizza de dos sabores, en la carta online y en el POS.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" className="rounded-full p-1.5 hover:bg-muted"><X size={18} /></button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {flavors.length < 2 && (
                <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                  Para ofrecer mitad y mitad, cargá al menos dos pizzas de la misma categoría con la variante <b>Grande</b> y su precio.
                </p>
              )}

              <div className="space-y-2">
                {OPTIONS.map(o => (
                  <button
                    key={o.value}
                    type="button"
                    aria-pressed={pricing === o.value}
                    onClick={() => setPricing(o.value)}
                    className={cn('w-full rounded-xl border p-3 text-left transition-colors', pricing === o.value ? 'border-primary bg-primary/10' : 'border-border')}
                  >
                    <span className="block text-sm font-bold">{o.title}</span>
                    <span className="block text-xs text-muted-foreground">{o.detail}</span>
                  </button>
                ))}
              </div>

              {example && <p className="text-sm">Ejemplo: <b>{example}</b></p>}

              {pricing === 'half_sum' && flavors.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-bold">Precio de media pizza</h3>
                  <div className="divide-y divide-border rounded-xl border border-border">
                    {flavors.map(f => {
                      const key = `${f.locationId}:${f.itemId}`
                      return (
                        <div key={key} className="flex items-center gap-3 px-3 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{f.name}</p>
                            <p className="text-xs text-muted-foreground">Grande {pesos(f.grandePrice)}{multiSede ? ` · ${f.locationName}` : ''}</p>
                          </div>
                          <input
                            value={halfInputs[key] ?? ''}
                            onChange={e => setHalfInputs(prev => ({ ...prev, [key]: e.target.value }))}
                            placeholder={pesos(Math.round(f.grandePrice / 2)).replace('$', '')}
                            inputMode="decimal"
                            aria-label={`Precio de media de ${f.name}`}
                            className="h-9 w-28 rounded-lg border border-border bg-background px-2 text-right text-sm outline-none focus:border-primary"
                          />
                        </div>
                      )
                    })}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Vacío = la mitad de la Grande.</p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <button type="button" onClick={() => setOpen(false)} className="h-10 rounded-lg border border-border px-4 text-sm">Cancelar</button>
              <button type="button" onClick={save} disabled={saving} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                {saving && <Loader2 size={15} className="animate-spin" />} Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
