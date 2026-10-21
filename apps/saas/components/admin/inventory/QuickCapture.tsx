'use client'

// ============================================================================
// QuickCapture — conteo o merma en una línea (patrón de 30 segundos)
// ============================================================================
// Cada envío lleva un clientEventId generado al abrir el formulario: si la
// red falla y se reintenta, el servidor no duplica el movimiento.
// ============================================================================

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Check, Loader2 } from 'lucide-react'
import {
  compatibleUnits,
  inventoryApi,
  newClientEventId,
  qty,
  fieldClass,
  buttonClass,
  METHOD_LABEL,
  WASTE_REASON_LABEL,
} from './shared'

interface Props {
  tenantSlug: string
  skuId: string
  storageLocationId: string
  unit: string
  mode: 'count' | 'waste'
  onDone: () => void
}

interface CountResult {
  duplicate: boolean
  observed: number
  before: { mu: number; sigma: number; anchored: boolean } | null
  discrepancy: { difference: number; valueCents: number } | null
}

export default function QuickCapture({ tenantSlug, skuId, storageLocationId, unit, mode, onDone }: Props) {
  const units = useMemo(() => compatibleUnits(unit), [unit])
  const [clientEventId] = useState(newClientEventId)
  const [value, setValue] = useState('')
  const [inputUnit, setInputUnit] = useState(units.includes(unit as never) ? unit : units[0])
  const [method, setMethod] = useState(unit === 'unit' ? 'visual_count' : 'manual_scale')
  const [reason, setReason] = useState('preparation')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const n = Number(value.replace(',', '.'))
    if (!Number.isFinite(n) || n < 0 || (mode === 'waste' && n === 0)) {
      toast.error('Ingresá una cantidad válida')
      return
    }
    setBusy(true)
    if (mode === 'count') {
      const res = await inventoryApi<CountResult>(tenantSlug, 'counts', {
        method: 'POST',
        body: { clientEventId, skuId, storageLocationId, observedQuantity: n, unit: inputUnit, observationMethod: method },
      })
      setBusy(false)
      if (!res) return
      if (res.discrepancy) {
        const d = res.discrepancy
        toast.warning(`Diferencia de ${qty(d.difference, unit)} con lo esperado. Queda registrada como evidencia, sin culpables.`)
      } else if (res.before && !res.before.anchored) {
        toast.success('Conteo inicial registrado: desde ahora el sistema sigue este insumo')
      } else {
        toast.success('Conteo registrado: la estimación quedó recalibrada')
      }
    } else {
      const res = await inventoryApi(tenantSlug, 'waste', {
        method: 'POST',
        body: {
          clientEventId,
          skuId,
          storageLocationId,
          quantity: n,
          unit: inputUnit,
          reason,
          observationMethod: method === 'manual_scale' || method === 'connected_scale' ? method : 'estimation',
        },
      })
      setBusy(false)
      if (!res) return
      toast.success('Merma registrada')
    }
    onDone()
  }

  return (
    <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2">
      <label className="flex min-w-[7rem] flex-1 flex-col gap-1 text-xs font-bold text-muted-foreground">
        {mode === 'count' ? 'Hay' : 'Se tiró'}
        <input
          inputMode="decimal"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={fieldClass}
          placeholder="0"
          aria-label={mode === 'count' ? 'Cantidad contada' : 'Cantidad de merma'}
        />
      </label>
      <label className="flex w-20 flex-col gap-1 text-xs font-bold text-muted-foreground">
        Unidad
        <select value={inputUnit} onChange={(e) => setInputUnit(e.target.value)} className={fieldClass}>
          {units.map((u) => (
            <option key={u} value={u}>{u === 'unit' ? 'u.' : u}</option>
          ))}
        </select>
      </label>
      {mode === 'waste' && (
        <label className="flex min-w-[9rem] flex-col gap-1 text-xs font-bold text-muted-foreground">
          Motivo
          <select value={reason} onChange={(e) => setReason(e.target.value)} className={fieldClass}>
            {Object.entries(WASTE_REASON_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
      )}
      <label className="flex min-w-[9rem] flex-col gap-1 text-xs font-bold text-muted-foreground">
        ¿Cómo?
        <select value={method} onChange={(e) => setMethod(e.target.value)} className={fieldClass}>
          {Object.entries(METHOD_LABEL).filter(([k]) => k !== 'connected_scale').map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={busy || value === ''} className={buttonClass}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
        {mode === 'count' ? 'Registrar' : 'Registrar merma'}
      </button>
    </form>
  )
}
