'use client'

// ============================================================================
// Preparación (sub-receta) — salsas, masas, caldos
// ============================================================================
// Una tanda consume insumos y produce un insumo ELABORADO, que después usan
// los platos ("la hamburguesa consume salsa; producir salsa consume tomate").
// Versionada como cualquier receta.
// ============================================================================

import { useMemo, useState } from 'react'
import { Save } from 'lucide-react'
import { invApi } from '../data/api'
import { useResource } from '../data/useResource'
import type { SkuOption } from '../data/types'
import { parseDecimal } from '@/lib/inventory/ui/fields'
import { UNIT_LONG } from '@/lib/inventory/ui/format'
import { rowsToItems, validateRows, type DraftRow, type DraftSku } from '@/lib/inventory/ui/recipe-draft'
import { ErrorBlock, Field, LoadingBlock, Notice, Panel, SearchPicker, Spinner, btnPrimary, btnSecondary, inputClass } from '../ui'
import RowsEditor, { SKU_CATEGORIES, type NewSkuInput } from '../RowsEditor'
import type { PanelProps } from './PanelHost'

export interface PreparationView {
  recipeId: string
  name: string
  outputSkuId: string
  outputQuantity: number | null
  version: number
  items: Array<{ skuId: string; quantity: number; unit: string; skuName: string }>
}

export default function PreparationPanel({ ctx, onClose, onChanged, recipeId }: PanelProps & { recipeId: string | null }) {
  const view = useResource(recipeId ? `${ctx.tenantSlug}|preparations|${ctx.location.id}` : null, (signal) =>
    invApi<{ preparations: PreparationView[] }>(ctx.tenantSlug, `recipes?locationId=${ctx.location.id}`, { signal }),
  )
  if (recipeId && view.status === 'loading') {
    return (
      <Panel open onOpenChange={(o) => !o && onClose()} title="Preparación">
        <LoadingBlock rows={2} />
      </Panel>
    )
  }
  if (recipeId && view.status === 'error' && !view.data) {
    return (
      <Panel open onOpenChange={(o) => !o && onClose()} title="Preparación">
        <ErrorBlock error={view.error} onRetry={view.reload} what="la preparación" />
      </Panel>
    )
  }
  const existing = recipeId ? view.data?.preparations.find((p) => p.recipeId === recipeId) ?? null : null
  return <Editor ctx={ctx} onClose={onClose} onChanged={onChanged} existing={existing} />
}

function Editor({ ctx, onClose, onChanged, existing }: Pick<PanelProps, 'ctx' | 'onClose' | 'onChanged'> & { existing: PreparationView | null }) {
  const [extra, setExtra] = useState<SkuOption[]>([])
  const all = useMemo(() => [...ctx.skus, ...extra], [ctx.skus, extra])
  const [outputSkuId, setOutputSkuId] = useState(existing?.outputSkuId ?? '')
  const [newOutput, setNewOutput] = useState<{ name: string; canonicalUnit: string; category: string } | null>(null)
  const [outputQty, setOutputQty] = useState(existing?.outputQuantity ? String(existing.outputQuantity).replace('.', ',') : '')
  const [rows, setRows] = useState<DraftRow[]>(() => (existing?.items ?? []).map((i, n) => ({ key: `p${n}`, skuId: i.skuId, quantity: String(i.quantity).replace('.', ','), unit: i.unit })))
  const [showErrors, setShowErrors] = useState(false)
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const skus = useMemo(() => new Map<string, DraftSku>(all.map((s) => [s._id, s])), [all])
  const output = all.find((s) => s._id === outputSkuId) ?? null
  const rowErrors = validateRows(rows, skus, { allowNegative: false })
  const qty = parseDecimal(outputQty)
  const formErrors = {
    output: output ? (output.kind !== 'prepared' ? 'Tiene que ser un insumo elaborado' : null) : 'Elegí o creá el elaborado que sale de la tanda',
    qty: qty === null || qty <= 0 ? 'Indicá cuánto rinde una tanda' : null,
    rows: rows.length === 0 ? 'Agregá los insumos que usa una tanda' : rows.some((r) => r.skuId === outputSkuId) ? 'Una preparación no puede consumirse a sí misma' : null,
  }
  const valid = !formErrors.output && !formErrors.qty && !formErrors.rows && Object.keys(rowErrors).length === 0

  async function create(input: NewSkuInput & { kind?: 'prepared' | 'raw' }) {
    const res = await invApi<{ sku: SkuOption }>(ctx.tenantSlug, 'skus', { method: 'POST', body: { ...input, kind: input.kind ?? 'raw', businessImpact: 'medium' } })
    if (!res.ok) {
      setServerError(res.error.message)
      return null
    }
    setExtra((x) => [...x, res.data.sku])
    ctx.refreshCatalog()
    return res.data.sku
  }

  async function save() {
    setShowErrors(true)
    if (!valid || !output || qty === null) return
    setBusy(true)
    setServerError(null)
    const res = await invApi(ctx.tenantSlug, 'recipes', {
      method: 'PUT',
      body: { kind: 'preparation', outputSkuId: output._id, outputQuantity: qty, name: output.name, items: rowsToItems(rows) },
    })
    setBusy(false)
    if (!res.ok) {
      setServerError(res.error.message)
      return
    }
    setSaved(true)
    onChanged()
  }

  const preparedItems = all.filter((s) => s.kind === 'prepared' && s.isActive).map((s) => ({ id: s._id, label: s.name, meta: UNIT_LONG[s.canonicalUnit] }))

  return (
    <Panel
      open
      onOpenChange={(o) => !o && onClose()}
      title={existing ? `Preparación: ${existing.name}` : 'Nueva preparación'}
      description="Una tanda: qué insumos usa y cuánto elaborado rinde."
      wide
      footer={
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnPrimary} onClick={save} disabled={busy}>
            {busy ? <Spinner label="Guardando" /> : <Save size={18} aria-hidden />} Guardar preparación
          </button>
          <button type="button" className={btnSecondary} onClick={onClose}>
            Cerrar
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {serverError && <Notice tone="error">{serverError} Lo que cargaste sigue acá.</Notice>}
        {saved && <Notice tone="success">Preparación guardada. Ya podés registrar la producción de tandas.</Notice>}

        <section className="space-y-3">
          <h3 className="text-base font-black">¿Qué sale de la tanda?</h3>
          {output ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-border p-3">
              <span className="font-bold">{output.name}</span>
              {!existing && (
                <button type="button" className={btnSecondary} onClick={() => setOutputSkuId('')}>
                  Cambiar
                </button>
              )}
            </div>
          ) : newOutput ? (
            <div className="space-y-3 rounded-2xl border-2 border-primary/40 bg-primary/5 p-4">
              <p className="font-bold">Nuevo elaborado: «{newOutput.name}»</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="¿Cómo se mide?">
                  {(a11y) => (
                    <select {...a11y} value={newOutput.canonicalUnit} onChange={(e) => setNewOutput({ ...newOutput, canonicalUnit: e.target.value })} className={inputClass}>
                      <option value="kg">Por peso (kg)</option>
                      <option value="l">Por volumen (litros)</option>
                      <option value="unit">Por unidades</option>
                    </select>
                  )}
                </Field>
                <Field label="Categoría">
                  {(a11y) => (
                    <select {...a11y} value={newOutput.category} onChange={(e) => setNewOutput({ ...newOutput, category: e.target.value })} className={inputClass}>
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
                <button
                  type="button"
                  className={btnPrimary}
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true)
                    const sku = await create({ ...newOutput, kind: 'prepared' })
                    setBusy(false)
                    if (sku) {
                      setOutputSkuId(sku._id)
                      setNewOutput(null)
                    }
                  }}
                >
                  Crear elaborado
                </button>
                <button type="button" className={btnSecondary} onClick={() => setNewOutput(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <SearchPicker
              label="Elaborado"
              placeholder="Ej.: salsa de tomate"
              items={preparedItems}
              onPick={setOutputSkuId}
              onCreate={(name) => setNewOutput({ name, canonicalUnit: 'kg', category: 'other' })}
              createLabel="Crear elaborado"
              error={showErrors ? formErrors.output : null}
            />
          )}
          {showErrors && output && formErrors.output && <p className="text-sm font-semibold text-red-700 dark:text-red-300">{formErrors.output}</p>}
          {output && (
            <Field label={`Rinde por tanda (${UNIT_LONG[output.canonicalUnit] ?? output.canonicalUnit})`} error={showErrors ? formErrors.qty : null}>
              {(a11y) => <input {...a11y} inputMode="decimal" value={outputQty} onChange={(e) => setOutputQty(e.target.value)} className={inputClass} placeholder="5" />}
            </Field>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-base font-black">Insumos de una tanda</h3>
          <RowsEditor rows={rows} onChange={setRows} skus={skus} errors={showErrors ? rowErrors : {}} quantityPlaceholder="2" onCreateSku={create} />
          {showErrors && formErrors.rows && <p className="text-sm font-semibold text-red-700 dark:text-red-300">{formErrors.rows}</p>}
        </section>
      </div>
    </Panel>
  )
}
