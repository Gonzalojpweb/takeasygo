'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Camera, Loader2, Lock, X } from 'lucide-react'
import type { MenuJson, MenuJsonStats } from '@/lib/provisioning/menu-json'

interface Props {
  tenantSlug: string
  locationId: string
  locationName: string
  /** Plan Élite: si no, se muestra el candado con la indicación del plan. */
  enabled: boolean
  onSuccess: () => void
  onClose: () => void
}

const ars = (pesos: number) => `$${Math.round(pesos).toLocaleString('es-AR')}`

/**
 * Menú › Cargar carta desde foto (plan Élite): la IA lee la foto o PDF, se
 * revisa la carta y se aplica con el importador de siempre (formato v1).
 */
export default function MenuFromPhotoModal({ tenantSlug, locationId, locationName, enabled, onSuccess, onClose }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [reading, setReading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [menu, setMenu] = useState<MenuJson | null>(null)
  const [stats, setStats] = useState<MenuJsonStats | null>(null)
  const [mode, setMode] = useState<'append' | 'replace'>('append')
  const [error, setError] = useState<string | null>(null)

  async function read() {
    if (!file) return
    setReading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/${tenantSlug}/menu/import/from-image`, { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo leer la carta')
      setMenu(data.menu)
      setStats(data.stats)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer la carta')
    } finally {
      setReading(false)
    }
  }

  async function apply() {
    if (!menu) return
    setApplying(true)
    setError(null)
    try {
      const res = await fetch(`/api/${tenantSlug}/menu/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId, categories: menu.categories, mode, version: 1 }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar la carta')
      toast.success(`Carta cargada: ${data.imported?.items ?? stats?.items ?? 0} productos`)
      onSuccess()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la carta')
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="mfp-title">
      <div className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-card sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-border p-5">
          <div>
            <h2 id="mfp-title" className="text-lg font-extrabold">Cargar carta desde foto</h2>
            <p className="text-sm text-muted-foreground">{locationName} · la IA lee la carta y la revisás antes de cargarla.</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl hover:bg-muted" aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {!enabled ? (
            <div className="space-y-3 rounded-2xl border border-border p-5 text-center">
              <Lock size={26} className="mx-auto text-muted-foreground" />
              <p className="font-bold">Leer la carta desde una foto es del plan Élite</p>
              <p className="text-sm text-muted-foreground">Mientras tanto podés cargarla con «Importar» pegando el JSON de la carta.</p>
              <Link href={`/${tenantSlug}/admin/billing`} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground">Ver planes</Link>
            </div>
          ) : !menu ? (
            <div className="space-y-3">
              <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border p-5 text-center hover:bg-muted/40">
                <Camera size={26} className="text-muted-foreground" />
                <span className="text-sm font-bold">{file ? file.name : 'Sacá una foto de la carta o elegí un PDF'}</span>
                <span className="text-xs text-muted-foreground">JPG, PNG, WEBP o PDF · hasta 10 MB · si es larga, subila en partes</span>
                <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
              </label>
              <button type="button" onClick={read} disabled={!file || reading} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">
                {reading && <Loader2 size={16} className="animate-spin" />} {reading ? 'Leyendo la carta… (puede tardar un minuto)' : 'Leer carta'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm font-bold">{stats?.categories} categorías · {stats?.items} productos. Revisá nombres y precios antes de cargar.</p>
              <div className="space-y-3">
                {menu.categories.map((c, i) => (
                  <div key={i} className="rounded-xl border border-border">
                    <p className="border-b border-border px-3 py-2 text-sm font-extrabold">{c.name}</p>
                    <ul className="divide-y divide-border">
                      {[...c.items, ...(c.subcategories ?? []).flatMap(s => s.items.map(it => ({ ...it, name: `${s.name} · ${it.name}` })))].map((it, j) => (
                        <li key={j} className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
                          <span className="min-w-0">{it.name}{it.description ? <span className="block text-xs text-muted-foreground">{it.description}</span> : null}</span>
                          <span className={it.price > 0 ? 'shrink-0 font-bold tabular-nums' : 'shrink-0 font-bold text-amber-600'}>{it.price > 0 ? ars(it.price) : 'Sin precio'}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Cómo cargar">
                {([['append', 'Agregar a la carta actual'], ['replace', 'Reemplazar la carta']] as const).map(([v, l]) => (
                  <button key={v} type="button" role="radio" aria-checked={mode === v} onClick={() => setMode(v)} className={`min-h-11 rounded-xl border px-3 text-sm font-bold ${mode === v ? 'border-primary bg-primary/10' : 'border-border'}`}>{l}</button>
                ))}
              </div>
            </div>
          )}
          {error && <p className="rounded-xl bg-destructive/10 p-3 text-sm font-bold text-destructive" role="alert">{error}</p>}
        </div>

        {enabled && menu && (
          <div className="flex gap-2 border-t border-border p-4">
            <button type="button" onClick={() => { setMenu(null); setStats(null) }} className="min-h-12 flex-1 rounded-xl border border-border text-sm font-bold">Leer otra</button>
            <button type="button" onClick={apply} disabled={applying} className="inline-flex min-h-12 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50">
              {applying && <Loader2 size={16} className="animate-spin" />} {mode === 'replace' ? 'Reemplazar carta' : 'Agregar a la carta'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
