'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'
import { toPesos } from '@takeasygo/business/browser'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { applyPercent, promoPercentFor, MAX_DISCOUNT_PERCENT, type DiscountTargetKind, type MenuDiscountTarget } from '@/lib/menu-discounts'

// ============================================================================
// Editor de la promo «Descuento %» (21/11/2026)
// ============================================================================
// Árbol de la carta de la sede: categoría → subcategoría → plato → variante.
// Cada fila se marca con su propio %. Lo más específico manda: «30 % a la
// categoría Arepas, pero 40 % a la de 1 sabor». Cada plato/variante muestra el
// % que le queda y el precio final, para que el dueño vea el resultado.
// ============================================================================

interface MenuVariant { name: string; price: number; takeawayPrice?: number }
interface MenuItem { _id: string; name: string; price: number; takeawayPrice?: number; variants?: MenuVariant[] }
interface MenuSub { _id: string; name: string; items: MenuItem[] }
interface MenuCat { _id: string; name: string; items: MenuItem[]; subcategories: MenuSub[] }

interface Props {
  tenantSlug: string
  locationId: string
  locations: { _id: string; name: string }[]
  onLocationChange: (locationId: string) => void
  value: MenuDiscountTarget[]
  onChange: (targets: MenuDiscountTarget[]) => void
}

type Ref = { kind: DiscountTargetKind; categoryId?: string; subcategoryId?: string; itemId?: string; variantName?: string }

const keyOf = (t: Ref) => {
  if (t.kind === 'category') return `c:${t.categoryId}`
  if (t.kind === 'subcategory') return `s:${t.subcategoryId}`
  if (t.kind === 'item') return `i:${t.itemId}`
  return `v:${t.itemId}:${t.variantName}`
}

const ars = (cents: number) => `$${toPesos(cents).toLocaleString('es-AR')}`

export default function DiscountTargetsEditor({ tenantSlug, locationId, locations, onLocationChange, value, onChange }: Props) {
  const [menu, setMenu] = useState<MenuCat[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [bulk, setBulk] = useState('')

  useEffect(() => {
    if (!locationId) { setMenu([]); return }
    let alive = true
    setLoading(true)
    fetch(`/api/${tenantSlug}/menu?locationId=${locationId}`)
      .then(r => (r.ok ? r.json() : { menu: { categories: [] } }))
      .then(data => {
        if (!alive) return
        const mapItem = (it: any): MenuItem => ({
          _id: String(it._id),
          name: it.name,
          price: Number(it.price) || 0,
          takeawayPrice: it.takeawayPrice != null ? Number(it.takeawayPrice) : undefined,
          variants: (it.variants ?? []).map((v: any) => ({ name: v.name, price: Number(v.price) || 0, takeawayPrice: v.takeawayPrice != null ? Number(v.takeawayPrice) : undefined })),
        })
        setMenu((data.menu?.categories ?? []).map((c: any) => ({
          _id: String(c._id),
          name: c.name,
          items: (c.items ?? []).map(mapItem),
          subcategories: (c.subcategories ?? []).map((s: any) => ({ _id: String(s._id), name: s.name, items: (s.items ?? []).map(mapItem) })),
        })))
      })
      .catch(() => { if (alive) setMenu([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [tenantSlug, locationId])

  const byKey = useMemo(() => new Map(value.map(t => [keyOf(t as Ref), t])), [value])

  function setTarget(ref: Ref, percent: number | null) {
    const k = keyOf(ref)
    const rest = value.filter(t => keyOf(t as Ref) !== k)
    if (percent == null) return onChange(rest)
    const pct = Math.min(MAX_DISCOUNT_PERCENT, Math.max(0, percent))
    onChange([...rest, { ...ref, percent: pct }])
  }

  function toggle(ref: Ref) {
    const k = keyOf(ref)
    if (byKey.has(k)) setTarget(ref, null)
    else setTarget(ref, Number(bulk) > 0 ? Number(bulk) : 10)
  }

  function applyBulk() {
    const pct = Number(bulk)
    if (!(pct > 0)) return
    onChange(value.map(t => ({ ...t, percent: Math.min(MAX_DISCOUNT_PERCENT, pct) })))
  }

  const toggleOpen = (id: string) => setOpen(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const q = query.trim().toLowerCase()
  const itemMatches = (it: MenuItem) => !q || it.name.toLowerCase().includes(q) || (it.variants ?? []).some(v => v.name.toLowerCase().includes(q))
  const promoLike = { type: 'discount', discountTargets: value }

  // Función (no componente): un componente definido acá adentro se remontaría
  // en cada render y el campo del % perdería el foco al escribir.
  function renderRow({ refT, label, depth, price, inheritedFrom, expandable, expanded, onExpand }: {
    refT: Ref
    label: string
    depth: number
    /** Precio de lista (plato o variante) para mostrar el resultado. */
    price?: number
    inheritedFrom?: Omit<Ref, 'kind'> & { variantName?: string }
    expandable?: boolean
    expanded?: boolean
    onExpand?: () => void
  }) {
    const k = keyOf(refT)
    const own = byKey.get(k)
    const effective = inheritedFrom ? promoPercentFor(promoLike, inheritedFrom) : null
    return (
      <div key={k} className={cn('flex items-center gap-2 py-1.5 pr-2 rounded-lg', own ? 'bg-green-500/5' : 'hover:bg-muted/40')} style={{ paddingLeft: 8 + depth * 18 }}>
        {expandable ? (
          <button type="button" onClick={onExpand} className="text-muted-foreground hover:text-foreground shrink-0" aria-label={expanded ? 'Cerrar' : 'Abrir'}>
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : <span className="w-[14px] shrink-0" />}
        <input type="checkbox" checked={!!own} onChange={() => toggle(refT)} className="rounded shrink-0" />
        <span className={cn('text-xs flex-1 min-w-0 truncate', depth === 0 ? 'font-bold' : depth === 1 && refT.kind === 'subcategory' ? 'font-semibold' : '')} title={label}>
          {label}
        </span>
        {price != null && price > 0 && (
          effective ? (
            <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">
              <span className="line-through">{ars(price)}</span>{' '}
              <span className="font-bold text-green-600">{ars(applyPercent(price, effective))}</span>
              {!own && <span className="ml-1 opacity-70">({effective} % heredado)</span>}
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground shrink-0">{ars(price)}</span>
          )
        )}
        <div className="relative w-16 shrink-0">
          <Input
            type="number"
            min={1}
            max={MAX_DISCOUNT_PERCENT}
            value={own ? own.percent : ''}
            placeholder="—"
            onChange={e => {
              const v = e.target.value
              setTarget(refT, v === '' ? null : Number(v))
            }}
            className="h-7 text-xs pr-5"
          />
          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">%</span>
        </div>
      </div>
    )
  }

  function renderItem(it: MenuItem, cat: MenuCat, sub: MenuSub | null, depth: number) {
    if (!itemMatches(it)) return null
    const variants = it.variants ?? []
    const base = { categoryId: cat._id, subcategoryId: sub?._id, itemId: it._id }
    const isOpen = open.has(it._id) || (!!q && variants.length > 0)
    return (
      <div key={it._id}>
        {renderRow({
          refT: { kind: 'item', ...base },
          label: variants.length > 0 ? `${it.name} (${variants.length} variantes)` : it.name,
          depth,
          price: variants.length > 0 ? undefined : it.price,
          inheritedFrom: variants.length > 0 ? undefined : base,
          expandable: variants.length > 0,
          expanded: isOpen,
          onExpand: () => toggleOpen(it._id),
        })}
        {isOpen && variants.map(v => renderRow({
          refT: { kind: 'variant', ...base, variantName: v.name },
          label: v.name,
          depth: depth + 1,
          price: v.price,
          inheritedFrom: { ...base, variantName: v.name },
        }))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {locations.length > 1 && (
        <select
          value={locationId}
          onChange={e => onLocationChange(e.target.value)}
          className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm"
        >
          {locations.map(loc => <option key={loc._id} value={loc._id}>{loc.name}</option>)}
        </select>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar plato o variante" className="h-8 pl-7 text-xs" />
        </div>
        <div className="flex items-center gap-1.5">
          <div className="relative w-16">
            <Input type="number" min={1} max={MAX_DISCOUNT_PERCENT} value={bulk} onChange={e => setBulk(e.target.value)} placeholder="30" className="h-8 text-xs pr-5" />
            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">%</span>
          </div>
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs" disabled={!(Number(bulk) > 0) || value.length === 0} onClick={applyBulk}>
            Mismo % a todo lo marcado
          </Button>
        </div>
      </div>

      <div className="max-h-80 overflow-y-auto rounded-xl border border-border p-1.5">
        {loading ? (
          <p className="text-center py-6 text-xs text-muted-foreground">Cargando la carta…</p>
        ) : menu.length === 0 ? (
          <p className="text-center py-6 text-xs text-muted-foreground">No hay categorías en la carta de esta sede</p>
        ) : menu.map(cat => {
          const catOpen = open.has(cat._id) || !!q
          const visibleItems = cat.items.filter(itemMatches)
          const visibleSubs = cat.subcategories.filter(s => !q || s.items.some(itemMatches))
          if (q && visibleItems.length === 0 && visibleSubs.length === 0) return null
          return (
            <div key={cat._id}>
              {renderRow({ refT: { kind: 'category', categoryId: cat._id }, label: cat.name, depth: 0, expandable: true, expanded: catOpen, onExpand: () => toggleOpen(cat._id) })}
              {catOpen && (
                <>
                  {cat.items.map(it => renderItem(it, cat, null, 1))}
                  {visibleSubs.map(sub => {
                    const subOpen = open.has(sub._id) || !!q
                    return (
                      <div key={sub._id}>
                        {renderRow({ refT: { kind: 'subcategory', categoryId: cat._id, subcategoryId: sub._id }, label: sub.name, depth: 1, expandable: true, expanded: subOpen, onExpand: () => toggleOpen(sub._id) })}
                        {subOpen && sub.items.map(it => renderItem(it, cat, sub, 2))}
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-[10px] text-muted-foreground/80 leading-relaxed pl-1">
        Marcá una categoría para descontar todo lo que tiene, o abrí un plato y poné un % distinto a cada variante.
        Lo más específico manda (variante &gt; plato &gt; subcategoría &gt; categoría). El % va sobre el precio del plato o de la variante:
        los agregados de la personalización suman su precio normal. Si dos promos de descuento tocan el mismo plato, vale la de mayor %.
      </p>
    </div>
  )
}
