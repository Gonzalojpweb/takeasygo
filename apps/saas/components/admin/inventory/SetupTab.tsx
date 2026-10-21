'use client'

// ============================================================================
// Configuración — sede, insumos, depósitos, costos y sincronización
// ============================================================================

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Power, RefreshCw, Save } from 'lucide-react'
import {
  CATEGORY_LABEL,
  IMPACT_LABEL,
  SectionCard,
  buttonClass,
  fieldClass,
  ghostButtonClass,
  inventoryApi,
  pesos,
  qty,
  type SkuOption,
  type StorageOption,
  useAsyncData,
} from './shared'

interface Props {
  tenantSlug: string
  location: { id: string; name: string; inventoryActive: boolean }
  skus: SkuOption[]
  storages: StorageOption[]
  onChange: () => void
}

export default function SetupTab({ tenantSlug, location, skus, storages, onChange }: Props) {
  return (
    <div className="space-y-6">
      <ActivationCard tenantSlug={tenantSlug} location={location} onChange={onChange} />
      <SkuCatalog tenantSlug={tenantSlug} skus={skus} onChange={onChange} />
      <StorageCard tenantSlug={tenantSlug} locationId={location.id} storages={storages.filter((s) => s.locationId === location.id)} onChange={onChange} />
      <CostCard tenantSlug={tenantSlug} locationId={location.id} />
    </div>
  )
}

function ActivationCard({ tenantSlug, location, onChange }: { tenantSlug: string; location: Props['location']; onChange: () => void }) {
  const [busy, setBusy] = useState(false)

  async function activate() {
    setBusy(true)
    const res = await inventoryApi(tenantSlug, 'setup', { method: 'POST', body: { locationId: location.id, skus: [] } })
    setBusy(false)
    if (res) {
      toast.success(`Inventario activo en ${location.name}: las ventas confirmadas descuentan insumos`)
      onChange()
    }
  }

  async function sync() {
    setBusy(true)
    const res = await inventoryApi<{ orders: number; events: number; unmappedLines: number }>(tenantSlug, 'sales/reconcile', { method: 'POST', body: { hours: 36 } })
    setBusy(false)
    if (res) toast.success(`Revisados ${res.orders} pedidos: ${res.events} movimientos nuevos${res.unmappedLines ? ` · ${res.unmappedLines} platos sin receta` : ''}`)
  }

  return (
    <SectionCard
      title={`Sede: ${location.name}`}
      subtitle={
        location.inventoryActive
          ? 'Inventario activo. Cada venta confirmada (POS, web, delivery) descuenta los insumos de su receta; las cancelaciones los devuelven.'
          : 'Activá inventario para que las ventas de esta sede empiecen a descontar insumos.'
      }
      actions={
        location.inventoryActive ? (
          <button type="button" onClick={sync} disabled={busy} className={ghostButtonClass}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Sincronizar ventas (36 h)
          </button>
        ) : (
          <button type="button" onClick={activate} disabled={busy} className={buttonClass}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Power size={16} />} Activar inventario
          </button>
        )
      }
    >
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Cargá las recetas de los platos que más vendés (pestaña Recetas → «Sugerir insumos»).</li>
        <li>Hacé el conteo inicial de esos insumos (pestaña Hoy).</li>
        <li>Registrá las recepciones a medida que llega mercadería.</li>
        <li>Desde ahí, verificá solo lo que el sistema te pida.</li>
      </ol>
    </SectionCard>
  )
}

const EMPTY = { name: '', category: 'other', canonicalUnit: 'kg', businessImpact: 'medium', parLevel: '', supplierName: '', cost: '' }

function SkuCatalog({ tenantSlug, skus, onChange }: { tenantSlug: string; skus: SkuOption[]; onChange: () => void }) {
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const res = await inventoryApi(tenantSlug, 'skus', {
      method: 'POST',
      body: {
        name: form.name,
        category: form.category,
        canonicalUnit: form.canonicalUnit,
        businessImpact: form.businessImpact,
        parLevel: form.parLevel ? Number(form.parLevel.replace(',', '.')) : null,
        supplierName: form.supplierName || null,
        lastUnitCostCents: form.cost ? Math.round(Number(form.cost.replace(/\./g, '').replace(',', '.')) * 100) : undefined,
      },
    })
    setBusy(false)
    if (res) {
      toast.success('Insumo creado')
      setForm(EMPTY)
      onChange()
    }
  }

  return (
    <SectionCard title={`Insumos (${skus.filter((s) => s.isActive).length})`} subtitle="La unidad del insumo es la de todo su historial: elegila bien (kg, l o unidades).">
      <form onSubmit={create} className="mb-5 grid grid-cols-2 gap-2 md:grid-cols-7">
        <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre" className={`${fieldClass} col-span-2`} />
        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={fieldClass} aria-label="Categoría">
          {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={form.canonicalUnit} onChange={(e) => setForm({ ...form, canonicalUnit: e.target.value })} className={fieldClass} aria-label="Unidad">
          <option value="kg">kg</option><option value="l">l</option><option value="unit">unidades</option><option value="g">g</option><option value="ml">ml</option>
        </select>
        <select value={form.businessImpact} onChange={(e) => setForm({ ...form, businessImpact: e.target.value })} className={fieldClass} aria-label="Impacto">
          {Object.entries(IMPACT_LABEL).map(([k, v]) => <option key={k} value={k}>Impacto {v.toLowerCase()}</option>)}
        </select>
        <input inputMode="decimal" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="Precio $/unidad" className={fieldClass} />
        <button type="submit" disabled={busy} className={buttonClass}>Agregar</button>
      </form>

      <ul className="divide-y divide-border">
        {skus.map((s) => (
          <li key={s._id} className="py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className={s.isActive ? '' : 'opacity-50'}>
                <span className="font-bold">{s.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {CATEGORY_LABEL[s.category]} · {s.canonicalUnit === 'unit' ? 'unidades' : s.canonicalUnit} · {pesos(s.lastUnitCostCents)}/{s.canonicalUnit === 'unit' ? 'u.' : s.canonicalUnit}
                  {s.parLevel !== null && ` · mínimo ${qty(s.parLevel, s.canonicalUnit)}`}
                  {s.kind === 'prepared' && ' · elaborado'}
                </span>
              </div>
              <button type="button" onClick={() => setEditing(editing === s._id ? null : s._id)} className="h-11 rounded-xl border border-border px-3 text-sm font-bold">
                Editar
              </button>
            </div>
            {editing === s._id && <SkuEditor tenantSlug={tenantSlug} sku={s} onSaved={() => { setEditing(null); onChange() }} />}
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}

function SkuEditor({ tenantSlug, sku, onSaved }: { tenantSlug: string; sku: SkuOption; onSaved: () => void }) {
  const [parLevel, setParLevel] = useState(sku.parLevel !== null ? String(sku.parLevel) : '')
  const [impact, setImpact] = useState(sku.businessImpact)
  const [supplier, setSupplier] = useState(sku.supplierName ?? '')
  const [busy, setBusy] = useState(false)

  async function save(patch: Record<string, unknown>) {
    setBusy(true)
    const res = await inventoryApi(tenantSlug, `skus/${sku._id}`, { method: 'PATCH', body: patch })
    setBusy(false)
    if (res) {
      toast.success('Insumo actualizado')
      onSaved()
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-end gap-2 rounded-2xl bg-muted/30 p-3">
      <label className="flex flex-col gap-1 text-xs font-bold text-muted-foreground">
        Stock mínimo ({sku.canonicalUnit === 'unit' ? 'u.' : sku.canonicalUnit})
        <input inputMode="decimal" value={parLevel} onChange={(e) => setParLevel(e.target.value)} className={`${fieldClass} w-32`} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold text-muted-foreground">
        Impacto
        <select value={impact} onChange={(e) => setImpact(e.target.value)} className={`${fieldClass} w-36`}>
          {Object.entries(IMPACT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold text-muted-foreground">
        Proveedor
        <input value={supplier} onChange={(e) => setSupplier(e.target.value)} className={`${fieldClass} w-48`} />
      </label>
      <button
        type="button"
        disabled={busy}
        onClick={() => save({ parLevel: parLevel ? Number(parLevel.replace(',', '.')) : null, businessImpact: impact, supplierName: supplier || null })}
        className={buttonClass}
      >
        <Save size={16} /> Guardar
      </button>
      <button type="button" disabled={busy} onClick={() => save({ isActive: !sku.isActive })} className={ghostButtonClass}>
        {sku.isActive ? 'Desactivar' : 'Reactivar'}
      </button>
    </div>
  )
}

function StorageCard({ tenantSlug, locationId, storages, onChange }: { tenantSlug: string; locationId: string; storages: StorageOption[]; onChange: () => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('cold_storage')

  async function create(e: React.FormEvent) {
    e.preventDefault()
    const res = await inventoryApi(tenantSlug, 'storage-locations', { method: 'POST', body: { locationId, name, type } })
    if (res) {
      setName('')
      onChange()
    }
  }

  return (
    <SectionCard title="Depósitos" subtitle='Las ventas descuentan del depósito de consumo ("Cocina"). Usá depósitos extra (cámara, barra) y transferí entre ellos.'>
      <ul className="mb-4 space-y-1 text-sm">
        {storages.map((s) => (
          <li key={s._id} className="flex justify-between">
            <span className="font-bold">{s.name}</span>
            <span className="text-muted-foreground">{s.isDefaultConsumption ? 'Consumo de ventas' : s.isActive ? 'Activo' : 'Inactivo'}</span>
          </li>
        ))}
      </ul>
      <form onSubmit={create} className="flex flex-wrap gap-2">
        <input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (ej. Cámara)" className={`${fieldClass} flex-1`} />
        <select value={type} onChange={(e) => setType(e.target.value)} className={`${fieldClass} w-44`} aria-label="Tipo">
          <option value="cold_storage">Cámara / heladera</option>
          <option value="dry_storage">Depósito seco</option>
          <option value="bar">Barra</option>
          <option value="kitchen">Cocina</option>
          <option value="other">Otro</option>
        </select>
        <button type="submit" className={ghostButtonClass}>Agregar depósito</button>
      </form>
    </SectionCard>
  )
}

interface CostData { lines: Array<{ skuId: string; name: string; unit: string; quantity: number; costCents: number }>; totalCostCents: number; unmappedPortions: number }

function CostCard({ tenantSlug, locationId }: { tenantSlug: string; locationId: string }) {
  const { data } = useAsyncData(
    () => inventoryApi<CostData>(tenantSlug, `costs?locationId=${locationId}`, { silent: true }),
    `${tenantSlug}|${locationId}`,
  )

  return (
    <SectionCard
      title={`Costo de lo vendido (7 días): ${data ? pesos(data.totalCostCents) : '…'}`}
      subtitle={data?.unmappedPortions ? `${data.unmappedPortions} porciones vendidas sin receta no están incluidas.` : 'Consumo teórico por receta × costo promedio de compra.'}
    >
      {!data ? (
        <Loader2 className="mx-auto animate-spin text-muted-foreground" />
      ) : data.lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin ventas con receta en el período.</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {data.lines.slice(0, 15).map((l) => (
            <li key={l.skuId} className="flex justify-between py-1.5">
              <span>{l.name} <span className="text-muted-foreground">· {qty(l.quantity, l.unit)}</span></span>
              <span className="font-bold tabular-nums">{pesos(l.costCents)}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}
