'use client'

// ============================================================================
// Display Studio — platos de la carta en una plantilla
// ============================================================================
// · «Toda la carta» (o solo algunas categorías) o «Solo los que elijo».
// · Por cada plato elegido: la foto de la carta o una foto propia (subida,
//   con «Quitar fondo gratis»). Sin foto en la carta → se avisa.
// · «Traer de mi carta» para las plantillas con platos fijos: completa
//   nombre, descripción, precio y foto de ese lugar.
// ============================================================================
import { useState } from 'react'
import { ChevronDown, ChevronUp, ImageIcon, Link2, RotateCcw, X } from 'lucide-react'
import StudioImageField from './StudioImageField'

export interface CatalogProduct {
  _id: string
  name: string
  category: string
  categoryId?: string
  hasPhoto: boolean
  isAvailable: boolean
  description?: string
  price?: number | null
  imageUrl?: string | null
}
export interface CatalogCategory { _id: string; name: string; isAvailable: boolean; products: number }
import type { StudioItemOverride } from '@/lib/display/studio/catalog'
export type ProductOverrides = Record<string, StudioItemOverride>

const inputCls = 'w-full min-h-[44px] rounded-xl border border-border bg-background px-3 text-base sm:text-sm'
const ars = (cents: number | null | undefined) => (cents ? (cents / 100).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }) : '')

export function MenuSourcePicker({ tenantSlug, label, hint, max, allowAll, products, categories, mode, productIds, categoryIds, overrides, unavailable, bgRemoval, onChange }: {
  tenantSlug: string
  label: string
  hint?: string
  max: number
  allowAll: boolean
  products: CatalogProduct[]
  categories: CatalogCategory[]
  mode: 'selected' | 'all'
  productIds: string[]
  categoryIds: string[]
  overrides: ProductOverrides
  unavailable: 'hide' | 'mark'
  bgRemoval: 'free' | 'cloudinary' | 'both'
  onChange: (patch: { mode?: 'selected' | 'all'; productIds?: string[]; categoryIds?: string[]; overrides?: ProductOverrides; unavailable?: 'hide' | 'mark' }) => void
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const list = products.filter((p) => p.isAvailable && (!q || `${p.name} ${p.category}`.toLowerCase().includes(q.toLowerCase())))
  const byId = new Map(products.map((p) => [p._id, p]))
  const chosen = productIds.map((id) => byId.get(id)).filter((p): p is CatalogProduct => !!p)
  const allCount = products.filter((p) => p.isAvailable && (!categoryIds.length || (p.categoryId && categoryIds.includes(p.categoryId)))).length
  const move = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= productIds.length) return; const n = [...productIds]; [n[i], n[j]] = [n[j], n[i]]; onChange({ productIds: n }) }
  /** Cambio manual de un plato: lo vacío vuelve a seguir a la carta. */
  const setOv = (id: string, patch: StudioItemOverride) => {
    const cur: StudioItemOverride = { ...(overrides[id] ?? {}), ...patch }
    if (!cur.url) { delete cur.url; delete cur.cutout }
    if (!cur.name) delete cur.name
    if (!cur.description) delete cur.description
    if (cur.price == null) delete cur.price
    const next = { ...overrides }
    if (Object.keys(cur).length) next[id] = cur
    else delete next[id]
    onChange({ overrides: next })
  }
  const clearOv = (id: string) => { const next = { ...overrides }; delete next[id]; onChange({ overrides: next }) }

  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <p className="text-sm font-medium">{label}{hint ? <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{hint}</span> : null}</p>
      {!products.length && <p className="text-sm text-muted-foreground">Elegí la sede para ver tu carta.</p>}

      {allowAll && products.length > 0 && (
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 text-sm" role="radiogroup" aria-label="Qué platos mostrar">
          {(['all', 'selected'] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => onChange({ mode: m })}
              className={`min-h-[40px] rounded-lg font-semibold ${mode === m ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>
              {m === 'all' ? 'Toda la carta' : 'Solo los que elijo'}
            </button>
          ))}
        </div>
      )}

      {allowAll && mode === 'all' && products.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Sin tildar ninguna = toda la carta. {allCount} platos disponibles{allCount > 60 ? ' (se muestran los primeros 60)' : ''}; si no entran en una pantalla, se reparten en páginas. Lo pausado no aparece.</p>
          <ul className="flex flex-wrap gap-2">
            {categories.filter((c) => c.isAvailable).map((c) => {
              const on = categoryIds.includes(c._id)
              return (
                <li key={c._id}>
                  <button type="button" onClick={() => onChange({ categoryIds: on ? categoryIds.filter((x) => x !== c._id) : [...categoryIds, c._id] })}
                    className={`min-h-[40px] rounded-full border px-3 text-sm ${on ? 'border-primary bg-primary/10 font-semibold text-primary' : 'border-border'}`}>
                    {c.name}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {products.length > 0 && (
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5" checked={unavailable === 'mark'} onChange={(e) => onChange({ unavailable: e.target.checked ? 'mark' : 'hide' })} />
          <span>Mostrar los agotados con el cartel «Agotado» <span className="block text-xs text-muted-foreground">Si no, desaparecen de la pantalla mientras estén pausados.</span></span>
        </label>
      )}

      {(!allowAll || mode === 'selected') && products.length > 0 && (
        <>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en tu carta…" aria-label="Buscar plato" className={inputCls} />
          <p className="text-xs text-muted-foreground">{productIds.length} de {max} elegidos · se traen nombre, descripción, precio y foto</p>
          <ul className="max-h-56 overflow-y-auto rounded-xl border border-border">
            {list.map((p) => {
              const on = productIds.includes(p._id)
              return (
                <li key={p._id}>
                  <label className="flex min-h-[40px] cursor-pointer items-center gap-2 px-2 text-sm">
                    <input type="checkbox" className="h-5 w-5 shrink-0" checked={on} disabled={!on && productIds.length >= max}
                      onChange={() => onChange({ productIds: on ? productIds.filter((x) => x !== p._id) : [...productIds, p._id] })} />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{p.category}{p.hasPhoto ? '' : ' · sin foto'}</span>
                  </label>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {(!allowAll || mode === 'selected') && chosen.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Orden y fotos</p>
          <ul className="space-y-1.5">
            {chosen.map((p, i) => {
              const ov = overrides[p._id] ?? {}
              const own = ov.url ? { url: ov.url, cutout: ov.cutout === true } : null
              const src = own?.url || p.imageUrl || ''
              const edited = !!(ov.name || ov.description || ov.price)
              return (
                <li key={p._id} className="rounded-xl border border-border">
                  <div className="flex items-center gap-2 p-2">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <ImageIcon size={18} className="text-muted-foreground" aria-hidden />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{ov.name || p.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{ars(ov.price ?? p.price)}{own ? ' · foto propia' : p.imageUrl ? ' · foto de la carta' : ' · sin foto (respaldo tipográfico)'}{edited ? ' · editado' : ''}</p>
                    </div>
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="min-h-[40px] min-w-[40px] rounded-lg border border-border disabled:opacity-30" aria-label="Subir"><ChevronUp size={16} className="mx-auto" aria-hidden /></button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === chosen.length - 1} className="min-h-[40px] min-w-[40px] rounded-lg border border-border disabled:opacity-30" aria-label="Bajar"><ChevronDown size={16} className="mx-auto" aria-hidden /></button>
                    <button type="button" onClick={() => setOpen(open === p._id ? null : p._id)} className="min-h-[40px] rounded-lg border border-border px-2 text-xs font-semibold">Editar</button>
                    <button type="button" onClick={() => { onChange({ productIds: productIds.filter((x) => x !== p._id) }); clearOv(p._id) }} className="min-h-[40px] min-w-[40px] rounded-lg text-muted-foreground" aria-label="Quitar"><X size={16} className="mx-auto" aria-hidden /></button>
                  </div>
                  {open === p._id && (
                    <div className="space-y-2 border-t border-border p-2">
                      <p className="text-xs text-muted-foreground">Lo que dejes vacío sigue a tu carta: si cambiás el precio o lo pausás allá, la pantalla se actualiza sola.</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input value={ov.name ?? ''} maxLength={80} placeholder={p.name} onChange={(e) => setOv(p._id, { name: e.target.value })} aria-label="Nombre en pantalla" className={inputCls} />
                        <input type="number" min={0} inputMode="numeric" value={typeof ov.price === 'number' ? Math.round(ov.price / 100) : ''} placeholder={p.price ? `Carta: ${ars(p.price)}` : 'Precio'}
                          onChange={(e) => setOv(p._id, { price: e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value) * 100)) })} aria-label="Precio en pantalla" className={inputCls} />
                        <input value={ov.description ?? ''} maxLength={140} placeholder={p.description || 'Descripción'} onChange={(e) => setOv(p._id, { description: e.target.value })} aria-label="Descripción en pantalla" className={`${inputCls} sm:col-span-2`} />
                      </div>
                      <p className="text-xs text-muted-foreground">{own ? 'Usás una foto propia para este plato.' : p.imageUrl ? 'Usa la foto de tu carta. Podés subir otra solo para esta pantalla.' : 'Este plato no tiene foto en la carta: subí una o se muestra con un respaldo tipográfico.'}</p>
                      <StudioImageField tenantSlug={tenantSlug} label="Foto propia de este plato" url={own?.url ?? ''} cutout={own?.cutout === true} bgRemoval={bgRemoval} onChange={(url, cut) => setOv(p._id, { url, cutout: cut })} />
                      {(own || edited) && (
                        <button type="button" onClick={() => clearOv(p._id)} className="min-h-[40px] inline-flex items-center gap-1 rounded-xl border border-border px-3 text-sm"><RotateCcw size={14} aria-hidden /> Volver todo a la carta</button>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Plato fijo de la plantilla vinculado a la carta (se actualiza solo). */
export function SlotFill({ label, products, boundId, onPick, onUnbind }: { label: string; products: CatalogProduct[]; boundId: string; onPick: (p: CatalogProduct) => void; onUnbind: () => void }) {
  if (!products.length) return null
  const bound = products.find((p) => p._id === boundId)
  if (bound) return (
    <div className="rounded-xl border border-primary/40 bg-primary/5 p-2 text-sm">
      <p className="font-medium">{label}</p>
      <p className="flex items-center gap-1 text-xs text-muted-foreground"><Link2 size={12} aria-hidden /> Vinculado a <b className="text-foreground">{bound.name}</b>{bound.price ? ` · ${ars(bound.price)}` : ''}{bound.isAvailable ? '' : ' · agotado'}</p>
      <button type="button" onClick={onUnbind} className="mt-1 min-h-[40px] rounded-lg border border-border px-3 text-xs font-semibold">Desvincular</button>
    </div>
  )
  return (
    <label className="block text-sm font-medium">{label}
      <select value="" onChange={(e) => { const p = products.find((x) => x._id === e.target.value); if (p) onPick(p) }} className={`${inputCls} mt-1`}>
        <option value="">Vincular un plato de mi carta…</option>
        {products.filter((p) => p.isAvailable).map((p) => <option key={p._id} value={p._id}>{p.name} — {p.category}{p.price ? ` · ${ars(p.price)}` : ''}{p.hasPhoto ? '' : ' (sin foto)'}</option>)}
      </select>
    </label>
  )
}
