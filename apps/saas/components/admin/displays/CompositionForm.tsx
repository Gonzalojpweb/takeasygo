'use client'

// ============================================================================
// «Composición» (Élite) — armador de una pantalla con módulos
// ============================================================================
// El comercio elige y ordena módulos (encabezado, producto estrella, grilla,
// combo, promo, bebidas, lista de precios, ilustración y QR). Los datos salen
// del catálogo: acá solo se elige QUÉ mostrar. Una composición es una sola
// pantalla: lo recomendable son 3 a 5 módulos.
// v2 (tótems): lienzo de diseño (orientación y tamaño reales), animaciones por
// módulo, Ken Burns, transición entre páginas, plantillas para empezar, aviso
// de pantallas con otra orientación y vista previa real (el reproductor en un
// iframe, con la proporción elegida).
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2, AlertTriangle, Monitor, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import AdsMediaUpload, { type AdsMediaValue } from '@/components/media/AdsMediaUpload'

type Channel = 'dine-in' | 'takeaway'
type Enter = 'auto' | 'none' | 'fade' | 'fadeUp' | 'scaleIn' | 'slideLeft' | 'slideRight' | 'stagger'
interface Anim { enter: Enter; duration: number; delay: number; ease: string; stagger: number }
type Module = (
  | { type: 'brand-header'; config: { tagline: string; showLogo: boolean } }
  | { type: 'hero-product'; config: { productId: string; priceChannel: Channel; badge: string; kenBurns?: boolean; showDiscount?: boolean } }
  | { type: 'product-grid'; config: { productIds: string[]; priceChannel: Channel; showDescriptions: boolean } }
  | { type: 'combo-highlight'; config: { comboId: string; badge: string; kenBurns?: boolean } }
  | { type: 'promo-banner'; config: { promotionId: string; headline: string; kenBurns?: boolean; showDiscount?: boolean } }
  | { type: 'drinks-row'; config: { productIds: string[]; priceChannel: Channel } }
  | { type: 'price-list'; config: { categoryIds: string[]; priceChannel: Channel; showSubcategories: boolean } }
  | { type: 'illustration-block'; config: { imageUrl: string; text: string; imagePosition: 'left' | 'right' | 'top' | 'bottom'; kenBurns?: boolean } }
  | { type: 'qr-cta'; config: { headline: string; subtext: string } }
) & { animation?: Anim }

type Orientation = 'landscape' | 'portrait'
type Transition = 'fade' | 'slide' | 'zoom' | 'none'
export interface CompositionConfig {
  style: 'brand' | 'dark' | 'light'; pageSeconds: number; showQr: boolean; modules: Module[]
  orientation?: Orientation; designWidth?: number; designHeight?: number; transition?: Transition
}

const PRESETS = [
  { id: 'tv-1080', label: 'TV horizontal 1920 × 1080', w: 1920, h: 1080 },
  { id: 'tv-720', label: 'TV horizontal 1280 × 720', w: 1280, h: 720 },
  { id: 'totem-1080', label: 'Tótem vertical 1080 × 1920', w: 1080, h: 1920 },
  { id: 'totem-720', label: 'Tótem vertical chico 720 × 1280', w: 720, h: 1280 },
] as const
const ENTER_LABEL: Record<Enter, string> = {
  auto: 'Recomendada', fade: 'Aparecer', fadeUp: 'Subir', scaleIn: 'Zoom', slideLeft: 'Entrar desde la derecha', slideRight: 'Entrar desde la izquierda', stagger: 'En cascada', none: 'Sin animación',
}
const SPEEDS = [{ v: 1.2, l: 'Lenta' }, { v: 0.8, l: 'Normal' }, { v: 0.5, l: 'Rápida' }]
const DELAYS = [{ v: 0, l: 'Sin espera' }, { v: 0.4, l: 'Espera corta' }, { v: 1, l: 'Espera larga' }]
const DISPLAY_URL = (process.env.NEXT_PUBLIC_DISPLAY_URL || 'https://display.takeasygo.com').replace(/\/+$/, '')

/** Plantillas para empezar: solo la estructura; los productos los elige el comercio. */
const STARTERS: Array<{ id: string; label: string; hint: string; preset: (typeof PRESETS)[number]['id']; types: Module['type'][] }> = [
  { id: 'totem', label: 'Tótem: estrella + carta + QR', hint: 'Vertical, ideal para la entrada', preset: 'totem-1080', types: ['brand-header', 'hero-product', 'price-list', 'qr-cta'] },
  { id: 'tv', label: 'TV: estrella + grilla + promo', hint: 'Horizontal, para el salón', preset: 'tv-1080', types: ['brand-header', 'hero-product', 'product-grid', 'promo-banner'] },
  { id: 'board', label: 'Pizarra de precios', hint: 'Sin fotos: vinos, bebidas, parrilla', preset: 'totem-1080', types: ['brand-header', 'price-list', 'qr-cta'] },
]
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
    case 'hero-product': return { type, config: { productId: '', priceChannel: 'dine-in', badge: '', kenBurns: true, showDiscount: true } }
    case 'product-grid': return { type, config: { productIds: [], priceChannel: 'dine-in', showDescriptions: false } }
    case 'combo-highlight': return { type, config: { comboId: '', badge: '', kenBurns: false } }
    case 'promo-banner': return { type, config: { promotionId: '', headline: '', kenBurns: true, showDiscount: true } }
    case 'drinks-row': return { type, config: { productIds: [], priceChannel: 'dine-in' } }
    case 'price-list': return { type, config: { categoryIds: [], priceChannel: 'dine-in', showSubcategories: true } }
    case 'illustration-block': return { type, config: { imageUrl: '', text: '', imagePosition: 'left', kenBurns: false } }
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
  const saved = piece?.template?.config
  const [designWidth, setDesignWidth] = useState(saved?.designWidth ?? (saved?.orientation === 'portrait' ? 1080 : 1920))
  const [designHeight, setDesignHeight] = useState(saved?.designHeight ?? (saved?.orientation === 'portrait' ? 1920 : 1080))
  const orientation: Orientation = designHeight > designWidth ? 'portrait' : 'landscape'
  const [transition, setTransition] = useState<Transition>(saved?.transition ?? 'fade')
  const [devices, setDevices] = useState<Array<{ name: string; orientation: Orientation; locationId: string | null }>>([])
  const presetId = PRESETS.find((x) => x.w === designWidth && x.h === designHeight)?.id ?? 'custom'
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

  useEffect(() => {
    fetch(`/api/${tenantSlug}/displays`).then((r) => r.json()).then((d) => setDevices((d.devices || []).map((x: { name: string; orientation: Orientation; locationId: string | null }) => ({ name: x.name, orientation: x.orientation, locationId: x.locationId })))).catch(() => {})
  }, [tenantSlug])
  /** Pantallas de la sede con otra orientación: no la van a mostrar. */
  const mismatched = devices.filter((d) => d.locationId === locationId && d.orientation !== orientation)

  const config = { style, pageSeconds, showQr, orientation, designWidth, designHeight, transition, modules }
  const ready = !!locationId && modules.length > 0 && modules.every((m) => !missing(m))

  // ── Vista previa: el reproductor real en un iframe, con la proporción elegida ──
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [frameReady, setFrameReady] = useState(false)
  const [previewMsg, setPreviewMsg] = useState<string | null>(null)
  useEffect(() => {
    const onMsg = (e: MessageEvent) => { if (e.origin === DISPLAY_URL && (e.data as { type?: string })?.type === 'tgd-preview-ready') setFrameReady(true) }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])
  const configKey = JSON.stringify(config)
  useEffect(() => {
    if (!ready || !frameReady) return
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/${tenantSlug}/screen-pieces/preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locationId, template: { kind: 'composition', config } }) })
        const data = await res.json()
        if (!res.ok) { setPreviewMsg(data.error || 'No se pudo armar la vista previa'); return }
        setPreviewMsg(null)
        frameRef.current?.contentWindow?.postMessage({ type: 'tgd-preview', board: data.template, orderUrl: data.orderUrl, timezone: data.timezone }, DISPLAY_URL)
      } catch { setPreviewMsg('No se pudo armar la vista previa') }
    }, 700)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey, ready, frameReady, locationId, tenantSlug])

  const applyStarter = (st: (typeof STARTERS)[number]) => {
    const pr = PRESETS.find((x) => x.id === st.preset)!
    setDesignWidth(pr.w); setDesignHeight(pr.h)
    setModules(st.types.map(emptyModule))
  }
  const pickPreset = (id: string) => {
    const pr = PRESETS.find((x) => x.id === id)
    if (pr) { setDesignWidth(pr.w); setDesignHeight(pr.h) }
  }

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
      const body = { title, locationId, isActive, template: { kind: 'composition', config } }
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
        <p className="text-sm text-muted-foreground">Armá una pantalla a tu medida con módulos, para TV o tótem. Precios, fotos, disponibilidad y promos salen de tu catálogo: lo pausado o fuera de horario no aparece. Si los módulos no entran en una pantalla, se reparten en páginas.</p>
      </div>
      {!piece && (
        <div>
          <p className="mb-1.5 text-sm font-medium">Empezar con una plantilla</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {STARTERS.map((st) => (
              <button key={st.id} type="button" onClick={() => applyStarter(st)} className="min-h-[44px] rounded-xl border border-border px-3 py-2 text-left text-sm">
                <span className="block font-semibold">{st.label}</span>
                <span className="block text-xs text-muted-foreground">{st.hint}</span>
              </button>
            ))}
          </div>
        </div>
      )}
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
        <label className="text-sm font-medium">Segundos por página<input type="number" min={5} max={30} value={pageSeconds} onChange={(e) => setPageSeconds(Math.min(30, Math.max(5, Number(e.target.value) || 10)))} className={`${inputCls} mt-1`} /></label>
      </div>

      <fieldset className="rounded-xl border border-border p-3">
        <legend className="px-1 text-sm font-medium">Formato de la pantalla</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">Tamaño de diseño
            <select value={presetId} onChange={(e) => (e.target.value === 'custom' ? null : pickPreset(e.target.value))} className={`${inputCls} mt-1`}>
              {PRESETS.map((pr) => <option key={pr.id} value={pr.id}>{pr.label}</option>)}
              <option value="custom">Otro tamaño…</option>
            </select>
          </label>
          <div className="text-sm font-medium">Ancho × alto (px)
            <div className="mt-1 flex items-center gap-2">
              <input type="number" min={480} max={3840} value={designWidth} onChange={(e) => setDesignWidth(Math.min(3840, Math.max(480, Number(e.target.value) || 1920)))} aria-label="Ancho" className={inputCls} />
              <span>×</span>
              <input type="number" min={480} max={3840} value={designHeight} onChange={(e) => setDesignHeight(Math.min(3840, Math.max(480, Number(e.target.value) || 1080)))} aria-label="Alto" className={inputCls} />
            </div>
          </div>
          <p className="flex items-center gap-2 text-sm">{orientation === 'portrait' ? <><Smartphone size={16} aria-hidden /> Vertical (tótem)</> : <><Monitor size={16} aria-hidden /> Horizontal (TV)</>}</p>
          <label className="text-sm font-medium">Cambio de página
            <select value={transition} onChange={(e) => setTransition(e.target.value as Transition)} className={`${inputCls} mt-1`}>
              <option value="fade">Fundido</option><option value="slide">Deslizar</option><option value="zoom">Zoom suave</option><option value="none">Sin transición</option>
            </select>
          </label>
        </div>
        {mismatched.length > 0 && (
          <p className="mt-2 flex items-start gap-2 rounded-lg bg-amber-500/10 px-2 py-1.5 text-xs text-amber-800 dark:text-amber-200">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
            {mismatched.map((d) => d.name).join(', ')} {mismatched.length === 1 ? 'está' : 'están'} en {orientation === 'portrait' ? 'horizontal' : 'vertical'}: no {mismatched.length === 1 ? 'la va' : 'la van'} a mostrar. Cambiá la orientación de la pantalla o armá otra composición.
          </p>
        )}
      </fieldset>

      {locationId && (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Vista previa <span className="font-normal text-muted-foreground">({designWidth} × {designHeight})</span></p>
          <div className="mx-auto overflow-hidden rounded-xl border border-border bg-black" style={{ aspectRatio: `${designWidth} / ${designHeight}`, width: orientation === 'portrait' ? `min(100%, calc(60vh * ${designWidth} / ${designHeight}))` : '100%' }}>
            <iframe ref={frameRef} src={`${DISPLAY_URL}/preview`} title="Vista previa de la composición" className="h-full w-full border-0" onLoad={() => setFrameReady(true)} />
          </div>
          <p className="text-xs text-muted-foreground">{previewMsg ?? (ready ? 'Se actualiza sola al cambiar algo. Es el mismo reproductor que usa la pantalla.' : 'Completá los módulos para ver la vista previa.')}</p>
        </div>
      )}

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
                    <details className="mt-2 rounded-lg bg-muted/50 px-2 py-1">
                      <summary className="min-h-[36px] cursor-pointer text-xs font-medium leading-[36px]">Animación{m.animation && m.animation.enter !== 'auto' ? `: ${ENTER_LABEL[m.animation.enter]}` : ''}</summary>
                      <div className="grid gap-2 pb-2 sm:grid-cols-3">
                        <select value={m.animation?.enter ?? 'auto'} aria-label="Entrada" className={inputCls} onChange={(e) => update(i, { ...m, animation: { ...(m.animation ?? { duration: 0.8, delay: 0, ease: 'power3.out', stagger: 0.08 }), enter: e.target.value as Enter } } as Module)}>
                          {(Object.keys(ENTER_LABEL) as Enter[]).map((k) => <option key={k} value={k}>{ENTER_LABEL[k]}</option>)}
                        </select>
                        <select value={String(m.animation?.duration ?? 0.8)} aria-label="Velocidad" className={inputCls} onChange={(e) => update(i, { ...m, animation: { ...(m.animation ?? { enter: 'auto', delay: 0, ease: 'power3.out', stagger: 0.08 }), duration: Number(e.target.value) } } as Module)}>
                          {SPEEDS.map((x) => <option key={x.v} value={String(x.v)}>{x.l}</option>)}
                        </select>
                        <select value={String(m.animation?.delay ?? 0)} aria-label="Espera" className={inputCls} onChange={(e) => update(i, { ...m, animation: { ...(m.animation ?? { enter: 'auto', duration: 0.8, ease: 'power3.out', stagger: 0.08 }), delay: Number(e.target.value) } } as Module)}>
                          {DELAYS.map((x) => <option key={x.v} value={String(x.v)}>{x.l}</option>)}
                        </select>
                      </div>
                      {(m.type === 'hero-product' || m.type === 'promo-banner' || m.type === 'combo-highlight' || m.type === 'illustration-block') && (
                        <div className="flex flex-wrap gap-x-5 pb-1">
                          <label className="flex min-h-[40px] items-center gap-2 text-xs"><input type="checkbox" className="h-5 w-5" checked={m.config.kenBurns ?? (m.type === 'hero-product' || m.type === 'promo-banner')} onChange={(e) => update(i, { ...m, config: { ...m.config, kenBurns: e.target.checked } } as Module)} /> Zoom lento en la foto (Ken Burns)</label>
                          {(m.type === 'hero-product' || m.type === 'promo-banner') && (
                            <label className="flex min-h-[40px] items-center gap-2 text-xs"><input type="checkbox" className="h-5 w-5" checked={m.config.showDiscount ?? true} onChange={(e) => update(i, { ...m, config: { ...m.config, showDiscount: e.target.checked } } as Module)} /> Sello de descuento (si hay precio anterior)</label>
                          )}
                        </div>
                      )}
                    </details>
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
