'use client'

// ============================================================================
// Envíos entre sedes (F1) — pedir → autorizar → despachar → recibir
// ============================================================================
// Bandeja de la sede: lo que pidió, lo que le pidieron y lo que viene en
// camino. Cada tarjeta muestra solo los botones que el usuario puede usar
// (los calcula el servidor). Las reglas viven en lib/inventory/transfer-flow.
// ============================================================================

import { useMemo, useState } from 'react'
import { ArrowRight, PackageCheck, Plus, Send, Trash2, Truck } from 'lucide-react'
import { invApi } from '../data/api'
import { useResource } from '../data/useResource'
import { EmptyBlock, ErrorBlock, Field, FilterChip, LoadingBlock, Notice, Panel, SearchPicker, Spinner, StatusTag, btnPrimary, btnSecondary, inputClass, type Tone } from '../ui'
import { parseDecimal } from '@/lib/inventory/ui/fields'
import { UNIT_SHORT, formatQty, pesos, relativeTime } from '@/lib/inventory/ui/format'
import type { V3Context } from '../InventoryV3'
import type { TransferAction, TransferView } from '@/lib/inventory/transfer-flow'
import type { TransferStatus } from '@/models/InventoryTransfer'

const STATUS: Record<TransferStatus, { label: string; tone: Tone }> = {
  requested: { label: 'Pedida', tone: 'warning' },
  approved: { label: 'Autorizada', tone: 'info' },
  dispatched: { label: 'En camino', tone: 'info' },
  received: { label: 'Recibida', tone: 'ok' },
  rejected: { label: 'Rechazada', tone: 'danger' },
  cancelled: { label: 'Cancelada', tone: 'neutral' },
}

interface ListData {
  transfers: TransferView[]
  sedes: Array<{ id: string; name: string }>
}

type NewMode = 'request' | 'send'
type ActionPanel = { transfer: TransferView; action: Exclude<TransferAction, 'cancel'> }

export default function TransfersView({ ctx }: { ctx: V3Context }) {
  const [open, setOpen] = useState(true)
  const [tick, setTick] = useState(0)
  const [newMode, setNewMode] = useState<NewMode | null>(null)
  const [action, setAction] = useState<ActionPanel | null>(null)
  const [busyCancel, setBusyCancel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const data = useResource(`${ctx.tenantSlug}|transfer-requests|${ctx.location.id}|${open}|${ctx.version}|${tick}`, (signal) =>
    invApi<ListData>(ctx.tenantSlug, `transfer-requests?locationId=${ctx.location.id}&estado=${open ? 'abiertas' : 'cerradas'}`, { signal }),
  )
  const refresh = () => setTick((n) => n + 1)

  async function cancel(t: TransferView) {
    setBusyCancel(t.transferId)
    setError(null)
    const res = await invApi(ctx.tenantSlug, `transfer-requests/${t.transferId}`, { method: 'PATCH', body: { action: 'cancel' } })
    setBusyCancel(null)
    if (!res.ok) setError(res.error.message)
    refresh()
  }

  const sedes = data.data?.sedes ?? []
  const others = sedes.filter((s) => s.id !== ctx.location.id)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Pedí mercadería a otra sede o mandá lo que te sobra. El stock sale del origen cuando se despacha y entra en {ctx.location.name} cuando lo reciben; si llega menos, queda anotada la diferencia.
        </p>
        <div className="flex flex-wrap gap-2">
          {ctx.caps.capture && others.length > 0 && (
            <button type="button" className={btnPrimary} onClick={() => setNewMode('request')}>
              <Plus size={18} aria-hidden /> Pedir mercadería
            </button>
          )}
          {ctx.caps.manage && others.length > 0 && (
            <button type="button" className={btnSecondary} onClick={() => setNewMode('send')}>
              <Send size={18} aria-hidden /> Enviar sin pedido
            </button>
          )}
        </div>
      </div>

      <div role="group" aria-label="Qué envíos ver" className="flex flex-wrap gap-2">
        <FilterChip active={open} onClick={() => setOpen(true)}>Abiertos</FilterChip>
        <FilterChip active={!open} onClick={() => setOpen(false)}>Terminados</FilterChip>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {data.status === 'loading' ? (
        <LoadingBlock label="Cargando envíos" rows={3} />
      ) : data.status === 'error' && !data.data ? (
        <ErrorBlock error={data.error} onRetry={data.reload} what="los envíos" />
      ) : data.data!.transfers.length === 0 ? (
        <EmptyBlock icon={<Truck size={28} />} title={open ? 'No hay envíos abiertos' : 'Todavía no hay envíos terminados'}>
          {open && others.length > 0 ? 'Cuando pidas o te pidan mercadería, aparece acá.' : others.length === 0 ? 'Hace falta otra sede para transferir mercadería.' : null}
        </EmptyBlock>
      ) : (
        <ul className="space-y-3" aria-label="Envíos">
          {data.data!.transfers.map((t) => (
            <TransferCard
              key={t.transferId}
              t={t}
              here={ctx.location.id}
              busy={busyCancel === t.transferId}
              onAction={(a) => (a === 'cancel' ? cancel(t) : setAction({ transfer: t, action: a }))}
            />
          ))}
        </ul>
      )}

      {newMode && (
        <NewTransferPanel
          ctx={ctx}
          mode={newMode}
          sedes={others}
          onClose={() => setNewMode(null)}
          onDone={() => {
            setNewMode(null)
            setOpen(true)
            refresh()
          }}
        />
      )}
      {action && (
        <ActionPanelView
          ctx={ctx}
          panel={action}
          onClose={() => setAction(null)}
          onDone={() => {
            setAction(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}

const ACTION_BUTTON: Record<TransferAction, string> = {
  approve: 'Autorizar',
  reject: 'Rechazar',
  dispatch: 'Despachar',
  receive: 'Recibir',
  cancel: 'Cancelar',
}

function qtyText(n: number | null, unit: string) {
  return n === null ? '—' : formatQty(n, unit)
}

function TransferCard({ t, here, busy, onAction }: { t: TransferView; here: string; busy: boolean; onAction: (a: TransferAction) => void }) {
  const s = STATUS[t.status]
  const incoming = t.to.id === here
  const last = t.steps.received ?? t.steps.dispatched ?? t.steps.approved ?? t.steps.rejected ?? t.steps.cancelled ?? t.steps.requested
  const showReceived = t.status === 'received'
  const showDispatched = showReceived || t.status === 'dispatched'
  return (
    <li className="rounded-2xl border-2 border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <StatusTag tone={s.tone}>{s.label}</StatusTag>
          <span className="flex min-w-0 items-center gap-1.5 font-bold">
            <span className="truncate">{t.from.name}</span>
            <ArrowRight size={16} aria-label="a" className="shrink-0 text-muted-foreground" />
            <span className="truncate">{t.to.name}</span>
          </span>
          <span className="text-xs font-semibold text-muted-foreground">{incoming ? 'Entra acá' : 'Sale de acá'}</span>
        </div>
        {last && <span className="text-xs text-muted-foreground">{relativeTime(last.at)}{last.by ? ` · ${last.by}` : ''}</span>}
      </div>

      <table className="mt-3 w-full text-sm">
        <caption className="sr-only">Insumos del envío</caption>
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="py-1 text-left font-medium">Insumo</th>
            <th scope="col" className="py-1 text-right font-medium">Pedido</th>
            {showDispatched && <th scope="col" className="py-1 text-right font-medium">Despachado</th>}
            {showReceived && <th scope="col" className="py-1 text-right font-medium">Recibido</th>}
          </tr>
        </thead>
        <tbody>
          {t.lines.map((l) => (
            <tr key={l.skuId} className="border-t border-border">
              <td className="py-1.5 font-medium">{l.name}</td>
              <td className="py-1.5 text-right tabular-nums">
                {qtyText(l.requested, l.unit)}
                {l.approved !== null && l.approved !== l.requested && <span className="block text-xs text-muted-foreground">autorizado {qtyText(l.approved, l.unit)}</span>}
              </td>
              {showDispatched && <td className="py-1.5 text-right tabular-nums">{qtyText(l.dispatched, l.unit)}</td>}
              {showReceived && (
                <td className="py-1.5 text-right tabular-nums">
                  {qtyText(l.received, l.unit)}
                  {l.difference !== null && l.difference !== 0 && (
                    <span className={`block text-xs font-semibold ${l.difference > 0 ? 'text-red-700 dark:text-red-300' : 'text-sky-700 dark:text-sky-300'}`}>
                      {l.difference > 0 ? `faltó ${formatQty(l.difference, l.unit)}` : `llegó ${formatQty(-l.difference, l.unit)} de más`}
                    </span>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {(t.note || t.rejectReason || t.receiveNote || t.differenceCostCents > 0) && (
        <div className="mt-2 space-y-0.5 text-sm text-muted-foreground">
          {t.note && <p>Nota: {t.note}</p>}
          {t.rejectReason && <p>Motivo del rechazo: {t.rejectReason}</p>}
          {t.receiveNote && <p>Al recibir: {t.receiveNote}</p>}
          {t.differenceCostCents > 0 && <p className="font-semibold text-red-700 dark:text-red-300">Diferencia del envío: {pesos(t.differenceCostCents)} a costo</p>}
        </div>
      )}

      {t.actions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {t.actions.map((a) => (
            <button
              key={a}
              type="button"
              disabled={busy}
              onClick={() => onAction(a)}
              className={a === 'approve' || a === 'dispatch' || a === 'receive' ? btnPrimary : btnSecondary}
            >
              {a === 'cancel' && busy && <Spinner label="Cancelando" />}
              {a === 'receive' && <PackageCheck size={18} aria-hidden />}
              {a === 'dispatch' && <Truck size={18} aria-hidden />}
              {ACTION_BUTTON[a]}
            </button>
          ))}
        </div>
      )}
    </li>
  )
}

// ── Nuevo pedido / envío directo ────────────────────────────────────────────

function NewTransferPanel({ ctx, mode, sedes, onClose, onDone }: { ctx: V3Context; mode: NewMode; sedes: Array<{ id: string; name: string }>; onClose: () => void; onDone: () => void }) {
  const [other, setOther] = useState(sedes[0]?.id ?? '')
  const hereStorages = ctx.allStorages.filter((s) => s.locationId === ctx.location.id)
  const [storage, setStorage] = useState(hereStorages.find((s) => s.isDefaultConsumption)?._id ?? hereStorages[0]?._id ?? '')
  const [lines, setLines] = useState<Array<{ skuId: string; value: string }>>([])
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const pickable = useMemo(
    () => ctx.skus.filter((s) => !lines.some((l) => l.skuId === s._id)).map((s) => ({ id: s._id, label: s.name, meta: UNIT_SHORT[s.canonicalUnit] })),
    [ctx.skus, lines],
  )
  const sku = (id: string) => ctx.skus.find((s) => s._id === id)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    const parsed = lines.map((l) => ({ skuId: l.skuId, quantity: parseDecimal(l.value) }))
    for (const p of parsed) if (p.quantity === null || p.quantity <= 0) errs[p.skuId] = 'Indicá cuánto'
    if (!other) errs.other = 'Elegí la sede'
    if (lines.length === 0) errs.lines = 'Agregá al menos un insumo'
    if (mode === 'send' && !storage) errs.storage = 'Elegí de qué depósito sale'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    setServerError(null)
    const body =
      mode === 'request'
        ? { fromLocationId: other, toLocationId: ctx.location.id, toStorageLocationId: storage || undefined, lines: parsed, note: note.trim() || undefined }
        : { fromLocationId: ctx.location.id, toLocationId: other, lines: parsed, note: note.trim() || undefined, dispatchNow: { fromStorageLocationId: storage } }
    const res = await invApi(ctx.tenantSlug, 'transfer-requests', { method: 'POST', body })
    setBusy(false)
    if (!res.ok) setServerError(res.error.message)
    else onDone()
  }

  return (
    <Panel
      open
      onOpenChange={(o) => !o && onClose()}
      title={mode === 'request' ? 'Pedir mercadería' : 'Enviar sin pedido'}
      description={mode === 'request' ? `Llega a ${ctx.location.name}. La otra sede lo autoriza y lo despacha.` : `Sale de ${ctx.location.name} ahora mismo; la otra sede lo recibe.`}
      footer={
        <button type="submit" form="new-transfer" className={`${btnPrimary} w-full`} disabled={busy}>
          {busy && <Spinner label="Guardando" />} {mode === 'request' ? 'Enviar pedido' : 'Despachar'}
        </button>
      }
    >
      <form id="new-transfer" onSubmit={submit} className="space-y-5" noValidate>
        {serverError && <Notice tone="error">{serverError}</Notice>}
        <Field label={mode === 'request' ? '¿A qué sede le pedís?' : '¿A qué sede lo mandás?'} error={errors.other}>
          {(a) => (
            <select {...a} className={inputClass} value={other} onChange={(e) => setOther(e.target.value)}>
              {sedes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </Field>
        {hereStorages.length > 0 && (
          <Field label={mode === 'request' ? '¿En qué depósito entra?' : '¿De qué depósito sale?'} error={errors.storage}>
            {(a) => (
              <select {...a} className={inputClass} value={storage} onChange={(e) => setStorage(e.target.value)}>
                {hereStorages.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            )}
          </Field>
        )}
        <SearchPicker label="Agregar insumo" placeholder="Buscar insumo…" items={pickable} onPick={(id) => setLines((ls) => [...ls, { skuId: id, value: '' }])} error={errors.lines} />
        {lines.length > 0 && (
          <ul className="space-y-3" aria-label="Insumos a transferir">
            {lines.map((l, i) => {
              const s = sku(l.skuId)
              return (
                <li key={l.skuId} className="flex items-end gap-2">
                  <Field label={s?.name ?? 'Insumo'} hint={s ? `En ${UNIT_SHORT[s.canonicalUnit]}` : undefined} error={errors[l.skuId]} className="flex-1">
                    {(a) => (
                      <input {...a} inputMode="decimal" className={inputClass} value={l.value} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                    )}
                  </Field>
                  <button type="button" className={`${btnSecondary} mb-0.5`} aria-label={`Quitar ${s?.name ?? 'insumo'}`} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                    <Trash2 size={18} aria-hidden />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <Field label="Nota (opcional)">
          {(a) => <input {...a} className={inputClass} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: para el fin de semana" />}
        </Field>
      </form>
    </Panel>
  )
}

// ── Autorizar / rechazar / despachar / recibir ─────────────────────────────

const PANEL_TEXT: Record<ActionPanel['action'], { title: string; qtyLabel: string; submit: string; help: string }> = {
  approve: { title: 'Autorizar envío', qtyLabel: 'Cuánto autorizás', submit: 'Autorizar', help: 'Podés autorizar menos de lo pedido (0 = no se manda ese insumo). Todavía no sale nada del depósito.' },
  dispatch: { title: 'Despachar', qtyLabel: 'Cuánto sale', submit: 'Despachar', help: 'Al despachar, la mercadería sale del depósito de origen.' },
  receive: { title: 'Recibir mercadería', qtyLabel: 'Cuánto llegó', submit: 'Confirmar recepción', help: 'Contá lo que llegó. Si es menos de lo despachado, queda anotado como diferencia del envío.' },
  reject: { title: 'Rechazar pedido', qtyLabel: '', submit: 'Rechazar', help: 'La otra sede ve el motivo.' },
}

function ActionPanelView({ ctx, panel, onClose, onDone }: { ctx: V3Context; panel: ActionPanel; onClose: () => void; onDone: () => void }) {
  const { transfer: t, action } = panel
  const text = PANEL_TEXT[action]
  const base = (l: TransferView['lines'][number]) => (action === 'approve' ? l.requested : action === 'dispatch' ? l.approved ?? l.requested : l.dispatched ?? 0)
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(t.lines.map((l) => [l.skuId, String(base(l))])))
  const storageLoc = action === 'receive' ? t.to.id : t.from.id
  const storages = ctx.allStorages.filter((s) => s.locationId === storageLoc)
  const current = action === 'receive' ? t.to.storageId : t.from.storageId
  const [storage, setStorage] = useState(current ?? storages.find((s) => s.isDefaultConsumption)?._id ?? storages[0]?._id ?? '')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    const lines = t.lines.map((l) => ({ skuId: l.skuId, quantity: parseDecimal(values[l.skuId] ?? '') }))
    if (action !== 'reject') for (const l of lines) if (l.quantity === null || l.quantity < 0) errs[l.skuId] = 'Indicá una cantidad (0 si nada)'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    setServerError(null)
    const body =
      action === 'reject'
        ? { action, reason: reason.trim() || undefined }
        : action === 'approve'
          ? { action, lines, fromStorageLocationId: storage || undefined }
          : action === 'dispatch'
            ? { action, lines, fromStorageLocationId: storage || undefined }
            : { action, lines, toStorageLocationId: storage || undefined, note: reason.trim() || undefined }
    const res = await invApi(ctx.tenantSlug, `transfer-requests/${t.transferId}`, { method: 'PATCH', body })
    setBusy(false)
    if (!res.ok) setServerError(res.error.message)
    else onDone()
  }

  return (
    <Panel
      open
      onOpenChange={(o) => !o && onClose()}
      title={text.title}
      description={`${t.from.name} → ${t.to.name}. ${text.help}`}
      footer={
        <button type="submit" form="transfer-action" className={`${btnPrimary} w-full`} disabled={busy}>
          {busy && <Spinner label="Guardando" />} {text.submit}
        </button>
      }
    >
      <form id="transfer-action" onSubmit={submit} className="space-y-5" noValidate>
        {serverError && <Notice tone="error">{serverError}</Notice>}
        {action !== 'reject' && storages.length > 0 && (
          <Field label={action === 'receive' ? '¿En qué depósito entra?' : '¿De qué depósito sale?'}>
            {(a) => (
              <select {...a} className={inputClass} value={storage} onChange={(e) => setStorage(e.target.value)}>
                {storages.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            )}
          </Field>
        )}
        {action !== 'reject' && (
          <ul className="space-y-3" aria-label={text.qtyLabel}>
            {t.lines.map((l) => {
              const parsed = parseDecimal(values[l.skuId] ?? '')
              const diff = action === 'receive' && parsed !== null && l.dispatched !== null ? Math.round((l.dispatched - parsed) * 1000) / 1000 : 0
              return (
                <li key={l.skuId}>
                  <Field
                    label={`${l.name} · ${text.qtyLabel}`}
                    hint={`${action === 'receive' ? `Despachado ${qtyText(l.dispatched, l.unit)}` : `Pedido ${qtyText(l.requested, l.unit)}`} · en ${UNIT_SHORT[l.unit] ?? l.unit}${diff > 0 ? ` · faltan ${formatQty(diff, l.unit)}` : ''}`}
                    error={errors[l.skuId]}
                  >
                    {(a) => <input {...a} inputMode="decimal" className={inputClass} value={values[l.skuId] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [l.skuId]: e.target.value }))} />}
                  </Field>
                </li>
              )
            })}
          </ul>
        )}
        {(action === 'reject' || action === 'receive') && (
          <Field label={action === 'reject' ? 'Motivo (opcional)' : 'Nota (opcional)'}>
            {(a) => <input {...a} className={inputClass} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={action === 'reject' ? 'Ej.: no nos alcanza para el finde' : 'Ej.: una caja llegó golpeada'} />}
          </Field>
        )}
      </form>
    </Panel>
  )
}
