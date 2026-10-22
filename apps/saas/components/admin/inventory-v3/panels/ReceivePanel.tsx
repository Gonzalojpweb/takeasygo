'use client'

// ============================================================================
// Recibir mercadería — varios insumos en una misma sesión
// ============================================================================
// Cargar → Revisar → Confirmar. El backend registra UNA línea por operación:
// no se presenta como transacción atómica. Cada línea muestra su resultado;
// si alguna falla, las demás quedan registradas y "Reintentar" reenvía solo
// las fallidas con el MISMO id (el servidor no duplica).
// ============================================================================

import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { CheckCircle2, PackagePlus, RefreshCw, Trash2, Truck, XCircle } from 'lucide-react'
import { invApi } from '../data/api'
import {
  addLine,
  emptySession,
  markResult,
  markSending,
  receiptBody,
  removeLine,
  sendableLines,
  summarize,
  updateLine,
  validateLine,
  type ReceiveLine,
  type ReceiveSession,
} from '@/lib/inventory/ui/receive-session'
import { compatibleUnits } from '@/lib/inventory/ui/fields'
import { UNIT_SHORT, formatQty, pesos } from '@/lib/inventory/ui/format'
import { EmptyBlock, Field, LoadingBlock, Notice, Panel, SearchPicker, Spinner, btnGhost, btnPrimary, btnSecondary, inputClass } from '../ui'
import { resolveStorage, type PanelProps } from './PanelHost'
import type { SkuOption } from '../data/types'
import { SKU_CATEGORIES } from '../RowsEditor'

type Action =
  | { t: 'add'; sku: SkuOption }
  | { t: 'update'; key: string; patch: Parameters<typeof updateLine>[2] }
  | { t: 'remove'; key: string }
  | { t: 'header'; patch: Partial<Pick<ReceiveSession, 'supplier' | 'invoice'>> }
  | { t: 'sending'; keys: string[] }
  | { t: 'result'; key: string; outcome: Parameters<typeof markResult>[2] }
  | { t: 'reset' }

function reducer(s: ReceiveSession, a: Action): ReceiveSession {
  switch (a.t) {
    case 'add':
      return addLine(s, a.sku)
    case 'update':
      return updateLine(s, a.key, a.patch)
    case 'remove':
      return removeLine(s, a.key)
    case 'header':
      return { ...s, ...a.patch }
    case 'sending':
      return markSending(s, a.keys)
    case 'result':
      return markResult(s, a.key, a.outcome)
    case 'reset':
      return emptySession()
  }
}

type Step = 'edit' | 'review' | 'sent'

export default function ReceivePanel({ ctx, onClose, onChanged, skuId }: PanelProps & { skuId: string | null }) {
  const allowCost = ctx.caps.read
  const storageDefault = resolveStorage(ctx, null)
  const [storageId, setStorageId] = useState(storageDefault)
  const [session, dispatch] = useReducer(reducer, null, () => {
    const pre = skuId ? ctx.skus.find((s) => s._id === skuId) : null
    return pre ? addLine(emptySession(), pre) : emptySession()
  })
  // Si el panel se abrió antes de que llegara el catálogo, el insumo pedido se agrega al llegar.
  const preselected = useRef(false)
  useEffect(() => {
    if (preselected.current || !skuId || !ctx.catalogReady) return
    preselected.current = true
    const pre = ctx.skus.find((s) => s._id === skuId)
    if (pre) dispatch({ t: 'add', sku: pre })
  }, [skuId, ctx.catalogReady, ctx.skus])
  const [step, setStep] = useState<Step>('edit')
  const [showErrors, setShowErrors] = useState(false)
  // Alta de un insumo que no está en el catálogo (ej. descartables), sin salir del panel.
  const [creating, setCreating] = useState<{ name: string; canonicalUnit: string; category: string } | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createBusy, setCreateBusy] = useState(false)

  async function createSku() {
    if (!creating) return
    setCreateBusy(true)
    setCreateError(null)
    const res = await invApi<{ sku: SkuOption }>(ctx.tenantSlug, 'skus', { method: 'POST', body: { ...creating, businessImpact: 'medium' } })
    setCreateBusy(false)
    if (!res.ok) {
      setCreateError(res.error.message)
      return
    }
    dispatch({ t: 'add', sku: res.data.sku })
    setCreating(null)
    ctx.refreshCatalog()
  }
  const opts = { allowCost }
  const summary = summarize(session)
  const raw = ctx.skus.filter((s) => s.kind === 'raw')
  const pickerItems = useMemo(
    () => raw.filter((s) => !session.lines.some((l) => l.sku._id === s._id && l.status !== 'done')).map((s) => ({ id: s._id, label: s.name, meta: UNIT_SHORT[s.canonicalUnit] })),
    [raw, session.lines],
  )

  async function send(lines: ReceiveLine[]) {
    if (!storageId || lines.length === 0) return
    dispatch({ t: 'sending', keys: lines.map((l) => l.key) })
    setStep('sent')
    // Secuencial: el orden de la factura se respeta y cada línea informa su resultado.
    let any = false
    for (const l of lines) {
      const res = await invApi<{ quantity: number; unit: string; unitCostCents: number | null; duplicate: boolean }>(ctx.tenantSlug, 'receipts', {
        method: 'POST',
        body: receiptBody(session, l, storageId, opts),
      })
      if (res.ok) any = true
      dispatch({ t: 'result', key: l.key, outcome: res.ok ? { ok: true, result: res.data } : { ok: false, error: res.error.message } })
    }
    if (any) onChanged()
  }

  if (!ctx.catalogReady) {
    return (
      <Panel open onOpenChange={(o) => !o && onClose()} title="Recibir mercadería">
        <LoadingBlock label="Cargando insumos" />
      </Panel>
    )
  }

  const pending = session.lines.filter((l) => l.status !== 'done')
  const invalid = pending.filter((l) => Object.keys(validateLine(l, opts)).length > 0)

  // ── Resultado ────────────────────────────────────────────────────────────
  if (step === 'sent') {
    const failed = session.lines.filter((l) => l.status === 'error')
    const sending = summary.sending > 0
    return (
      <Panel
        open
        onOpenChange={(o) => !o && !sending && onClose()}
        title="Recepción"
        description={sending ? 'Registrando línea por línea…' : undefined}
        footer={
          sending ? null : (
            <div className="flex flex-wrap gap-2">
              {failed.length > 0 && (
                <button type="button" className={btnPrimary} onClick={() => send(failed)}>
                  <RefreshCw size={18} aria-hidden /> Reintentar {failed.length === 1 ? 'la que falló' : `las ${failed.length} que fallaron`}
                </button>
              )}
              {failed.length > 0 && (
                <button type="button" className={btnSecondary} onClick={() => setStep('edit')}>
                  Corregir
                </button>
              )}
              <button
                type="button"
                className={failed.length ? btnGhost : btnPrimary}
                onClick={() => {
                  dispatch({ t: 'reset' })
                  setStep('edit')
                }}
              >
                Registrar otra recepción
              </button>
              <button type="button" className={btnGhost} onClick={onClose}>
                Cerrar
              </button>
            </div>
          )
        }
      >
        <div className="space-y-4" aria-live="polite">
          {!sending && failed.length === 0 && <Notice tone="success">Listo: se registraron {summary.done} {summary.done === 1 ? 'insumo' : 'insumos'}.</Notice>}
          {!sending && failed.length > 0 && (
            <Notice tone="error">
              {summary.done > 0
                ? `${summary.done} quedaron registrados y ${failed.length} no. Lo que no se registró conserva lo que cargaste.`
                : 'No se pudo registrar. Lo que cargaste sigue acá.'}
            </Notice>
          )}
          <ul className="space-y-2">
            {session.lines.map((l) => (
              <li key={l.key} className="flex items-start justify-between gap-3 rounded-xl border-2 border-border p-3">
                <div>
                  <p className="font-bold">{l.sku.name}</p>
                  {l.result && (
                    <p className="text-sm text-muted-foreground">
                      {formatQty(l.result.quantity, l.result.unit)}
                      {allowCost && l.result.unitCostCents !== null && ` a ${pesos(l.result.unitCostCents)}/${UNIT_SHORT[l.result.unit]}`}
                      {l.result.duplicate && ' · ya estaba registrada'}
                    </p>
                  )}
                  {l.serverError && <p className="text-sm font-semibold text-red-700 dark:text-red-300">{l.serverError}</p>}
                </div>
                <span className="shrink-0 text-sm font-bold">
                  {l.status === 'sending' && <Spinner label={`Registrando ${l.sku.name}`} />}
                  {l.status === 'done' && (
                    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 size={18} aria-hidden /> Registrada
                    </span>
                  )}
                  {l.status === 'error' && (
                    <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-300">
                      <XCircle size={18} aria-hidden /> No se registró
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Panel>
    )
  }

  // ── Revisión ─────────────────────────────────────────────────────────────
  if (step === 'review') {
    const toSend = sendableLines(session, opts)
    return (
      <Panel
        open
        onOpenChange={(o) => !o && onClose()}
        title="Revisá antes de confirmar"
        description="Cada insumo se registra por separado: si alguno falla, los demás quedan registrados."
        footer={
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnPrimary} onClick={() => send(toSend)} autoFocus>
              <Truck size={18} aria-hidden /> Confirmar recepción ({toSend.length})
            </button>
            <button type="button" className={btnSecondary} onClick={() => setStep('edit')}>
              Volver a editar
            </button>
          </div>
        }
      >
        <dl className="mb-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="font-bold">Proveedor</dt>
            <dd className="text-muted-foreground">{session.supplier || '—'}</dd>
          </div>
          <div>
            <dt className="font-bold">Factura o remito</dt>
            <dd className="text-muted-foreground">{session.invoice || '—'}</dd>
          </div>
        </dl>
        <ul className="space-y-2">
          {toSend.map((l) => (
            <li key={l.key} className="rounded-xl border-2 border-border p-3">
              <p className="font-bold">{l.sku.name}</p>
              <p className="text-sm text-muted-foreground">
                {l.byPack ? `${l.quantity} ${l.packLabel} de ${l.packSize} ${UNIT_SHORT[l.packUnit]}` : `${l.quantity} ${UNIT_SHORT[l.unit]}`}
                {allowCost && l.total.trim() && ` · total $${l.total}`}
              </p>
            </li>
          ))}
        </ul>
      </Panel>
    )
  }

  // ── Carga ────────────────────────────────────────────────────────────────
  return (
    <Panel
      open
      onOpenChange={(o) => !o && onClose()}
      title="Recibir mercadería"
      description="Cargá lo que llegó como figura en el remito. Podés sumar varios insumos."
      wide
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={btnPrimary}
            disabled={pending.length === 0 || !storageId}
            onClick={() => {
              setShowErrors(true)
              if (invalid.length === 0) setStep('review')
            }}
          >
            Revisar ({pending.length})
          </button>
          {showErrors && invalid.length > 0 && (
            <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">
              Revisá {invalid.length === 1 ? 'la línea marcada' : `las ${invalid.length} líneas marcadas`}.
            </p>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        {!storageId && <Notice tone="error">La sede no tiene depósito de inventario. Primero hay que prepararla.</Notice>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Proveedor (opcional)">
            {(a11y) => <input {...a11y} value={session.supplier} maxLength={120} onChange={(e) => dispatch({ t: 'header', patch: { supplier: e.target.value } })} className={inputClass} />}
          </Field>
          <Field label="Factura o remito (opcional)">
            {(a11y) => <input {...a11y} value={session.invoice} maxLength={80} onChange={(e) => dispatch({ t: 'header', patch: { invoice: e.target.value } })} className={inputClass} />}
          </Field>
          {ctx.storages.length > 1 && (
            <Field label="Depósito" className="sm:col-span-2">
              {(a11y) => (
                <select {...a11y} value={storageId ?? ''} onChange={(e) => setStorageId(e.target.value)} className={inputClass}>
                  {ctx.storages.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}
        </div>

        {creating ? (
          <div className="space-y-3 rounded-2xl border-2 border-primary/40 bg-primary/5 p-4">
            <p className="font-bold">Nuevo insumo: «{creating.name}»</p>
            {createError && <Notice tone="error">{createError}</Notice>}
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
              <button type="button" className={btnPrimary} onClick={createSku} disabled={createBusy}>
                {createBusy ? <Spinner label="Creando insumo" /> : <PackagePlus size={16} aria-hidden />} Crear y agregar
              </button>
              <button type="button" className={btnGhost} onClick={() => setCreating(null)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <SearchPicker
            label="Agregar insumo"
            placeholder="Buscá por nombre…"
            items={pickerItems}
            autoFocus={!skuId}
            onPick={(id) => {
              const sku = ctx.skus.find((s) => s._id === id)
              if (sku) dispatch({ t: 'add', sku })
            }}
            onCreate={ctx.caps.recipes ? (name) => setCreating({ name, canonicalUnit: 'kg', category: 'other' }) : undefined}
            createLabel="Crear insumo"
          />
        )}

        {session.lines.length === 0 ? (
          <EmptyBlock icon={<PackagePlus size={28} />} title="Todavía no agregaste insumos">
            Buscá cada insumo del remito y escribí cuánto llegó.
          </EmptyBlock>
        ) : (
          <ul className="space-y-3">
            {session.lines.map((l) => (
              <LineEditor
                key={l.key}
                line={l}
                allowCost={allowCost}
                showErrors={showErrors}
                onChange={(patch) => dispatch({ t: 'update', key: l.key, patch })}
                onRemove={() => dispatch({ t: 'remove', key: l.key })}
              />
            ))}
          </ul>
        )}
      </div>
    </Panel>
  )
}

function LineEditor({
  line,
  allowCost,
  showErrors,
  onChange,
  onRemove,
}: {
  line: ReceiveLine
  allowCost: boolean
  showErrors: boolean
  onChange: (patch: Parameters<typeof updateLine>[2]) => void
  onRemove: () => void
}) {
  const errors = showErrors ? validateLine(line, { allowCost }) : {}
  const units = compatibleUnits(line.sku.canonicalUnit)
  if (line.status === 'done') {
    return (
      <li className="flex items-center justify-between gap-2 rounded-2xl border-2 border-emerald-600/30 bg-emerald-50/50 p-3 text-sm dark:bg-emerald-950/20">
        <span className="font-bold">{line.sku.name}</span>
        <span className="inline-flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 size={16} aria-hidden /> Registrada
        </span>
      </li>
    )
  }
  return (
    <li className="space-y-3 rounded-2xl border-2 border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-black">{line.sku.name}</p>
        <button type="button" onClick={onRemove} className={`${btnGhost} min-w-11`} aria-label={`Quitar ${line.sku.name}`}>
          <Trash2 size={18} aria-hidden />
        </button>
      </div>
      {line.serverError && <Notice tone="error">{line.serverError}</Notice>}
      <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={line.byPack} onChange={(e) => onChange({ byPack: e.target.checked })} className="size-5" />
        Viene en presentación (caja, bolsa, cajón…)
      </label>
      {line.byPack ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Cantidad" error={errors.quantity}>
            {(a11y) => <input {...a11y} inputMode="decimal" value={line.quantity} onChange={(e) => onChange({ quantity: e.target.value })} className={inputClass} placeholder="2" />}
          </Field>
          <Field label="Presentación" error={errors.packLabel}>
            {(a11y) => <input {...a11y} value={line.packLabel} maxLength={40} onChange={(e) => onChange({ packLabel: e.target.value })} className={inputClass} />}
          </Field>
          <Field label="Cada una trae" error={errors.packSize}>
            {(a11y) => <input {...a11y} inputMode="decimal" value={line.packSize} onChange={(e) => onChange({ packSize: e.target.value })} className={inputClass} placeholder="6" />}
          </Field>
          <Field label="Unidad">
            {(a11y) => (
              <select {...a11y} value={line.packUnit} onChange={(e) => onChange({ packUnit: e.target.value })} className={inputClass}>
                {units.map((u) => (
                  <option key={u} value={u}>
                    {UNIT_SHORT[u]}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
      ) : (
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Cantidad" error={errors.quantity}>
            {(a11y) => <input {...a11y} inputMode="decimal" value={line.quantity} onChange={(e) => onChange({ quantity: e.target.value })} className={inputClass} placeholder="10" />}
          </Field>
          <Field label="Unidad">
            {(a11y) => (
              <select {...a11y} value={line.unit} onChange={(e) => onChange({ unit: e.target.value })} className={`${inputClass} w-24`}>
                {units.map((u) => (
                  <option key={u} value={u}>
                    {UNIT_SHORT[u]}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
      )}
      {allowCost && (
        <Field label="Total pagado por esta línea ($, opcional)" error={errors.total} hint="Con el total, el sistema calcula el costo por unidad.">
          {(a11y) => <input {...a11y} inputMode="decimal" value={line.total} onChange={(e) => onChange({ total: e.target.value })} className={inputClass} placeholder="54.000" />}
        </Field>
      )}
    </li>
  )
}
