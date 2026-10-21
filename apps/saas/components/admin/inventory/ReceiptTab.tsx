'use client'

// ============================================================================
// Recepción de mercadería
// ============================================================================
// Se carga como viene en el remito: "2 cajas de 6 kg a $54.000". El sistema
// convierte a la unidad del insumo y calcula el costo por unidad. Nunca asume
// que "1 caja = 1 kg".
// ============================================================================

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Truck } from 'lucide-react'
import {
  SectionCard,
  buttonClass,
  compatibleUnits,
  fieldClass,
  inventoryApi,
  newClientEventId,
  pesos,
  qty,
  type SkuOption,
  type StorageOption,
} from './shared'

export default function ReceiptTab({
  tenantSlug,
  skus,
  storages,
  onDone,
}: {
  tenantSlug: string
  skus: SkuOption[]
  storages: StorageOption[]
  onDone: () => void
}) {
  const [clientEventId, setClientEventId] = useState(newClientEventId)
  const [skuId, setSkuId] = useState('')
  const [storageId, setStorageId] = useState(storages.find((s) => s.isDefaultConsumption)?._id ?? storages[0]?._id ?? '')
  const [byPack, setByPack] = useState(false)
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('kg')
  const [packLabel, setPackLabel] = useState('caja')
  const [packSize, setPackSize] = useState('')
  const [total, setTotal] = useState('')
  const [supplier, setSupplier] = useState('')
  const [invoice, setInvoice] = useState('')
  const [busy, setBusy] = useState(false)

  const sku = skus.find((s) => s._id === skuId)
  const units = useMemo(() => (sku ? compatibleUnits(sku.canonicalUnit) : []), [sku])

  function selectSku(id: string) {
    setSkuId(id)
    const s = skus.find((x) => x._id === id)
    if (s) {
      setUnit(s.canonicalUnit)
      setSupplier(s.supplierName ?? '')
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!sku) return toast.error('Elegí un insumo')
    const q = Number(quantity.replace(',', '.'))
    if (!(q > 0)) return toast.error('Cantidad inválida')
    const totalCents = total ? Math.round(Number(total.replace(/\./g, '').replace(',', '.')) * 100) : undefined
    if (totalCents !== undefined && !(totalCents >= 0)) return toast.error('Total inválido')
    const body: Record<string, unknown> = {
      clientEventId,
      skuId,
      storageLocationId: storageId,
      quantity: q,
      unit: byPack ? packLabel || 'bulto' : unit,
      totalCostCents: totalCents,
      supplierName: supplier || null,
      invoiceRef: invoice || null,
    }
    if (byPack) {
      const size = Number(packSize.replace(',', '.'))
      if (!(size > 0)) return toast.error('Indicá cuánto trae cada presentación')
      body.pack = { quantity: size, unit }
    }
    setBusy(true)
    const res = await inventoryApi<{ quantity: number; unit: string; unitCostCents: number | null; duplicate: boolean }>(tenantSlug, 'receipts', { method: 'POST', body })
    setBusy(false)
    if (!res) return
    toast.success(
      `Recibido ${qty(res.quantity, res.unit)}${res.unitCostCents !== null ? ` a ${pesos(res.unitCostCents)}/${res.unit === 'unit' ? 'u.' : res.unit}` : ''}`,
    )
    setClientEventId(newClientEventId())
    setQuantity('')
    setTotal('')
    setInvoice('')
    onDone()
  }

  return (
    <SectionCard title="Recepción de mercadería" subtitle="Cargá lo que llegó tal como figura en el remito o la factura.">
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Insumo">
          <select value={skuId} onChange={(e) => selectSku(e.target.value)} className={fieldClass} required>
            <option value="">Elegí un insumo…</option>
            {skus.filter((s) => s.isActive && s.kind === 'raw').map((s) => (
              <option key={s._id} value={s._id}>{s.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Depósito">
          <select value={storageId} onChange={(e) => setStorageId(e.target.value)} className={fieldClass}>
            {storages.filter((s) => s.isActive).map((s) => (
              <option key={s._id} value={s._id}>{s.name}</option>
            ))}
          </select>
        </Field>

        <label className="flex items-center gap-2 text-sm font-bold md:col-span-2">
          <input type="checkbox" checked={byPack} onChange={(e) => setByPack(e.target.checked)} className="h-5 w-5" />
          Viene en presentación (caja, bolsa, cajón…)
        </label>

        {byPack ? (
          <div className="grid grid-cols-2 gap-3 md:col-span-2 md:grid-cols-4">
            <Field label="Cantidad"><input inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={fieldClass} placeholder="2" /></Field>
            <Field label="Presentación"><input value={packLabel} onChange={(e) => setPackLabel(e.target.value)} className={fieldClass} placeholder="caja" /></Field>
            <Field label="Cada una trae"><input inputMode="decimal" value={packSize} onChange={(e) => setPackSize(e.target.value)} className={fieldClass} placeholder="6" /></Field>
            <Field label="Unidad">
              <select value={unit} onChange={(e) => setUnit(e.target.value)} className={fieldClass} disabled={!sku}>
                {units.map((u) => <option key={u} value={u}>{u === 'unit' ? 'u.' : u}</option>)}
              </select>
            </Field>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:col-span-2">
            <Field label="Cantidad"><input inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={fieldClass} placeholder="10" /></Field>
            <Field label="Unidad">
              <select value={unit} onChange={(e) => setUnit(e.target.value)} className={fieldClass} disabled={!sku}>
                {units.map((u) => <option key={u} value={u}>{u === 'unit' ? 'u.' : u}</option>)}
              </select>
            </Field>
          </div>
        )}

        <Field label="Total pagado ($, opcional)"><input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} className={fieldClass} placeholder="54000" /></Field>
        <Field label="Proveedor (opcional)"><input value={supplier} onChange={(e) => setSupplier(e.target.value)} className={fieldClass} /></Field>
        <Field label="N° de factura / remito (opcional)"><input value={invoice} onChange={(e) => setInvoice(e.target.value)} className={fieldClass} /></Field>

        <div className="flex items-end md:col-span-2">
          <button type="submit" disabled={busy || !sku} className={buttonClass}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Truck size={16} />} Registrar recepción
          </button>
        </div>
      </form>
    </SectionCard>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-bold text-muted-foreground">
      {label}
      {children}
    </label>
  )
}
