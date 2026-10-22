'use client'

// ============================================================================
// Editor de insumos por porción — recetas, preparaciones y modificadores
// ============================================================================
// Filas estables (sin formularios que se expanden), buscador con teclado y
// alta de un insumo nuevo sin salir del panel. Errores junto a cada fila.
// ============================================================================

import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { DraftRow, DraftSku, RowField } from '@/lib/inventory/ui/recipe-draft'
import type { FieldErrors } from '@/lib/inventory/ui/fields'
import { compatibleUnits, recipeDefaultUnit } from '@/lib/inventory/ui/fields'
import { UNIT_SHORT } from '@/lib/inventory/ui/format'
import { Field, SearchPicker, Spinner, btnGhost, btnPrimary, inputClass } from './ui'

export const SKU_CATEGORIES: Array<[string, string]> = [
  ['meat_poultry', 'Carnes y aves'],
  ['fish_seafood', 'Pescados y mariscos'],
  ['vegetables', 'Verduras'],
  ['fruits', 'Frutas'],
  ['dairy', 'Lácteos'],
  ['dry_goods', 'Almacén'],
  ['beverages', 'Bebidas'],
  ['packaging', 'Descartables'],
  ['other', 'Otros'],
]

export interface NewSkuInput {
  name: string
  canonicalUnit: string
  category: string
}

let seq = 0
const rowKey = () => `n${Date.now().toString(36)}${(seq++).toString(36)}`

export default function RowsEditor({
  rows,
  onChange,
  skus,
  errors,
  allowNegative,
  quantityPlaceholder = '150',
  onCreateSku,
  pickerLabel = 'Agregar insumo',
}: {
  rows: DraftRow[]
  onChange: (rows: DraftRow[]) => void
  skus: ReadonlyMap<string, DraftSku>
  errors: Record<string, FieldErrors<RowField>>
  allowNegative?: boolean
  quantityPlaceholder?: string
  /** Si existe, permite crear un insumo que no está en el catálogo. */
  onCreateSku?: (input: NewSkuInput) => Promise<DraftSku | null>
  pickerLabel?: string
}) {
  const [creating, setCreating] = useState<NewSkuInput | null>(null)
  const [busy, setBusy] = useState(false)

  const pickerItems = useMemo(
    () =>
      [...skus.values()]
        .filter((s) => s.isActive !== false && !rows.some((r) => r.skuId === s._id))
        .map((s) => ({ id: s._id, label: s.name, meta: UNIT_SHORT[s.canonicalUnit] })),
    [skus, rows],
  )

  const add = (sku: DraftSku) => {
    if (rows.some((r) => r.skuId === sku._id)) return
    onChange([...rows, { key: rowKey(), skuId: sku._id, quantity: '', unit: recipeDefaultUnit(sku.canonicalUnit) }])
  }

  async function create() {
    if (!creating || !onCreateSku) return
    setBusy(true)
    const sku = await onCreateSku(creating)
    setBusy(false)
    if (sku) {
      add(sku)
      setCreating(null)
    }
  }

  return (
    <div className="space-y-3">
      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((r) => {
            const sku = skus.get(r.skuId)
            const e = errors[r.key] ?? {}
            const units = sku ? compatibleUnits(sku.canonicalUnit) : ['g']
            const label = sku?.name ?? 'insumo'
            return (
              <li key={r.key} className="grid grid-cols-[1fr_6rem_5.5rem_auto] items-start gap-2 rounded-xl border-2 border-border p-3">
                <div className="min-w-0 pt-2">
                  <p className="truncate font-bold">{sku?.name ?? 'Insumo'}</p>
                  {e.skuId && <p className="text-sm font-semibold text-red-700 dark:text-red-300">{e.skuId}</p>}
                </div>
                <Field label={`Cantidad de ${label}`} error={e.quantity} className="[&>label]:sr-only">
                  {(a11y) => (
                    <input
                      {...a11y}
                      inputMode={allowNegative ? 'text' : 'decimal'}
                      value={r.quantity}
                      onChange={(ev) => onChange(rows.map((x) => (x.key === r.key ? { ...x, quantity: ev.target.value } : x)))}
                      className={inputClass}
                      placeholder={allowNegative ? '±30' : quantityPlaceholder}
                    />
                  )}
                </Field>
                <Field label={`Unidad de ${label}`} error={e.unit} className="[&>label]:sr-only">
                  {(a11y) => (
                    <select {...a11y} value={r.unit} onChange={(ev) => onChange(rows.map((x) => (x.key === r.key ? { ...x, unit: ev.target.value } : x)))} className={inputClass}>
                      {units.map((u) => (
                        <option key={u} value={u}>
                          {UNIT_SHORT[u]}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <button type="button" className={`${btnGhost} min-w-11`} onClick={() => onChange(rows.filter((x) => x.key !== r.key))} aria-label={`Quitar ${label}`}>
                  <Trash2 size={18} aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {creating ? (
        <div className="space-y-3 rounded-2xl border-2 border-primary/40 bg-primary/5 p-4">
          <p className="font-bold">Nuevo insumo: «{creating.name}»</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="¿Cómo se mide?" hint="Es la unidad de todo su historial: elegila bien.">
              {(a11y) => (
                <select {...a11y} value={creating.canonicalUnit} onChange={(e) => setCreating({ ...creating, canonicalUnit: e.target.value })} className={inputClass}>
                  <option value="kg">Por peso (kg)</option>
                  <option value="l">Por volumen (litros)</option>
                  <option value="unit">Por unidades</option>
                </select>
              )}
            </Field>
            <Field label="Categoría">
              {(a11y) => (
                <select {...a11y} value={creating.category} onChange={(e) => setCreating({ ...creating, category: e.target.value })} className={inputClass}>
                  {SKU_CATEGORIES.map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnPrimary} onClick={create} disabled={busy}>
              {busy ? <Spinner label="Creando insumo" /> : <Plus size={16} aria-hidden />} Crear y agregar
            </button>
            <button type="button" className={btnGhost} onClick={() => setCreating(null)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <SearchPicker
          label={pickerLabel}
          placeholder="Buscá: carne, pan, queso…"
          items={pickerItems}
          onPick={(id) => {
            const sku = skus.get(id)
            if (sku) add(sku)
          }}
          onCreate={onCreateSku ? (name) => setCreating({ name, canonicalUnit: 'kg', category: 'other' }) : undefined}
          createLabel="Crear insumo"
        />
      )}
    </div>
  )
}
