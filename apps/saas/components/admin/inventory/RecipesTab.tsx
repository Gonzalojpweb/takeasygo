'use client'

// ============================================================================
// Recetas — qué consume cada plato (y cada modificador)
// ============================================================================
// Progressive Zero-Setup: "Sugerir" propone los insumos típicos del plato
// (diccionario TGO) y crea en el catálogo los que falten. El encargado
// confirma o corrige: nada se guarda sin su OK. Guardar crea una versión
// nueva; las ventas pasadas conservan la receta con la que se vendieron.
// ============================================================================

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ChefHat, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react'
import {
  EmptyState,
  SectionCard,
  buttonClass,
  compatibleUnits,
  fieldClass,
  ghostButtonClass,
  inventoryApi,
  pesos,
  type SkuOption,
  useAsyncData,
} from './shared'

interface RecipeRow { skuId: string; quantity: string; unit: string }

interface ItemRecipe {
  recipeId: string
  recipeKey: string
  variantName: string | null
  version: number
  items: Array<{ skuId: string; quantity: number; unit: string; skuName: string }>
  costCents: number
  missingCost: number
  priceCents: number
  foodCostPct: number | null
}

interface MenuItemView {
  menuItemId: string
  name: string
  categoryName: string
  priceCents: number
  variants: Array<{ name: string; priceCents: number }>
  modifiers: string[]
  recipes: ItemRecipe[]
  hasRecipe: boolean
}

interface Suggestion {
  key: string
  name: string
  category: string
  canonicalUnit: string
  businessImpact: string
  quantity: number
  unit: string
  existingSkuId: string | null
}

interface ModifierRule { _id: string; optionName: string; groupName: string | null; items: Array<{ skuId: string; quantity: number; unit: string }>; isActive: boolean }

export default function RecipesTab({
  tenantSlug,
  locationId,
  skus,
  onCatalogChange,
}: {
  tenantSlug: string
  locationId: string
  skus: SkuOption[]
  onCatalogChange: () => void
}) {
  const [editing, setEditing] = useState<{ menuItemId: string; variantName: string | null } | null>(null)
  const [editingModifier, setEditingModifier] = useState<string | null>(null)
  const [onlyMissing, setOnlyMissing] = useState(false)

  const { data, reload: load } = useAsyncData(async () => {
    const [view, sug, rl] = await Promise.all([
      inventoryApi<{ items: MenuItemView[]; coverage: { total: number; withRecipe: number } }>(tenantSlug, `recipes?locationId=${locationId}`),
      inventoryApi<{ dishes: Array<{ menuItemId: string; suggestions: Suggestion[] }> }>(tenantSlug, `recipes/suggestions?locationId=${locationId}`, { silent: true }),
      inventoryApi<{ rules: ModifierRule[] }>(tenantSlug, 'modifier-rules', { silent: true }),
    ])
    return {
      items: view?.items ?? [],
      coverage: view?.coverage ?? { total: 0, withRecipe: 0 },
      suggestions: new Map((sug?.dishes ?? []).map((d) => [d.menuItemId, d.suggestions])),
      rules: rl?.rules ?? [],
    }
  }, `${tenantSlug}|${locationId}`)
  const items = data?.items ?? null
  const coverage = data?.coverage ?? { total: 0, withRecipe: 0 }
  const suggestions = data?.suggestions ?? new Map<string, Suggestion[]>()
  const rules = data?.rules ?? []

  const modifiers = useMemo(() => [...new Set((items ?? []).flatMap((i) => i.modifiers))].sort((a, b) => a.localeCompare(b, 'es')), [items])
  const grouped = useMemo(() => {
    const m = new Map<string, MenuItemView[]>()
    for (const it of items ?? []) {
      if (onlyMissing && it.hasRecipe) continue
      m.set(it.categoryName, [...(m.get(it.categoryName) ?? []), it])
    }
    return [...m.entries()]
  }, [items, onlyMissing])

  if (!items) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-muted-foreground" /></div>

  const pct = coverage.total ? Math.round((coverage.withRecipe / coverage.total) * 100) : 0

  return (
    <div className="space-y-6">
      <SectionCard
        title={`Recetas: ${coverage.withRecipe} de ${coverage.total} platos (${pct} %)`}
        subtitle="Un plato sin receta se vende igual, pero no descuenta insumos. Empezá por los que más se venden."
        actions={
          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} className="h-5 w-5" /> Solo sin receta
          </label>
        }
      >
        {items.length === 0 ? (
          <EmptyState icon={<ChefHat />} text="Esta sede no tiene menú cargado." />
        ) : (
          <div className="space-y-5">
            {grouped.map(([category, list]) => (
              <div key={category}>
                <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">{category}</div>
                <ul className="divide-y divide-border rounded-2xl border border-border">
                  {list.map((it) => {
                    const variants: Array<string | null> = [null, ...it.variants.map((v) => v.name)]
                    return (
                      <li key={it.menuItemId} className="p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="font-bold">{it.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {it.recipes.length === 0
                                ? 'Sin receta'
                                : it.recipes.map((r) => `${r.variantName ?? 'Base'}: costo ${pesos(r.costCents)}${r.foodCostPct !== null ? ` (${r.foodCostPct} %)` : ''}${r.missingCost ? ' · faltan costos' : ''}`).join(' · ')}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {variants.map((v) => (
                              <button
                                key={v ?? 'base'}
                                type="button"
                                onClick={() => setEditing(editing?.menuItemId === it.menuItemId && editing.variantName === v ? null : { menuItemId: it.menuItemId, variantName: v })}
                                className="h-11 rounded-xl border border-border px-3 text-sm font-bold hover:bg-muted"
                              >
                                {v ?? (it.hasRecipe ? 'Editar' : 'Cargar receta')}
                              </button>
                            ))}
                          </div>
                        </div>
                        {editing?.menuItemId === it.menuItemId && (
                          <RecipeEditor
                            key={`${it.menuItemId}|${editing.variantName}`}
                            tenantSlug={tenantSlug}
                            locationId={locationId}
                            item={it}
                            variantName={editing.variantName}
                            skus={skus}
                            suggestions={suggestions.get(it.menuItemId) ?? []}
                            onSaved={() => {
                              setEditing(null)
                              onCatalogChange()
                              load()
                            }}
                            onCatalogChange={onCatalogChange}
                          />
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Modificadores" subtitle={'Qué agrega o quita cada opción del menú ("Extra queso" +30 g; "Sin cebolla" −20 g). Se aplica por porción en todos los platos.'}>
        {modifiers.length === 0 ? (
          <EmptyState icon={<Sparkles />} text="El menú no tiene opciones de personalización." />
        ) : (
          <ul className="divide-y divide-border">
            {modifiers.map((m) => {
              const rule = rules.find((r) => r.optionName.toLowerCase() === m.toLowerCase() && r.groupName === null)
              return (
                <li key={m} className="py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="font-bold">{m}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {rule && rule.isActive ? rule.items.map((i) => `${i.quantity > 0 ? '+' : ''}${i.quantity} ${i.unit} ${skus.find((s) => s._id === i.skuId)?.name ?? ''}`).join(', ') : 'sin efecto en insumos'}
                      </span>
                    </div>
                    <button type="button" onClick={() => setEditingModifier(editingModifier === m ? null : m)} className="h-11 rounded-xl border border-border px-3 text-sm font-bold">
                      {rule ? 'Editar' : 'Definir'}
                    </button>
                  </div>
                  {editingModifier === m && (
                    <ModifierEditor
                      tenantSlug={tenantSlug}
                      optionName={m}
                      initial={rule?.items ?? []}
                      skus={skus}
                      onSaved={() => {
                        setEditingModifier(null)
                        load()
                      }}
                    />
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  )
}

function RowsEditor({ rows, setRows, skus, allowNegative }: { rows: RecipeRow[]; setRows: (r: RecipeRow[]) => void; skus: SkuOption[]; allowNegative?: boolean }) {
  return (
    <div className="space-y-2">
      {rows.map((row, idx) => {
        const sku = skus.find((s) => s._id === row.skuId)
        const units = sku ? compatibleUnits(sku.canonicalUnit) : []
        const update = (patch: Partial<RecipeRow>) => setRows(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
        return (
          <div key={idx} className="flex flex-wrap items-center gap-2">
            <select
              value={row.skuId}
              onChange={(e) => {
                const s = skus.find((x) => x._id === e.target.value)
                update({ skuId: e.target.value, unit: s ? (s.canonicalUnit === 'kg' ? 'g' : s.canonicalUnit === 'l' ? 'ml' : s.canonicalUnit) : row.unit })
              }}
              className={`${fieldClass} min-w-[12rem] flex-1`}
              aria-label="Insumo"
            >
              <option value="">Insumo…</option>
              {skus.filter((s) => s.isActive).map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
            <input
              inputMode="decimal"
              value={row.quantity}
              onChange={(e) => update({ quantity: e.target.value })}
              className={`${fieldClass} w-28`}
              placeholder={allowNegative ? '±30' : '150'}
              aria-label="Cantidad por porción"
            />
            <select value={row.unit} onChange={(e) => update({ unit: e.target.value })} className={`${fieldClass} w-20`} aria-label="Unidad">
              {(units.length ? units : ['g']).map((u) => <option key={u} value={u}>{u === 'unit' ? 'u.' : u}</option>)}
            </select>
            <button type="button" onClick={() => setRows(rows.filter((_, i) => i !== idx))} className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border" aria-label="Quitar insumo">
              <Trash2 size={16} />
            </button>
          </div>
        )
      })}
      <button type="button" onClick={() => setRows([...rows, { skuId: '', quantity: '', unit: 'g' }])} className={ghostButtonClass}>
        <Plus size={16} /> Agregar insumo
      </button>
    </div>
  )
}

function parseRows(rows: RecipeRow[], allowNegative = false) {
  const out: Array<{ skuId: string; quantity: number; unit: string }> = []
  for (const r of rows) {
    if (!r.skuId) continue
    const q = Number(r.quantity.replace(',', '.'))
    if (!Number.isFinite(q) || q === 0 || (!allowNegative && q < 0)) return null
    out.push({ skuId: r.skuId, quantity: q, unit: r.unit })
  }
  return out
}

function RecipeEditor({
  tenantSlug,
  locationId,
  item,
  variantName,
  skus,
  suggestions,
  onSaved,
  onCatalogChange,
}: {
  tenantSlug: string
  locationId: string
  item: MenuItemView
  variantName: string | null
  skus: SkuOption[]
  suggestions: Suggestion[]
  onSaved: () => void
  onCatalogChange: () => void
}) {
  const current = item.recipes.find((r) => r.variantName === variantName)
  const [rows, setRows] = useState<RecipeRow[]>(
    current ? current.items.map((i) => ({ skuId: i.skuId, quantity: String(i.quantity), unit: i.unit })) : [{ skuId: '', quantity: '', unit: 'g' }],
  )
  const [busy, setBusy] = useState(false)

  async function suggest() {
    if (suggestions.length === 0) return toast.info('No reconozco este plato: cargá los insumos a mano')
    setBusy(true)
    const missing = suggestions.filter((s) => !s.existingSkuId)
    let ids: Record<string, string> = {}
    if (missing.length > 0) {
      const res = await inventoryApi<{ skuIds: Record<string, string> }>(tenantSlug, 'setup', {
        method: 'POST',
        body: {
          locationId,
          skus: missing.map((s) => ({ name: s.name, category: s.category, canonicalUnit: s.canonicalUnit, businessImpact: s.businessImpact })),
        },
      })
      if (!res) return setBusy(false)
      ids = res.skuIds
      onCatalogChange()
      toast.success(`Se agregaron ${missing.length} insumos al catálogo`)
    }
    setRows(suggestions.map((s) => ({ skuId: s.existingSkuId ?? ids[s.name] ?? '', quantity: String(s.quantity), unit: s.unit })))
    setBusy(false)
  }

  async function save() {
    const parsed = parseRows(rows)
    if (!parsed) return toast.error('Revisá las cantidades: tienen que ser mayores a 0')
    setBusy(true)
    const res = await inventoryApi(tenantSlug, 'recipes', {
      method: 'PUT',
      body: { kind: 'dish', locationId, menuItemId: item.menuItemId, variantName, name: variantName ? `${item.name} (${variantName})` : item.name, items: parsed },
    })
    setBusy(false)
    if (res) {
      toast.success('Receta guardada (nueva versión)')
      onSaved()
    }
  }

  async function remove() {
    if (!current) return
    setBusy(true)
    const res = await inventoryApi(tenantSlug, `recipes?recipeKey=${encodeURIComponent(current.recipeKey)}`, { method: 'DELETE' })
    setBusy(false)
    if (res) onSaved()
  }

  return (
    <div className="mt-3 space-y-3 rounded-2xl bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-bold">
          {variantName ? `Variante: ${variantName}` : 'Receta base'} · cantidades por porción
          {current && <span className="ml-2 text-xs text-muted-foreground">versión {current.version}</span>}
        </div>
        {!current && suggestions.length > 0 && (
          <button type="button" onClick={suggest} disabled={busy} className={ghostButtonClass}>
            <Sparkles size={16} /> Sugerir insumos
          </button>
        )}
      </div>
      <RowsEditor rows={rows} setRows={setRows} skus={skus} />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={save} disabled={busy} className={buttonClass}>
          {busy && <Loader2 size={16} className="animate-spin" />} Guardar receta
        </button>
        {current && (
          <button type="button" onClick={remove} disabled={busy} className={ghostButtonClass}>
            Quitar receta
          </button>
        )}
      </div>
    </div>
  )
}

function ModifierEditor({
  tenantSlug,
  optionName,
  initial,
  skus,
  onSaved,
}: {
  tenantSlug: string
  optionName: string
  initial: Array<{ skuId: string; quantity: number; unit: string }>
  skus: SkuOption[]
  onSaved: () => void
}) {
  const [rows, setRows] = useState<RecipeRow[]>(
    initial.length ? initial.map((i) => ({ skuId: i.skuId, quantity: String(i.quantity), unit: i.unit })) : [{ skuId: '', quantity: '', unit: 'g' }],
  )
  const [busy, setBusy] = useState(false)

  async function save() {
    const parsed = parseRows(rows, true)
    if (!parsed) return toast.error('Cantidades inválidas (usá negativo para "sin …")')
    if (parsed.length === 0 && initial.length === 0) return toast.error('Agregá al menos un insumo')
    setBusy(true)
    const res = await inventoryApi(tenantSlug, 'modifier-rules', {
      method: 'PUT',
      // Sin filas = desactivar la regla (se conserva la definición anterior).
      body: parsed.length ? { optionName, items: parsed, isActive: true } : { optionName, items: initial, isActive: false },
    })
    setBusy(false)
    if (res) {
      toast.success('Modificador guardado')
      onSaved()
    }
  }

  return (
    <div className="mt-2 space-y-3 rounded-2xl bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">Positivo agrega insumo, negativo lo quita. Por porción.</p>
      <RowsEditor rows={rows} setRows={setRows} skus={skus} allowNegative />
      <button type="button" onClick={save} disabled={busy} className={buttonClass}>
        {busy && <Loader2 size={16} className="animate-spin" />} Guardar
      </button>
    </div>
  )
}
