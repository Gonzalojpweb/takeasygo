'use client'

// ============================================================================
// Ajuste autorizado (gestión) — corrección explícita con motivo
// ============================================================================
// Para lo que no es venta, merma, recepción ni conteo (ej. devolución a un
// proveedor). Queda en el ledger con quién y por qué; nunca edita el pasado.
// ============================================================================

import { useMemo, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { invApi } from '../data/api'
import { compatibleUnits, newClientEventId, parseDecimal } from '@/lib/inventory/ui/fields'
import { UNIT_SHORT, formatDelta } from '@/lib/inventory/ui/format'
import { Field, LoadingBlock, Notice, Panel, Spinner, btnPrimary, inputClass } from '../ui'
import { resolveStorage, type PanelProps } from './PanelHost'

export default function AdjustPanel({ ctx, onClose, onChanged, skuId, storageLocationId }: PanelProps & { skuId: string; storageLocationId: string | null }) {
  const sku = ctx.skus.find((s) => s._id === skuId)
  const storage = resolveStorage(ctx, storageLocationId)
  const units = useMemo(() => compatibleUnits(sku?.canonicalUnit ?? 'unit'), [sku])
  const [clientEventId] = useState(newClientEventId)
  const [direction, setDirection] = useState<'add' | 'remove'>('remove')
  const [value, setValue] = useState('')
  const [unit, setUnit] = useState<string>(sku?.canonicalUnit ?? units[0])
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<{ value?: string; reason?: string }>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ delta: number; unit: string } | null>(null)

  if (!sku) {
    return (
      <Panel open onOpenChange={(o) => !o && onClose()} title="Ajuste">
        {ctx.catalogReady ? <Notice tone="error">Este insumo no está disponible.</Notice> : <LoadingBlock rows={2} />}
      </Panel>
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const n = parseDecimal(value)
    const next: typeof errors = {}
    if (n === null || n <= 0) next.value = 'Indicá la cantidad (mayor a 0)'
    if (reason.trim().length < 10) next.reason = 'Contá el motivo (al menos 10 caracteres)'
    setErrors(next)
    if (Object.keys(next).length || !storage || n === null) return
    setBusy(true)
    setServerError(null)
    const res = await invApi<{ delta: number; unit: string }>(ctx.tenantSlug, 'adjustments', {
      method: 'POST',
      body: { clientEventId, skuId, storageLocationId: storage, delta: direction === 'add' ? n : -n, unit, reason: reason.trim() },
    })
    setBusy(false)
    if (!res.ok) {
      setServerError(res.error.message)
      return
    }
    setDone(res.data)
    onChanged()
  }

  if (done) {
    return (
      <Panel open onOpenChange={(o) => !o && onClose()} title={`Ajuste de ${sku.name}`} footer={<button type="button" className={btnPrimary} onClick={onClose} autoFocus>Listo</button>}>
        <Notice tone="success">Ajuste registrado: {formatDelta(done.delta, done.unit)}. Queda en la actividad con tu nombre y el motivo.</Notice>
      </Panel>
    )
  }

  return (
    <Panel
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Ajuste de ${sku.name}`}
      description="Para correcciones que no son venta, merma, recepción ni conteo. Si contaste, usá «Contar»: recalibra mejor."
      footer={
        <button type="submit" form="adjust-form" className={`${btnPrimary} w-full sm:w-auto`} disabled={busy}>
          {busy ? <Spinner label="Registrando ajuste" /> : <SlidersHorizontal size={18} aria-hidden />} Registrar ajuste
        </button>
      }
    >
      <form id="adjust-form" onSubmit={submit} className="space-y-5" noValidate>
        {serverError && <Notice tone="error">{serverError} Lo que escribiste sigue acá.</Notice>}
        <fieldset className="space-y-2">
          <legend className="text-sm font-bold">¿Qué hay que hacer?</legend>
          <div className="grid grid-cols-2 gap-2">
            {(['remove', 'add'] as const).map((d) => (
              <label key={d} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border-2 border-border px-3 text-sm font-semibold has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <input type="radio" name="direction" checked={direction === d} onChange={() => setDirection(d)} className="size-4" />
                {d === 'remove' ? 'Restar' : 'Sumar'}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-[1fr_auto] items-start gap-3">
          <Field label="Cantidad" error={errors.value}>
            {(a11y) => <input {...a11y} inputMode="decimal" autoFocus value={value} onChange={(e) => setValue(e.target.value)} className={inputClass} />}
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
        <Field label="Motivo" error={errors.reason} hint="Ej.: devolución al proveedor por producto en mal estado.">
          {(a11y) => <textarea {...a11y} value={reason} maxLength={300} rows={3} onChange={(e) => setReason(e.target.value)} className={`${inputClass} py-2`} />}
        </Field>
      </form>
    </Panel>
  )
}
