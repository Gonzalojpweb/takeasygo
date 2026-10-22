'use client'

// ============================================================================
// Transferir (gestión) — de un depósito a otro, de esta sede o de otra
// ============================================================================
// Dos movimientos con el mismo id (salida y entrada): reintentar no duplica.
// El costo promedio viaja con la mercadería.
// ============================================================================

import { useState } from 'react'
import { ArrowRightLeft } from 'lucide-react'
import { invApi } from '../data/api'
import { newClientEventId, parseDecimal } from '@/lib/inventory/ui/fields'
import { UNIT_SHORT, formatQty } from '@/lib/inventory/ui/format'
import { Field, LoadingBlock, Notice, Panel, Spinner, btnPrimary, inputClass } from '../ui'
import { resolveStorage, type PanelProps } from './PanelHost'

export default function TransferPanel({ ctx, onClose, onChanged, skuId, storageLocationId }: PanelProps & { skuId: string; storageLocationId: string | null }) {
  const sku = ctx.skus.find((s) => s._id === skuId)
  const from = resolveStorage(ctx, storageLocationId)
  const destinations = ctx.allStorages.filter((s) => s._id !== from)
  const locName = (id: string) => ctx.locations.find((l) => l.id === id)?.name ?? 'Otra sede'
  const [transferId] = useState(newClientEventId)
  const [to, setTo] = useState(destinations[0]?._id ?? '')
  const [value, setValue] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  if (!sku) {
    return (
      <Panel open onOpenChange={(o) => !o && onClose()} title="Transferir">
        {ctx.catalogReady ? <Notice tone="error">Este insumo no está disponible.</Notice> : <LoadingBlock rows={2} />}
      </Panel>
    )
  }
  const unit = sku.canonicalUnit

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const n = parseDecimal(value)
    if (n === null || n <= 0) {
      setError(`Indicá cuánto (en ${UNIT_SHORT[unit]})`)
      return
    }
    setError(null)
    setBusy(true)
    setServerError(null)
    const res = await invApi(ctx.tenantSlug, 'transfers', {
      method: 'POST',
      body: { transferId, skuId, fromStorageLocationId: from, toStorageLocationId: to, quantity: n, reason: reason.trim() || undefined },
    })
    setBusy(false)
    if (!res.ok) {
      setServerError(res.error.message)
      return
    }
    setDone(true)
    onChanged()
  }

  if (done) {
    const dest = ctx.allStorages.find((s) => s._id === to)
    return (
      <Panel open onOpenChange={(o) => !o && onClose()} title={`Transferir ${sku.name}`} footer={<button type="button" className={btnPrimary} onClick={onClose} autoFocus>Listo</button>}>
        <Notice tone="success">
          Transferidos {formatQty(parseDecimal(value) ?? 0, unit)} a {dest ? `${dest.name} (${locName(dest.locationId)})` : 'destino'}.
        </Notice>
      </Panel>
    )
  }

  return (
    <Panel
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Transferir ${sku.name}`}
      footer={
        <button type="submit" form="transfer-form" className={`${btnPrimary} w-full sm:w-auto`} disabled={busy || destinations.length === 0}>
          {busy ? <Spinner label="Transfiriendo" /> : <ArrowRightLeft size={18} aria-hidden />} Transferir
        </button>
      }
    >
      {destinations.length === 0 ? (
        <Notice tone="info">No hay otro depósito activo adonde transferir. Podés crear uno en «Configuración de la sede».</Notice>
      ) : (
        <form id="transfer-form" onSubmit={submit} className="space-y-5" noValidate>
          {serverError && <Notice tone="error">{serverError} Lo que escribiste sigue acá.</Notice>}
          <Field label="Hacia">
            {(a11y) => (
              <select {...a11y} value={to} onChange={(e) => setTo(e.target.value)} className={inputClass}>
                {destinations.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name} · {locName(s.locationId)}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={`Cantidad (${UNIT_SHORT[unit]})`} error={error}>
            {(a11y) => <input {...a11y} inputMode="decimal" autoFocus value={value} onChange={(e) => setValue(e.target.value)} className={inputClass} />}
          </Field>
          <Field label="Motivo (opcional)">
            {(a11y) => <input {...a11y} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} className={inputClass} placeholder="Ej.: reposición de la barra" />}
          </Field>
        </form>
      )}
    </Panel>
  )
}
