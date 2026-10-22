'use client'

// ============================================================================
// Configuración de la sede (gestión): depósitos, costos y herramientas
// ============================================================================
// · Depósitos: el de consumo ("Cocina") recibe los descuentos de las ventas;
//   se pueden sumar cámara, barra, depósito seco y transferir entre ellos.
// · Costo de lo vendido (7 días): consumo teórico por receta × costo promedio.
// · Herramientas: revisar ventas recientes (idempotente) y recalcular el
//   stock desde el historial (solo administradores; no cambia el historial).
// ============================================================================

import { useState } from 'react'
import { Plus, RefreshCw, Warehouse } from 'lucide-react'
import { invApi } from '../data/api'
import { useResource } from '../data/useResource'
import { formatQty, pesos } from '@/lib/inventory/ui/format'
import { ErrorBlock, Field, LoadingBlock, Notice, Panel, Spinner, StatusTag, btnGhost, btnSecondary, inputClass } from '../ui'
import type { PanelProps } from './PanelHost'

const TYPES: Array<[string, string]> = [
  ['cold_storage', 'Cámara o heladera'],
  ['dry_storage', 'Depósito seco'],
  ['bar', 'Barra'],
  ['kitchen', 'Cocina'],
  ['other', 'Otro'],
]

interface CostData {
  lines: Array<{ skuId: string; name: string; unit: string; quantity: number; costCents: number }>
  totalCostCents: number
  unmappedPortions: number
}

export default function LocationSettingsPanel({ ctx, onClose, onChanged }: PanelProps) {
  const storages = ctx.allStorages.filter((s) => s.locationId === ctx.location.id)
  const [name, setName] = useState('')
  const [type, setType] = useState('cold_storage')
  const [nameError, setNameError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null)
  const costs = useResource(ctx.caps.read ? `${ctx.tenantSlug}|costs|${ctx.location.id}|${ctx.version}` : null, (signal) =>
    invApi<CostData>(ctx.tenantSlug, `costs?locationId=${ctx.location.id}`, { signal }),
  )

  async function run(key: string, fn: () => Promise<{ ok: boolean; text: string }>) {
    setBusy(key)
    setMessage(null)
    const r = await fn()
    setBusy(null)
    setMessage({ tone: r.ok ? 'success' : 'error', text: r.text })
    if (r.ok) onChanged()
  }

  async function addStorage(e: React.FormEvent) {
    e.preventDefault()
    if (name.trim().length < 2) {
      setNameError('Poné un nombre (ej.: Cámara)')
      return
    }
    setNameError(null)
    await run('add', async () => {
      const res = await invApi(ctx.tenantSlug, 'storage-locations', { method: 'POST', body: { locationId: ctx.location.id, name: name.trim(), type } })
      if (res.ok) setName('')
      return res.ok ? { ok: true, text: 'Depósito agregado.' } : { ok: false, text: res.error.message }
    })
  }

  return (
    <Panel open onOpenChange={(o) => !o && onClose()} title={`Configuración de ${ctx.location.name}`} wide>
      <div className="space-y-8">
        {message && <Notice tone={message.tone}>{message.text}</Notice>}

        <section aria-labelledby="storages-title" className="space-y-3">
          <h3 id="storages-title" className="text-base font-black">
            Depósitos
          </h3>
          <p className="text-sm text-muted-foreground">Las ventas descuentan del depósito de consumo. Sumá otros para separar la cámara, la barra o el depósito seco.</p>
          <ul className="space-y-2">
            {storages.map((s) => (
              <li key={s._id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-border p-3">
                {renaming?.id === s._id ? (
                  <form
                    className="flex flex-1 flex-wrap items-end gap-2"
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (renaming.value.trim().length < 2) return
                      run(`rename:${s._id}`, async () => {
                        const res = await invApi(ctx.tenantSlug, `storage-locations/${s._id}`, { method: 'PATCH', body: { name: renaming.value.trim() } })
                        if (res.ok) setRenaming(null)
                        return res.ok ? { ok: true, text: 'Nombre actualizado.' } : { ok: false, text: res.error.message }
                      })
                    }}
                  >
                    <Field label="Nuevo nombre" className="flex-1">
                      {(a11y) => <input {...a11y} autoFocus value={renaming.value} maxLength={80} onChange={(e) => setRenaming({ id: s._id, value: e.target.value })} className={inputClass} />}
                    </Field>
                    <button type="submit" className={btnSecondary} disabled={busy !== null}>
                      Guardar
                    </button>
                    <button type="button" className={btnGhost} onClick={() => setRenaming(null)}>
                      Cancelar
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Warehouse size={18} aria-hidden />
                      <span className="font-bold">{s.name}</span>
                      {s.isDefaultConsumption && <StatusTag tone="info">Consumo de ventas</StatusTag>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={btnGhost} onClick={() => setRenaming({ id: s._id, value: s.name })}>
                        Renombrar
                      </button>
                      {!s.isDefaultConsumption && (
                        <button
                          type="button"
                          className={btnGhost}
                          disabled={busy !== null}
                          onClick={() =>
                            run(`off:${s._id}`, async () => {
                              const res = await invApi(ctx.tenantSlug, `storage-locations/${s._id}`, { method: 'PATCH', body: { isActive: false } })
                              return res.ok ? { ok: true, text: `${s.name} desactivado.` } : { ok: false, text: res.error.message }
                            })
                          }
                        >
                          Desactivar
                        </button>
                      )}
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
          <form onSubmit={addStorage} className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
            <Field label="Nuevo depósito" error={nameError}>
              {(a11y) => <input {...a11y} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Ej.: Cámara" />}
            </Field>
            <Field label="Tipo">
              {(a11y) => (
                <select {...a11y} value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
                  {TYPES.map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <button type="submit" className={btnSecondary} disabled={busy !== null}>
              {busy === 'add' ? <Spinner label="Agregando" /> : <Plus size={18} aria-hidden />} Agregar
            </button>
          </form>
        </section>

        {ctx.caps.read && (
          <section aria-labelledby="costs-title" className="space-y-3">
            <h3 id="costs-title" className="text-base font-black">
              Costo de lo vendido (últimos 7 días)
            </h3>
            {costs.status === 'loading' && <LoadingBlock rows={2} label="Calculando costos" />}
            {costs.status === 'error' && !costs.data && <ErrorBlock error={costs.error} onRetry={costs.reload} what="los costos" />}
            {costs.data && (
              <>
                <p className="text-2xl font-black">{pesos(costs.data.totalCostCents)}</p>
                <p className="text-sm text-muted-foreground">
                  Consumo teórico por receta × costo promedio de compra.
                  {costs.data.unmappedPortions > 0 && ` No incluye ${costs.data.unmappedPortions} porciones vendidas sin receta.`}
                </p>
                {costs.data.lines.length > 0 && (
                  <ul className="divide-y divide-border rounded-xl border-2 border-border text-sm">
                    {costs.data.lines.slice(0, 10).map((l) => (
                      <li key={l.skuId} className="flex justify-between gap-2 px-3 py-2">
                        <span>
                          {l.name} <span className="text-muted-foreground">· {formatQty(l.quantity, l.unit)}</span>
                        </span>
                        <span className="font-bold tabular-nums">{pesos(l.costCents)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>
        )}

        <section aria-labelledby="tools-title" className="space-y-3">
          <h3 id="tools-title" className="text-base font-black">
            Herramientas
          </h3>
          <div className="flex flex-col gap-3 rounded-xl border-2 border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-bold">Revisar ventas de las últimas 36 horas</p>
              <p className="text-sm text-muted-foreground">Registra lo que haya faltado descontar. Es seguro repetirlo: nunca duplica.</p>
            </div>
            <button
              type="button"
              className={btnSecondary}
              disabled={busy !== null}
              onClick={() =>
                run('reconcile', async () => {
                  const res = await invApi<{ orders: number; events: number; unmappedLines: number }>(ctx.tenantSlug, 'sales/reconcile', { method: 'POST', body: { hours: 36 } })
                  return res.ok
                    ? { ok: true, text: `Revisados ${res.data.orders} pedidos: ${res.data.events} movimientos nuevos${res.data.unmappedLines ? ` · ${res.data.unmappedLines} platos sin receta` : ''}.` }
                    : { ok: false, text: res.error.message }
                })
              }
            >
              {busy === 'reconcile' ? <Spinner label="Revisando ventas" /> : <RefreshCw size={18} aria-hidden />} Revisar ventas
            </button>
          </div>
          <div className="flex flex-col gap-3 rounded-xl border-2 border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-bold">Recalcular el stock</p>
              <p className="text-sm text-muted-foreground">Rehace las estimaciones desde el historial. No cambia ningún movimiento. Solo administradores.</p>
            </div>
            <button
              type="button"
              className={btnSecondary}
              disabled={busy !== null}
              onClick={() =>
                run('rebuild', async () => {
                  const res = await invApi<{ aggregates: number }>(ctx.tenantSlug, 'rebuild', { method: 'POST', body: {} })
                  return res.ok ? { ok: true, text: `Stock recalculado (${res.data.aggregates} insumos).` } : { ok: false, text: res.error.message }
                })
              }
            >
              {busy === 'rebuild' ? <Spinner label="Recalculando" /> : <RefreshCw size={18} aria-hidden />} Recalcular
            </button>
          </div>
        </section>
      </div>
    </Panel>
  )
}
