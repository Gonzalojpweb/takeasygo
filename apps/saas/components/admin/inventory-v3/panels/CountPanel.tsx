'use client'

// ============================================================================
// Contar — "¿cuánto hay?" en un paso
// ============================================================================
// El clientEventId se fija al abrir el panel: si la red falla y se reintenta,
// el servidor no duplica el conteo. Un error nunca borra lo escrito.
// Una diferencia se informa como evidencia, sin culpables.
// ============================================================================

import { useMemo, useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { invApi } from '../data/api'
import { compatibleUnits, newClientEventId, parseDecimal } from '@/lib/inventory/ui/fields'
import { UNIT_SHORT, formatDelta, formatQty } from '@/lib/inventory/ui/format'
import { Field, LoadingBlock, Notice, Panel, Spinner, btnPrimary, btnSecondary, inputClass } from '../ui'
import { resolveStorage, type PanelProps } from './PanelHost'

const METHODS: Array<{ id: string; label: string }> = [
  { id: 'manual_scale', label: 'Lo pesé en balanza' },
  { id: 'visual_count', label: 'Lo conté a mano' },
  { id: 'estimation', label: 'Lo estimé a ojo' },
]

interface CountResult {
  duplicate: boolean
  observed: number
  unit: string
  before: { mu: number; sigma: number; anchored: boolean } | null
  discrepancy: { difference: number; valueCents?: number } | null
}

export default function CountPanel({ ctx, onClose, onSwitch, onChanged, skuId, storageLocationId }: PanelProps & { skuId: string; storageLocationId: string | null }) {
  const sku = ctx.skus.find((s) => s._id === skuId)
  const storage = resolveStorage(ctx, storageLocationId)
  const units = useMemo(() => compatibleUnits(sku?.canonicalUnit ?? 'unit'), [sku])
  const [clientEventId] = useState(newClientEventId)
  const [value, setValue] = useState('')
  const [unit, setUnit] = useState<string>(sku?.canonicalUnit ?? units[0])
  const [method, setMethod] = useState(sku?.canonicalUnit === 'unit' ? 'visual_count' : 'manual_scale')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<CountResult | null>(null)

  const title = sku ? `Contar ${sku.name}` : 'Contar'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const n = parseDecimal(value)
    if (n === null || n < 0) {
      setFieldError('Escribí cuánto hay (0 si no queda nada)')
      return
    }
    if (!storage) {
      setServerError('La sede no tiene depósito de inventario. Primero hay que preparar la sede.')
      return
    }
    setFieldError(null)
    setServerError(null)
    setBusy(true)
    const res = await invApi<CountResult>(ctx.tenantSlug, 'counts', {
      method: 'POST',
      body: { clientEventId, skuId, storageLocationId: storage, observedQuantity: n, unit, observationMethod: method },
    })
    setBusy(false)
    if (!res.ok) {
      setServerError(res.error.message)
      return
    }
    setResult(res.data)
    onChanged()
  }

  if (!sku && !ctx.catalogReady) {
    return (
      <Panel open onOpenChange={(o) => !o && onClose()} title="Contar">
        <LoadingBlock label="Cargando insumo" rows={2} />
      </Panel>
    )
  }
  if (!sku) {
    return (
      <Panel open onOpenChange={(o) => !o && onClose()} title="Contar">
        <Notice tone="error">Este insumo ya no está en el catálogo o está desactivado.</Notice>
      </Panel>
    )
  }

  if (result) {
    const d = result.discrepancy
    return (
      <Panel
        open
        onOpenChange={(o) => !o && onClose()}
        title={title}
        footer={
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnPrimary} onClick={onClose} autoFocus>
              Listo
            </button>
            <button type="button" className={btnSecondary} onClick={() => onSwitch({ type: 'product', skuId, storageLocationId: storage })}>
              Ver el producto
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {d ? (
            <Notice tone="info">
              <p className="font-bold">Conteo registrado: {formatQty(result.observed, result.unit)}</p>
              <p className="mt-1">
                Es {formatDelta(d.difference, result.unit)} respecto de lo que el sistema esperaba. Queda como evidencia,
                sin culpables: si se repite, conviene revisar recetas, mermas o recepciones.
              </p>
            </Notice>
          ) : (
            <Notice tone="success">
              <p className="font-bold">Conteo registrado: {formatQty(result.observed, result.unit)}</p>
              <p className="mt-1">
                {result.before && !result.before.anchored
                  ? 'Primer conteo: desde ahora el sistema sigue este insumo solo.'
                  : 'La estimación quedó recalibrada.'}
              </p>
            </Notice>
          )}
        </div>
      </Panel>
    )
  }

  return (
    <Panel
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description="Escribí lo que hay ahora. Un conteo rápido recalibra todo lo demás."
      footer={
        <button type="submit" form="count-form" className={`${btnPrimary} w-full sm:w-auto`} disabled={busy}>
          {busy ? <Spinner label="Registrando conteo" /> : <ClipboardCheck size={18} aria-hidden />} Registrar conteo
        </button>
      }
    >
      <form id="count-form" onSubmit={submit} className="space-y-5" noValidate>
        {serverError && <Notice tone="error">{serverError} Lo que escribiste sigue acá.</Notice>}
        <div className="grid grid-cols-[1fr_auto] items-start gap-3">
          <Field label="¿Cuánto hay?" error={fieldError}>
            {(a11y) => (
              <input
                {...a11y}
                inputMode="decimal"
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className={`${inputClass} text-2xl font-black`}
                placeholder="0"
              />
            )}
          </Field>
          <Field label="Unidad">
            {(a11y) => (
              <select {...a11y} value={unit} onChange={(e) => setUnit(e.target.value)} className={`${inputClass} w-24`}>
                {units.map((u) => (
                  <option key={u} value={u}>
                    {UNIT_SHORT[u]}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-bold">¿Cómo lo mediste?</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {METHODS.map((m) => (
              <label key={m.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border-2 border-border px-3 text-sm font-semibold has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <input type="radio" name="method" value={m.id} checked={method === m.id} onChange={() => setMethod(m.id)} className="size-4" />
                {m.label}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Una balanza pesa más que una estimación al recalibrar.</p>
        </fieldset>
      </form>
    </Panel>
  )
}
