'use client'

// ============================================================================
// «Composición» (Élite) — armador de una pantalla con módulos
// ============================================================================
// El comercio elige y ordena módulos (encabezado, producto estrella, grilla,
// combo, promo, bebidas, lista de precios, ilustración y QR). Los datos salen
// del catálogo: acá solo se elige QUÉ mostrar. Una composición es una sola
// pantalla: lo recomendable son 3 a 5 módulos.
// ============================================================================
import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import AdsMediaUpload, { type AdsMediaValue } from '@/components/media/AdsMediaUpload'

type Channel = 'dine-in' | 'takeaway'
type Module =
  | { type: 'brand-header'; config: { tagline: string; showLogo: boolean } }
  | { type: 'hero-product'; config: { productId: string; priceChannel: Channel; badge: string } }
  | { type: 'product-grid'; config: { productIds: string[]; priceChannel: Channel; showDescriptions: boolean } }
  | { type: 'combo-highlight'; config: { comboId: string; badge: string } }
  | { type: 'promo-banner'; config: { promotionId: string; headline: string } }
  | { type: 'drinks-row'; config: { productIds: string[]; priceChannel: Channel } }
  | { type: 'price-list'; config: { categoryIds: string[]; priceChannel: Channel; showSubcategories: boolean } }
  | { type: 'illustration-block'; config: { imageUrl: string; text: string; imagePosition: 'left' | 'right' | 'top' | 'bottom' } }
  | { type: 'qr-cta'; config: { headline: string; subtext: string } }

export interface CompositionConfig { style: 'brand' | 'dark' | 'light'; pageSeconds: number; showQr: boolean; modules: Module[] }
export interface CompositionPiece { _id: string; title: string; locationId: string | null; isActive: boolean; template: { kind: 'composition'; config: CompositionConfig } | null }
interface Loc { _id: string; name: string }
interface Catalog {
  categories: Array<{ _id: string; name: string; isAvailable: boolean; products: number }>
  products: Array<{ _id: string; name: string; category: string; hasPhoto: boolean; isAvailable: boolean }>
  combos: Array<{ _id: string; name: string }>
  promotions: Array<{ _id: string; title: string }>
}

const inputCls = 'w-full min-h-[44px] rounded-xl border border-border bg-background px-3 text-base sm:text-sm'
const LABEL: Record<Module['type'], { name: string; hint: string }> = {
  'brand-header': { name: 'Encabezado', hint: 'Logo, nombre y una frase' },
  'hero-product': { name: 'Producto estrella', hint: 'Un producto grande con foto' },
  'product-grid': { name: 'Grilla de productos', hint: 'De 1 a 8 productos con foto' },
  'combo-highlight': { name: 'Combo', hint: 'Un combo y lo que incluye' },
  'promo-banner': { name: 'Promo', hint: 'Una promo; se apaga sola al vencer' },
  'drinks-row': { name: 'Fila de bebidas', hint: 'Hasta 10, compacta' },
  'price-list': { name: 'Lista de precios', hint: 'Sin fotos: ideal para vinos y bebidas' },
  'illustration-block': { name: 'Ilustración', hint: 'Una imagen tuya con texto' },
  'qr-cta': { name: 'QR para pedir', hint: 'QR grande con llamado a la acción' },
}
const ORDER = Object.keys(LABEL) as Module['type'][]

function emptyModule(type: Module['type']): Module {
  switch (type) {
    case 'brand-header': return { type, config: { tagline: '', showLogo: true } }
    case 'hero-product': return { type, config: { productId: '', priceChannel: 'dine-in', badge: '' } }
    case 'product-grid': return { type, config: { productIds: [], priceChannel: 'dine-in', showDescriptions: false } }
    case 'combo-highlight': return { type, config: { comboId: '', badge: '' } }
    case 'promo-banner': return { type, config: { promotionId: '', headline: '' } }
    case 'drinks-row': return { type, config: { productIds: [], priceChannel: 'dine-in' } }
    case 'price-list': return { type, config: { categoryIds: [], priceChannel: 'dine-in', showSubcategories: true } }
    case 'illustration-block': return { type, config: { imageUrl: '', text: '', imagePosition: 'left' } }
    case 'qr-cta': return { type, config: { headline: 'Pedí desde tu celular', subtext: 'Escaneá el QR y hacé tu pedido' } }
  }
}

/** Qué le falta a un módulo para poder guardarlo (null = completo). */
function missing(m: Module): string | null {
  switch (m.type) {
    case 'hero-product': return m.config.productId ? null : 'elegí el producto'
    case 'product-grid': case 'drinks-row': return m.config.productIds.length ? null : 'elegí al menos un producto'
    case 'combo-highlight': return m.config.comboId ? null : 'elegí el combo'
    case 'promo-banner': return m.config.promotionId ? null : 'elegí la promo'
    case 'price-list': return m.config.categoryIds.length ? null : 'elegí al menos una categoría'
    case 'illustration-block': return m.config.imageUrl ? null : 'subí la imagen'
    default: return null
  }
}

function ProductPicker({ products, value, max, onChange }: { products: Catalog['products']; value: string[]; max: number; onChange: (ids: string[]) => void }) {
  const [q, setQ] = useState('')
  const list = products.filter((p) => !q || `${p.name} ${p.category}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="space-y-1.5">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto…" aria-label="Buscar producto" className={inputCls} />
      <p className="text-xs text-muted-foreground">{value.length} de {max} elegidos</p>
      <ul className="max-h-56 overflow-y-auto rounded-xl border border-border">
        {list.map((p) => {
          const on = value.includes(p._id)
          return (
            <li key={p._id}>
              <label className="flex min-h-[40px] cursor-pointer items-center gap-2 px-2 text-sm">
                <input type="checkbox" className="h-5 w-5 shrink-0" checked={on} disabled={!on && value.length >= max}
                  onChange={() => onChange(on ? value.filter((x) => x !== p._id) : [...value, p._id])} />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{p.category}{p.hasPhoto ? '' : ' · sin foto'}{p.isAvailable ? '' : ' · pausado'}</span>
              </label>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default function CompositionForm({ tenantSlug, locations, piece, onClose, onSaved }: {
  tenantSlug: string; locations: Loc[]; piece: CompositionPiece | null; onClose: () => void; onSaved: () => void
}) {
  const [title, setTitle] = useState(piece?.title ?? 'Composición')
  const [locationId, setLocationId] = useState(piece?.locationId ?? (locations.length === 1 ? locations[0]._id : ''))
  const [style, setStyle] = useState<CompositionConfig['style']>(piece?.template?.config.style ?? 'brand')
  const [pageSeconds, setPageSeconds] = useState(piece?.template?.config.pageSeconds ?? 10)
  const [showQr, setShowQr] = useState(piece?.template?.config.showQr ?? true)
  const [modules, setModules] = useState<Module[]>(piece?.template?.config.modules ?? [emptyModule('brand-header')])
  const [isActive, setIsActive] = useState(piece?.isActive ?? true)
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!locationId) { setCatalog(null); return }
    let alive = true
    setCatalog(null)
    fetch(`/api/${tenantSlug}/screen-pieces/templates?locationId=${locationId}&catalog=1`).then((r) => r.json())
      .then((d) => { if (alive) setCatalog({ categories: d.categories ?? [], products: d.products ?? [], combos: d.combos ?? [], promotions: d.promotions ?? [] }) })
      .catch(() => { if (alive) setCatalog({ categories: [], products: [], combos: [], promotions: [] }) })
    return () => { alive = false }
  }, [tenantSlug, locationId])

  const noPhoto = useMemo(() => (catalog ? catalog.products.filter((p) => !p.hasPhoto).length : 0), [catalog])
  const update = (i: number, m: Module) => setModules((list) => list.map((x, k) => (k === i ? m : x)))
  const move = (i: number, d: -1 | 1) => setModules((list) => { const j = i + d; if (j < 0 || j >= list.length) return list; const n = [...list]; [n[i], n[j]] = [n[j], n[i]]; return n })
  const remove = (i: number) => setModules((list) => list.filter((_, k) => k !== i))
  const add = (t: Module['type']) => { if (modules.length >= 12) { toast.error('Máximo 12 módulos'); return } setModules((l) => [...l, emptyModule(t)]) }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!locationId) { toast.error('Elegí la sede'); return }
    const bad = modules.map((m, i) => ({ i, why: missing(m) })).find((x) => x.why)
    if (bad) { toast.error(`Módulo ${bad.i + 1} (${LABEL[modules[bad.i].type].name}): ${bad.why}`); return }
    if (!modules.length) { toast.error('Agregá al menos un módulo'); return }
    setSaving(true)
    try {
      const body = { title, locationId, isActive, template: { kind: 'composition', config: { style, pageSeconds, showQr, modules } } }
      const res = await fetch(piece ? `/api/${tenantSlug}/screen-pieces/${piece._id}` : `/api/${tenantSlug}/screen-pieces/templates`, { method: piece ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar')
      toast.success(piece ? 'Composición actualizada' : 'Composición creada: las pantallas de la sede la muestran desde el próximo minuto')
      onSaved()
    } catch (err) { toast.error((err as Error).message) } finally { setSaving(false) }
  }

  const channelSel = (value: Channel, onPick: (c: Channel) => void) => (
    <select value={value} onChange={(e) => onPick(e.target.value as Channel)} aria-label="Precio" className={inputCls}>
      <option value="dine-in">Precio de salón</option>
      <option value="takeaway">Precio para llevar</option>
    </select>
  )

  function editor(m: Module, i: number) {
    const c = catalog
    switch (m.type) {
      case 'brand-header': return (
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={m.config.tagline} onChange={(e) => update(i, { ...m, config: { ...m.config, tagline: e.target.value } })} maxLength={80} placeholder="Frase (opcional): Smash burgers artesanales" aria-label="Frase" className={inputCls} />
          <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={m.config.showLogo} onChange={(e) => update(i, { ...m, config: { ...m.config, showLogo: e.target.checked } })} /> Mostrar logo</label>
        </div>
      )
      case 'hero-product': return (
        <div className="grid gap-2 sm:grid-cols-3">
          <select value={m.config.productId} onChange={(e) => update(i, { ...m, config: { ...m.config, productId: e.target.value } })} aria-label="Producto" className={`${inputCls} sm:col-span-3`}>
            <option value="">Elegí el producto</option>
            {c?.products.map((p) => <option key={p._id} value={p._id}>{p.name} — {p.category}{p.hasPhoto ? '' : ' (sin foto)'}</option>)}
          </select>
          <input value={m.config.badge} onChange={(e) => update(i, { ...m, config: { ...m.config, badge: e.target.value } })} maxLength={30} placeholder="Etiqueta: NUEVO, MÁS PEDIDA…" aria-label="Etiqueta" className={inputCls} />
          {channelSel(m.config.priceChannel, (v) => update(i, { ...m, config: { ...m.config, priceChannel: v } }))}
        </div>
      )
      case 'product-grid': return (
        <div className="space-y-2">
          {c && <ProductPicker products={c.products} value={m.config.productIds} max={8} onChange={(ids) => update(i, { ...m, config: { ...m.config, productIds: ids } })} />}
          <div className="grid gap-2 sm:grid-cols-2">
            {channelSel(m.config.priceChannel, (v) => update(i, { ...m, config: { ...m.config, priceChannel: v } }))}
            <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={m.config.showDescriptions} onChange={(e) => update(i, { ...m, config: { ...m.config, showDescriptions: e.target.checked } })} /> Mostrar descripciones</label>
          </div>
        </div>
      )
      case 'combo-highlight': return (
        <div className="grid gap-2 sm:grid-cols-2">
          <select value={m.config.comboId} onChange={(e) => update(i, { ...m, config: { ...m.config, comboId: e.target.value } })} aria-label="Combo" className={inputCls}>
            <option value="">{c && !c.combos.length ? 'No hay combos activos' : 'Elegí el combo'}</option>
            {c?.combos.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}
          </select>
          <input value={m.config.badge} onChange={(e) => update(i, { ...m, config: { ...m.config, badge: e.target.value } })} maxLength={30} placeholder="Etiqueta: 2×1, SOLO HOY…" aria-label="Etiqueta" className={inputCls} />
        </div>
      )
      case 'promo-banner': return (
        <div className="grid gap-2 sm:grid-cols-2">
          <select value={m.config.promotionId} onChange={(e) => update(i, { ...m, config: { ...m.config, promotionId: e.target.value } })} aria-label="Promo" className={inputCls}>
            <option value="">{c && !c.promotions.length ? 'No hay promos activas' : 'Elegí la promo'}</option>
            {c?.promotions.map((x) => <option key={x._id} value={x._id}>{x.title}</option>)}
          </select>
          <input value={m.config.headline} onChange={(e) => update(i, { ...m, config: { ...m.config, headline: e.target.value } })} maxLength={60} placeholder="Titular: ¡PROMO DEL DÍA!" aria-label="Titular" className={inputCls} />
        </div>
      )
      case 'drinks-row': return (
        <div className="space-y-2">
          {c && <ProductPicker products={c.products} value={m.config.productIds} max={10} onChange={(ids) => update(i, { ...m, config: { ...m.config, productIds: ids } })} />}
          {channelSel(m.config.priceChannel, (v) => update(i, { ...m, config: { ...m.config, priceChannel: v } }))}
        </div>
      )
      case 'price-list': return (
        <div className="space-y-2">
          <ul className="max-h-56 overflow-y-auto rounded-xl border border-border">
            {c?.categories.map((cat) => {
              const on = m.config.categoryIds.includes(cat._id)
              return (
                <li key={cat._id}>
                  <label className="flex min-h-[40px] items-center gap-2 px-2 text-sm">
                    <input type="checkbox" className="h-5 w-5" checked={on} disabled={!on && m.config.categoryIds.length >= 10} onChange={() => update(i, { ...m, config: { ...m.config, categoryIds: on ? m.config.categoryIds.filter((x) => x !== cat._id) : [...m.config.categoryIds, cat._id] } })} />
                    <span className="flex-1">{cat.name}</span><span className="text-xs text-muted-foreground">{cat.products} productos{cat.isAvailable ? '' : ' · apagada'}</span>
                  </label>
                </li>
              )
            })}
          </ul>
          <div className="grid gap-2 sm:grid-cols-2">
            {channelSel(m.config.priceChannel, (v) => update(i, { ...m, config: { ...m.config, priceChannel: v } }))}
            <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={m.config.showSubcategories} onChange={(e) => update(i, { ...m, config: { ...m.config, showSubcategories: e.target.checked } })} /> Incluir subcategorías</label>
          </div>
        </div>
      )
      case 'illustration-block': {
        const value: AdsMediaValue | null = m.config.imageUrl ? { kind: 'image', url: m.config.imageUrl } as AdsMediaValue : null
        return (
          <div className="space-y-2">
            <AdsMediaUpload endpointBase={`/api/${tenantSlug}/media`} surface="screen" kinds={['image']} value={value} onChange={(v) => update(i, { ...m, config: { ...m.config, imageUrl: v?.url ?? '' } })} label="Imagen" />
            <div className="grid gap-2 sm:grid-cols-2">
              <input value={m.config.text} onChange={(e) => update(i, { ...m, config: { ...m.config, text: e.target.value } })} maxLength={120} placeholder="Texto (opcional)" aria-label="Texto" className={inputCls} />
              <select value={m.config.imagePosition} onChange={(e) => update(i, { ...m, config: { ...m.config, imagePosition: e.target.value as 'left' } })} aria-label="Posición de la imagen" className={inputCls}>
                <option value="left">Imagen a la izquierda</option><option value="right">Imagen a la derecha</option><option value="top">Imagen arriba</option><option value="bottom">Imagen abajo</option>
              </select>
            </div>
          </div>
        )
      }
      case 'qr-cta': return (
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={m.config.headline} onChange={(e) => update(i, { ...m, config: { ...m.config, headline: e.target.value } })} maxLength={60} aria-label="Titular" className={inputCls} />
          <input value={m.config.subtext} onChange={(e) => update(i, { ...m, config: { ...m.config, subtext: e.target.value } })} maxLength={80} aria-label="Texto" className={inputCls} />
        </div>
      )
    }
  }

  return (
    <form onSubmit={save} className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <div>
        <h3 className="font-bold">{piece ? 'Editar composición' : 'Composición'} <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">Élite</span></h3>
        <p className="text-sm text-muted-foreground">Armá una pantalla a tu medida con módulos. Precios, fotos, disponibilidad y promos salen de tu catálogo: lo pausado o fuera de horario no aparece. Es una sola pantalla: lo recomendable son 3 a 5 módulos.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Nombre (solo para vos)<input required value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className={`${inputCls} mt-1`} /></label>
        <label className="text-sm font-medium">Sede
          <select required value={locationId} onChange={(e) => setLocationId(e.target.value)} className={`${inputCls} mt-1`}>
            <option value="">Elegí la sede</option>
            {locations.map((l) => <option key={l._id} value={l._id}>{l.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Estilo
          <select value={style} onChange={(e) => setStyle(e.target.value as CompositionConfig['style'])} className={`${inputCls} mt-1`}>
            <option value="brand">Mi marca (colores y tipografía)</option><option value="dark">Oscuro</option><option value="light">Claro</option>
          </select>
        </label>
        <label className="text-sm font-medium">Segundos en pantalla<input type="number" min={5} max={30} value={pageSeconds} onChange={(e) => setPageSeconds(Math.min(30, Math.max(5, Number(e.target.value) || 10)))} className={`${inputCls} mt-1`} /></label>
      </div>

      {!locationId ? <p className="text-sm text-muted-foreground">Elegí la sede para armar la composición con su carta.</p>
        : !catalog ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" aria-hidden /> Cargando la carta…</p>
          : (
            <>
              {noPhoto > 0 && <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">{noPhoto} productos de esta sede no tienen foto: para mostrarlos sin huecos usá «Lista de precios».</p>}
              <ol className="space-y-3">
                {modules.map((m, i) => (
                  <li key={i} className="rounded-xl border border-border p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-sm font-semibold">{i + 1}. {LABEL[m.type].name}</span>
                      {missing(m) && <span className="text-xs text-amber-700 dark:text-amber-300">· {missing(m)}</span>}
                      <span className="ml-auto flex gap-1">
                        <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir" className="min-h-[40px] min-w-[40px] rounded-lg border border-border disabled:opacity-30"><ArrowUp size={14} className="mx-auto" /></button>
                        <button type="button" onClick={() => move(i, 1)} disabled={i === modules.length - 1} aria-label="Bajar" className="min-h-[40px] min-w-[40px] rounded-lg border border-border disabled:opacity-30"><ArrowDown size={14} className="mx-auto" /></button>
                        <button type="button" onClick={() => remove(i)} aria-label="Quitar módulo" className="min-h-[40px] min-w-[40px] rounded-lg border border-border text-red-600"><Trash2 size={14} className="mx-auto" /></button>
                      </span>
                    </div>
                    {editor(m, i)}
                  </li>
                ))}
              </ol>
              <div>
                <p className="mb-1.5 text-sm font-medium">Agregar módulo</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {ORDER.map((t) => (
                    <button key={t} type="button" onClick={() => add(t)} className="min-h-[44px] rounded-xl border border-border px-3 text-left text-sm">
                      <span className="flex items-center gap-1 font-semibold"><Plus size={14} aria-hidden /> {LABEL[t].name}</span>
                      <span className="block text-xs text-muted-foreground">{LABEL[t].hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

      <div className="flex flex-wrap gap-x-6">
        <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={showQr} onChange={(e) => setShowQr(e.target.checked)} /> QR para pedir (si no agregás el módulo «QR para pedir»)</label>
        <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Activa</label>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="min-h-[44px] flex-1 rounded-xl border border-border text-sm">Cancelar</button>
        <button type="submit" disabled={saving} className="min-h-[44px] flex-1 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60">{saving ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </form>
  )
}
