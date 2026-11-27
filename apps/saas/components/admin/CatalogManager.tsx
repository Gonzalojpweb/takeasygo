'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Archive, Loader2, Package, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Catálogo comercial (multi-rubro, etapa 1) ───────────────────────────────
// Alta y edición de productos con variantes. Precios en pesos en pantalla y en
// centavos hacia el servidor. Cada variante conserva su id al editar.

interface Option { name: string; value: string }
interface Offer { locationId: string; price: number | null; available: boolean }
interface Variant {
  _id?: string
  code: string
  barcode?: string | null
  name?: string
  options?: Option[]
  listPrice: number
  offers?: Offer[]
  isActive?: boolean
}
interface Product {
  _id: string
  kind: 'product' | 'service'
  name: string
  description?: string
  category?: string
  brand?: string
  model?: string
  imageUrl?: string
  attributes?: Option[]
  variants: Variant[]
  status: 'active' | 'archived'
  sortOrder?: number
}

interface Props {
  tenantSlug: string
  locations: { id: string; name: string }[]
  initialProducts: Product[]
}

interface VariantForm {
  id?: string
  code: string
  barcode: string
  name: string
  optionsText: string
  price: string
  perLocation: boolean
  offers: Record<string, { price: string; available: boolean }>
  isActive: boolean
}

interface ProductForm {
  id: string | null
  kind: 'product' | 'service'
  name: string
  description: string
  category: string
  brand: string
  model: string
  imageUrl: string
  attributesText: string
  variants: VariantForm[]
  status: 'active' | 'archived'
}

const field = 'w-full min-h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary'
const label = 'mb-1 block text-xs font-semibold text-muted-foreground'

const pesos = (cents: number) => (cents / 100).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

function toCents(v: string): number | null {
  const n = Number(v.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null
}

function centsToInput(c: number | null | undefined): string {
  return c == null ? '' : String(c / 100).replace('.', ',')
}

/** «Color: Negro; Modelo: iPhone 15» ↔ [{name, value}] */
function parsePairs(text: string): Option[] {
  return text
    .split(/[;\n]/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => {
      const i = p.indexOf(':')
      return i > 0 ? { name: p.slice(0, i).trim(), value: p.slice(i + 1).trim() } : { name: 'Detalle', value: p }
    })
    .filter(o => o.name && o.value)
}

function pairsToText(list: Option[] | undefined): string {
  return (list ?? []).map(o => `${o.name}: ${o.value}`).join('; ')
}

function emptyVariant(): VariantForm {
  return { code: '', barcode: '', name: '', optionsText: '', price: '', perLocation: false, offers: {}, isActive: true }
}

function emptyForm(): ProductForm {
  return { id: null, kind: 'product', name: '', description: '', category: '', brand: '', model: '', imageUrl: '', attributesText: '', variants: [emptyVariant()], status: 'active' }
}

function formFromProduct(p: Product): ProductForm {
  return {
    id: p._id,
    kind: p.kind,
    name: p.name,
    description: p.description ?? '',
    category: p.category ?? '',
    brand: p.brand ?? '',
    model: p.model ?? '',
    imageUrl: p.imageUrl ?? '',
    attributesText: pairsToText(p.attributes),
    status: p.status,
    variants: p.variants.map(v => ({
      id: v._id,
      code: v.code,
      barcode: v.barcode ?? '',
      name: v.name ?? '',
      optionsText: pairsToText(v.options),
      price: centsToInput(v.listPrice),
      perLocation: (v.offers ?? []).length > 0,
      offers: Object.fromEntries((v.offers ?? []).map(o => [o.locationId, { price: centsToInput(o.price), available: o.available !== false }])),
      isActive: v.isActive !== false,
    })),
  }
}

export default function CatalogManager({ tenantSlug, locations, initialProducts }: Props) {
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [form, setForm] = useState<ProductForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [query, setQuery] = useState('')

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return products
      .filter(p => (showArchived ? p.status === 'archived' : p.status !== 'archived'))
      .filter(p => !q || [p.name, p.brand, p.model, p.category, ...p.variants.map(v => v.code), ...p.variants.map(v => v.barcode ?? '')].some(s => (s ?? '').toLowerCase().includes(q)))
  }, [products, showArchived, query])

  function setVariant(i: number, patch: Partial<VariantForm>) {
    setForm(f => f && { ...f, variants: f.variants.map((v, j) => (j === i ? { ...v, ...patch } : v)) })
  }

  function buildBody(f: ProductForm) {
    const variants = f.variants.map(v => {
      const listPrice = toCents(v.price)
      if (listPrice == null) throw new Error(`Precio inválido en la variante ${v.code || '(sin código)'}`)
      const offers = v.perLocation
        ? locations
          .map(l => {
            const o = v.offers[l.id] ?? { price: '', available: true }
            const price = o.price.trim() ? toCents(o.price) : null
            if (o.price.trim() && price == null) throw new Error(`Precio inválido en ${l.name}`)
            return { locationId: l.id, price, available: o.available }
          })
        : []
      return {
        ...(v.id ? { id: v.id } : {}),
        code: v.code,
        barcode: v.barcode.trim() || null,
        name: v.name,
        options: parsePairs(v.optionsText),
        listPrice,
        offers,
        isActive: v.isActive,
      }
    })
    return {
      kind: f.kind,
      name: f.name,
      description: f.description,
      category: f.category,
      brand: f.brand,
      model: f.model,
      imageUrl: f.imageUrl,
      attributes: parsePairs(f.attributesText),
      variants,
      status: f.status,
    }
  }

  async function save() {
    if (!form || saving) return
    let body
    try {
      body = buildBody(form)
    } catch (e) {
      toast.error((e as Error).message)
      return
    }
    setSaving(true)
    try {
      const url = form.id ? `/api/${tenantSlug}/catalog/products/${form.id}` : `/api/${tenantSlug}/catalog/products`
      const res = await fetch(url, { method: form.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar')
      const saved = data.product as Product
      setProducts(list => (form.id ? list.map(p => (p._id === saved._id ? saved : p)) : [saved, ...list]))
      toast.success(form.id ? 'Producto actualizado' : 'Producto creado')
      setForm(null)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function archive(p: Product) {
    const res = await fetch(`/api/${tenantSlug}/catalog/products/${p._id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(data.error || 'No se pudo archivar'); return }
    setProducts(list => list.map(x => (x._id === p._id ? { ...x, status: 'archived' } : x)))
    toast.success('Producto archivado: ya no se vende')
  }

  async function restore(p: Product) {
    const f = formFromProduct(p)
    f.status = 'active'
    let body
    try { body = buildBody(f) } catch (e) { toast.error((e as Error).message); return }
    const res = await fetch(`/api/${tenantSlug}/catalog/products/${p._id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(data.error || 'No se pudo reactivar'); return }
    setProducts(list => list.map(x => (x._id === p._id ? data.product : x)))
    toast.success('Producto reactivado')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setForm(emptyForm())} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">
          <Plus size={16} /> Nuevo producto
        </button>
        <input className={cn(field, 'max-w-xs')} placeholder="Buscar por nombre, marca o código" value={query} onChange={e => setQuery(e.target.value)} />
        <button type="button" onClick={() => setShowArchived(s => !s)} className="min-h-10 rounded-lg border border-border px-3 text-sm">
          {showArchived ? 'Ver activos' : 'Ver archivados'}
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          <Package className="mx-auto mb-2 opacity-50" />
          {showArchived ? 'No hay productos archivados.' : 'Todavía no hay productos. Creá el primero.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Producto</th>
                <th className="px-3 py-2">Categoría</th>
                <th className="px-3 py-2">Variantes</th>
                <th className="px-3 py-2">Precio</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {visible.map(p => {
                const prices = p.variants.map(v => v.listPrice)
                const min = Math.min(...prices)
                const max = Math.max(...prices)
                return (
                  <tr key={p._id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <div className="font-semibold">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{[p.kind === 'service' ? 'Servicio' : null, p.brand, p.model].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td className="px-3 py-2">{p.category || '—'}</td>
                    <td className="px-3 py-2">{p.variants.length}</td>
                    <td className="px-3 py-2 whitespace-nowrap">${pesos(min)}{max !== min ? ` – $${pesos(max)}` : ''}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {p.status === 'archived' ? (
                        <button type="button" onClick={() => restore(p)} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs"><RotateCcw size={13} /> Reactivar</button>
                      ) : (
                        <>
                          <button type="button" onClick={() => setForm(formFromProduct(p))} className="mr-1 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs"><Pencil size={13} /> Editar</button>
                          <button type="button" onClick={() => archive(p)} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs"><Archive size={13} /> Archivar</button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-background p-5 sm:rounded-2xl" data-lenis-prevent>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">{form.id ? 'Editar producto' : 'Nuevo producto'}</h2>
              <button type="button" onClick={() => setForm(null)} aria-label="Cerrar" className="rounded-md p-1 hover:bg-muted"><X size={18} /></button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <span className={label}>Tipo</span>
                <div className="flex gap-2">
                  {(['product', 'service'] as const).map(k => (
                    <button key={k} type="button" aria-pressed={form.kind === k} onClick={() => setForm({ ...form, kind: k })}
                      className={cn('min-h-9 rounded-lg border px-3 text-sm', form.kind === k ? 'border-primary bg-primary/10 font-semibold' : 'border-border')}>
                      {k === 'product' ? 'Producto (con stock)' : 'Servicio (sin stock)'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className={label} htmlFor="cp-name">Nombre</label>
                <input id="cp-name" className={field} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ej: Funda de silicona" />
              </div>
              <div>
                <label className={label} htmlFor="cp-cat">Categoría</label>
                <input id="cp-cat" className={field} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Ej: Fundas" />
              </div>
              <div>
                <label className={label} htmlFor="cp-brand">Marca</label>
                <input id="cp-brand" className={field} value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} />
              </div>
              <div>
                <label className={label} htmlFor="cp-model">Modelo</label>
                <input id="cp-model" className={field} value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} />
              </div>
              <div>
                <label className={label} htmlFor="cp-img">Imagen (link https)</label>
                <input id="cp-img" className={field} value={form.imageUrl} onChange={e => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://…" />
              </div>
              <div className="sm:col-span-2">
                <label className={label} htmlFor="cp-desc">Descripción</label>
                <textarea id="cp-desc" className={cn(field, 'min-h-20 py-2')} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className={label} htmlFor="cp-attr">Características (separadas por punto y coma)</label>
                <input id="cp-attr" className={field} value={form.attributesText} onChange={e => setForm({ ...form, attributesText: e.target.value })} placeholder="Material: Silicona; Garantía: 3 meses" />
              </div>
            </div>

            <h3 className="mt-5 mb-2 text-sm font-bold">Variantes</h3>
            <div className="space-y-3">
              {form.variants.map((v, i) => (
                <div key={v.id ?? `new-${i}`} className="rounded-xl border border-border p-3">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                    <div>
                      <label className={label}>Código</label>
                      <input className={field} value={v.code} onChange={e => setVariant(i, { code: e.target.value })} placeholder="FUN-IP15-NEG" />
                    </div>
                    <div>
                      <label className={label}>Código de barras</label>
                      <input className={field} value={v.barcode} onChange={e => setVariant(i, { barcode: e.target.value })} inputMode="numeric" />
                    </div>
                    <div>
                      <label className={label}>Nombre de la variante</label>
                      <input className={field} value={v.name} onChange={e => setVariant(i, { name: e.target.value })} placeholder="Negra · iPhone 15" />
                    </div>
                    <div>
                      <label className={label}>Precio de lista ($)</label>
                      <input className={field} value={v.price} onChange={e => setVariant(i, { price: e.target.value })} inputMode="decimal" />
                    </div>
                    <div className="sm:col-span-4">
                      <label className={label}>Atributos (separados por punto y coma)</label>
                      <input className={field} value={v.optionsText} onChange={e => setVariant(i, { optionsText: e.target.value })} placeholder="Color: Negro; Modelo: iPhone 15" />
                    </div>
                  </div>

                  {locations.length > 1 && (
                    <label className="mt-2 flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={v.perLocation} onChange={e => setVariant(i, { perLocation: e.target.checked })} />
                      Precio o disponibilidad distinta por sede
                    </label>
                  )}
                  {v.perLocation && (
                    <div className="mt-2 space-y-1">
                      {locations.map(l => {
                        const o = v.offers[l.id] ?? { price: '', available: true }
                        return (
                          <div key={l.id} className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="w-32 truncate">{l.name}</span>
                            <label className="flex items-center gap-1">
                              <input type="checkbox" checked={o.available} onChange={e => setVariant(i, { offers: { ...v.offers, [l.id]: { ...o, available: e.target.checked } } })} />
                              Se vende
                            </label>
                            <input className={cn(field, 'min-h-8 w-32')} value={o.price} placeholder="Precio de lista" inputMode="decimal"
                              onChange={e => setVariant(i, { offers: { ...v.offers, [l.id]: { ...o, price: e.target.value } } })} />
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <div className="mt-2 flex items-center justify-between text-xs">
                    <label className="flex items-center gap-1">
                      <input type="checkbox" checked={v.isActive} onChange={e => setVariant(i, { isActive: e.target.checked })} /> Activa
                    </label>
                    {form.variants.length > 1 && !v.id && (
                      <button type="button" onClick={() => setForm({ ...form, variants: form.variants.filter((_, j) => j !== i) })} className="inline-flex items-center gap-1 text-muted-foreground">
                        <Trash2 size={13} /> Quitar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setForm({ ...form, variants: [...form.variants, emptyVariant()] })} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary">
              <Plus size={15} /> Agregar variante
            </button>
            <p className="mt-1 text-xs text-muted-foreground">Una variante guardada no se borra (pedidos e inventario la usan): para dejar de venderla, desmarcá «Activa».</p>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setForm(null)} className="min-h-10 rounded-lg border border-border px-4 text-sm">Cancelar</button>
              <button type="button" onClick={save} disabled={saving} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                {saving && <Loader2 size={15} className="animate-spin" />} Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
