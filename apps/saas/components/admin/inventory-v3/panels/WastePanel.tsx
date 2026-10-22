'use client'

// ============================================================================
// Registrar merma — qué se tiró y por qué
// ============================================================================

import { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { invApi } from '../data/api'
import { compatibleUnits, newClientEventId, parseDecimal } from '@/lib/inventory/ui/fields'
import { UNIT_SHORT, formatQty } from '@/lib/inventory/ui/format'
import { Field, LoadingBlock, Notice, Panel, Spinner, btnPrimary, btnSecondary, inputClass } from '../ui'
import { resolveStorage, type PanelProps } from './PanelHost'

const REASONS: Array<{ id: string; label: string }> = [
  { id: 'expiration', label: 'Vencimiento' },
  { id: 'damage', label: 'Rotura o daño' },
  { id: 'preparation', label: 'Preparación' },
  { id: 'contamination', label: 'Contaminación' },
  { id: 'staff_meal', label: 'Comida del personal' },
  { id: 'other', label: 'Otro' },
]

export default function WastePanel({ ctx, onClose, onChanged, skuId, storageLocationId }: PanelProps & { skuId: string; storageLocationId: string | null }) {
  const sku = ctx.skus.find((s) => s._id === skuId)
  const storage = resolveStorage(ctx, storageLocationId)
  const units = useMemo(() => compatibleUnits(sku?.canonicalUnit ?? 'unit'), [sku])
  const [clientEventId, setClientEventId] = useState(newClientEventId)
  const [value, setValue] = useState('')
  const [unit, setUnit] = useState<string>(sku?.canonicalUnit ?? units[0])
  const [reason, setReason] = useState('expiration')
  const [notes, setNotes] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ quantity: number; unit: string } | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const n = parseDecimal(value)
    if (n === null || n <= 0) {
      setFieldError('Indicá cuánto se tiró (mayor a 0)')
      return
    }
    if (!storage) {
      setServerError('La sede no tiene depósito de inventario.')
      return
    }
    setFieldError(null)
    setServerError(null)
    setBusy(true)
    const res = await invApi<{ quantity: number; unit: string }>(ctx.tenantSlug, 'waste', {
      method: 'POST',
      body: { clientEventId, skuId, storageLocationId: storage, quantity: n, unit, reason, notes: notes.trim() || null },
    })
    setBusy(false)
    if (!res.ok) {
      setServerError(res.error.message)
      return
    }
    setDone(res.data)
    onChanged()
  }

  if (!sku && !ctx.catalogReady) {
    return (
      <Panel open onOpenChange={(o) => !o && onClose()} title="Registrar merma">
        <LoadingBlock label="Cargando insumo" rows={2} />
      </Panel>
    )
  }
  if (!sku) {
    return (
      <Panel open onOpenChange={(o) => !o && onClose()} title="Registrar merma">
        <Notice tone="error">Este insumo ya no está en el catálogo o está desactivado.</Notice>
      </Panel>
    )
  }

  if (done) {
    return (
      <Panel
        open
        onOpenChange={(o) => !o && onClose()}
        title={`Merma de ${sku.name}`}
        footer={
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnPrimary} onClick={onClose} autoFocus>
              Listo
            </button>
            <button
              type="button"
              className={btnSecondary}
              onClick={() => {
                setDone(null)
                setValue('')
                setNotes('')
                setClientEventId(newClientEventId())
              }}
            >
              Registrar otra
            </button>
          </div>
        }
      >
        <Notice tone="success">Merma registrada: {formatQty(done.quantity, done.unit)} de {sku.name}.</Notice>
      </Panel>
    )
  }

  return (
    <Panel
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Merma de ${sku.name}`}
      description="Lo que se tiró, se rompió o se usó fuera de una venta."
      footer={
        <button type="submit" form="waste-form" className={`${btnPrimary} w-full sm:w-auto`} disabled={busy}>
          {busy ? <Spinner label="Registrando merma" /> : <Trash2 size={18} aria-hidden />} Registrar merma
        </button>
      }
    >
      <form id="waste-form" onSubmit={submit} className="space-y-5" noValidate>
        {serverError && <Notice tone="error">{serverError} Lo que escribiste sigue acá.</Notice>}
        <div className="grid grid-cols-[1fr_auto] items-start gap-3">
          <Field label="¿Cuánto?" error={fieldError}>
            {(a11y) => (
              <input {...a11y} inputMode="decimal" autoFocus value={value} onChange={(e) => setValue(e.target.value)} className={`${inputClass} text-2xl font-black`} placeholder="0" />
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
          <legend className="text-sm font-bold">Motivo</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {REASONS.map((r) => (
              <label key={r.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border-2 border-border px-3 text-sm font-semibold has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <input type="radio" name="reason" value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} className="size-4" />
                {r.label}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Nota (opcional)">
          {(a11y) => <input {...a11y} value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} className={inputClass} placeholder="Ej.: cajón con humedad" />}
        </Field>
      </form>
    </Panel>
  )
}
