'use client'

// ============================================================================
// Compras (F2) — proveedores y órdenes de compra
// ============================================================================
// Órdenes: borrador → enviada (texto para WhatsApp) → recibida en una o
// varias entregas, repartida entre sedes. Proveedores: datos de contacto y
// qué insumos venden, con el último precio pagado. Las reglas viven en
// lib/inventory/purchasing (servidor); acá solo formularios y listas.
// ============================================================================

import { useMemo, useState } from 'react'
import { ClipboardCopy, Download, MessageCircle, PackageCheck, Pencil, Plus, ShoppingCart, Trash2, Truck, Users } from 'lucide-react'
import { invApi } from '../data/api'
import { useResource } from '../data/useResource'
import { EmptyBlock, ErrorBlock, Field, FilterChip, LoadingBlock, Notice, Panel, SearchPicker, Spinner, StatusTag, btnPrimary, btnSecondary, inputClass, type Tone } from '../ui'
import { newClientEventId, parseDecimal, parsePesosToCents } from '@/lib/inventory/ui/fields'
import { UNIT_SHORT, formatQty, pesos, relativeTime } from '@/lib/inventory/ui/format'
import type { V3Context } from '../InventoryV3'
import type { PurchaseOrderView } from '@/lib/inventory/purchasing'
import type { PoAction, PoStatus } from '@/lib/inventory/purchasing-rules'

interface SupplierView {
  _id: string
  name: string
  taxId: string | null
  contactName: string | null
  phone: string | null
  email: string | null
  paymentTerms: string | null
  leadTimeDays: number | null
  notes: string | null
  isActive: boolean
  products: Array<{ skuId: string; code: string | null; lastUnitCostCents: number | null; lastPurchasedAt: string | null }>
}

const STATUS: Record<PoStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Borrador', tone: 'neutral' },
  sent: { label: 'Enviada', tone: 'info' },
  partial: { label: 'Llegó una parte', tone: 'warning' },
  received: { label: 'Recibida', tone: 'ok' },
  cancelled: { label: 'Cancelada', tone: 'neutral' },
}

type Section = 'orders' | 'suppliers'
type OrderPanel = { kind: 'form'; order: PurchaseOrderView | null } | { kind: 'send' | 'receive'; order: PurchaseOrderView }

export default function PurchasesView({ ctx }: { ctx: V3Context }) {
  const [section, setSection] = useState<Section>('orders')
  const [open, setOpen] = useState(true)
  const [tick, setTick] = useState(0)
  const [orderPanel, setOrderPanel] = useState<OrderPanel | null>(null)
  const [supplierPanel, setSupplierPanel] = useState<SupplierView | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const refresh = () => setTick((n) => n + 1)

  const suppliers = useResource(`${ctx.tenantSlug}|suppliers|${ctx.version}|${tick}`, (signal) =>
    invApi<{ suppliers: SupplierView[] }>(ctx.tenantSlug, 'suppliers?todos=1', { signal }),
  )
  const orders = useResource(section === 'orders' ? `${ctx.tenantSlug}|purchase-orders|${open}|${ctx.version}|${tick}` : null, (signal) =>
    invApi<{ orders: PurchaseOrderView[] }>(ctx.tenantSlug, `purchase-orders?estado=${open ? 'abiertas' : 'cerradas'}`, { signal }),
  )
  const activeSuppliers = (suppliers.data?.suppliers ?? []).filter((s) => s.isActive)

  async function simpleAction(o: PurchaseOrderView, action: 'close' | 'cancel') {
    setBusy(`${o._id}:${action}`)
    setError(null)
    const res = await invApi(ctx.tenantSlug, `purchase-orders/${o._id}`, { method: 'PATCH', body: { action } })
    setBusy(null)
    if (!res.ok) setError(res.error.message)
    refresh()
  }

  async function importSuppliers() {
    setBusy('import')
    setError(null)
    const res = await invApi<{ created: number; updated: number }>(ctx.tenantSlug, 'suppliers/import', { method: 'POST' })
    setBusy(null)
    if (!res.ok) setError(res.error.message)
    else setNotice(res.data.created + res.data.updated === 0 ? 'Los insumos no tienen proveedores nuevos para traer.' : `Listo: ${res.data.created} proveedores nuevos${res.data.updated ? ` y ${res.data.updated} actualizados` : ''}.`)
    refresh()
  }

  return (
    <div className="space-y-5">
      <div role="group" aria-label="Qué querés ver" className="flex flex-wrap gap-2">
        <FilterChip active={section === 'orders'} onClick={() => setSection('orders')}>Órdenes de compra</FilterChip>
        <FilterChip active={section === 'suppliers'} onClick={() => setSection('suppliers')}>Proveedores ({activeSuppliers.length})</FilterChip>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}

      {section === 'orders' ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="max-w-2xl text-sm text-muted-foreground">
              Armá el pedido, mandalo por WhatsApp y cargá lo que llega en cada sede: entra al stock con el precio real y actualiza el costo.
            </p>
            {ctx.caps.manage && (
              <button type="button" className={btnPrimary} onClick={() => setOrderPanel({ kind: 'form', order: null })} disabled={activeSuppliers.length === 0} title={activeSuppliers.length === 0 ? 'Primero cargá un proveedor' : undefined}>
                <Plus size={18} aria-hidden /> Nueva orden
              </button>
            )}
          </div>
          {ctx.caps.manage && suppliers.status !== 'loading' && activeSuppliers.length === 0 && (
            <Notice tone="info">Para armar una orden, primero cargá un proveedor (en «Proveedores» podés traerlos de tus insumos).</Notice>
          )}
          <div role="group" aria-label="Qué órdenes ver" className="flex flex-wrap gap-2">
            <FilterChip active={open} onClick={() => setOpen(true)}>Abiertas</FilterChip>
            <FilterChip active={!open} onClick={() => setOpen(false)}>Terminadas</FilterChip>
          </div>
          {orders.status === 'loading' ? (
            <LoadingBlock label="Cargando órdenes" rows={3} />
          ) : orders.status === 'error' && !orders.data ? (
            <ErrorBlock error={orders.error} onRetry={orders.reload} what="las órdenes" />
          ) : orders.data!.orders.length === 0 ? (
            <EmptyBlock icon={<ShoppingCart size={28} />} title={open ? 'No hay órdenes abiertas' : 'Todavía no hay órdenes terminadas'} />
          ) : (
            <ul className="space-y-3" aria-label="Órdenes de compra">
              {orders.data!.orders.map((o) => (
                <OrderCard
                  key={o._id}
                  o={o}
                  busy={busy}
                  onAction={(a) => {
                    if (a === 'update') setOrderPanel({ kind: 'form', order: o })
                    else if (a === 'send') setOrderPanel({ kind: 'send', order: o })
                    else if (a === 'receive') setOrderPanel({ kind: 'receive', order: o })
                    else simpleAction(o, a)
                  }}
                  onShowMessage={() => setOrderPanel({ kind: 'send', order: o })}
                />
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="max-w-2xl text-sm text-muted-foreground">Tus proveedores, cómo contactarlos y qué te venden. El último precio se actualiza solo cuando recibís una orden.</p>
            {ctx.caps.manage && (
              <div className="flex flex-wrap gap-2">
                <button type="button" className={btnSecondary} onClick={importSuppliers} disabled={busy === 'import'}>
                  {busy === 'import' ? <Spinner label="Trayendo" /> : <Download size={18} aria-hidden />} Traer de los insumos
                </button>
                <button type="button" className={btnPrimary} onClick={() => setSupplierPanel('new')}>
                  <Plus size={18} aria-hidden /> Nuevo proveedor
                </button>
              </div>
            )}
          </div>
          {suppliers.status === 'loading' ? (
            <LoadingBlock label="Cargando proveedores" rows={3} />
          ) : suppliers.status === 'error' && !suppliers.data ? (
            <ErrorBlock error={suppliers.error} onRetry={suppliers.reload} what="los proveedores" />
          ) : suppliers.data!.suppliers.length === 0 ? (
            <EmptyBlock icon={<Users size={28} />} title="Todavía no hay proveedores">
              Cargalos a mano o traelos del campo «proveedor» de tus insumos.
            </EmptyBlock>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border-2 border-border bg-card" aria-label="Proveedores">
              {suppliers.data!.suppliers.map((s) => (
                <li key={s._id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{s.name}{!s.isActive && <span className="ml-2 text-xs font-normal text-muted-foreground">(desactivado)</span>}</span>
                    <span className="block text-sm text-muted-foreground">
                      {[s.contactName, s.phone, s.paymentTerms, s.leadTimeDays !== null ? `entrega en ${s.leadTimeDays} días` : null, `${s.products.length} insumos`].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {ctx.caps.manage && (
                    <button type="button" className={btnSecondary} onClick={() => setSupplierPanel(s)}>
                      <Pencil size={16} aria-hidden /> Editar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {orderPanel?.kind === 'form' && (
        <OrderFormPanel ctx={ctx} order={orderPanel.order} suppliers={activeSuppliers} onClose={() => setOrderPanel(null)} onDone={() => { setOrderPanel(null); setSection('orders'); setOpen(true); refresh() }} />
      )}
      {orderPanel?.kind === 'send' && (
        <SendPanel ctx={ctx} order={orderPanel.order} onClose={() => setOrderPanel(null)} onDone={() => { setOrderPanel(null); refresh() }} />
      )}
      {orderPanel?.kind === 'receive' && (
        <ReceivePoPanel ctx={ctx} order={orderPanel.order} onClose={() => setOrderPanel(null)} onDone={() => { setOrderPanel(null); refresh() }} />
      )}
      {supplierPanel && (
        <SupplierPanel ctx={ctx} supplier={supplierPanel === 'new' ? null : supplierPanel} onClose={() => setSupplierPanel(null)} onDone={() => { setSupplierPanel(null); refresh() }} />
      )}
    </div>
  )
}

const ACTION_LABEL: Record<PoAction, string> = { update: 'Editar', send: 'Enviar al proveedor', receive: 'Recibir', close: 'Cerrar (no llega más)', cancel: 'Cancelar' }

function OrderCard({ o, busy, onAction, onShowMessage }: { o: PurchaseOrderView; busy: string | null; onAction: (a: PoAction) => void; onShowMessage: () => void }) {
  const s = STATUS[o.status]
  return (
    <li className="rounded-2xl border-2 border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusTag tone={s.tone}>{s.label}</StatusTag>
          <span className="font-bold">N.º {o.number} · {o.supplier.name}</span>
        </div>
        <span className="text-sm text-muted-foreground">
          {o.totalCents > 0 ? pesos(o.totalCents) : 'Sin precio'}
          {o.unpricedLines > 0 && o.totalCents > 0 ? ` + ${o.unpricedLines} sin precio` : ''}
          {o.expectedAt ? ` · para el ${new Date(`${o.expectedAt}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}` : ''}
        </span>
      </div>
      <ul className="mt-3 space-y-1 text-sm" aria-label="Insumos de la orden">
        {o.lines.map((l) => (
          <li key={l.skuId} className="flex flex-wrap justify-between gap-2">
            <span className="font-medium">{l.name}</span>
            <span className="tabular-nums text-muted-foreground">
              {o.status === 'draft' || o.status === 'sent' || o.status === 'cancelled' ? formatQty(l.ordered, l.unit) : `${formatQty(l.received, l.unit)} de ${formatQty(l.ordered, l.unit)}`}
              {l.allocations.length > 1 && ` · ${l.allocations.length} sedes`}
            </span>
          </li>
        ))}
      </ul>
      {(o.note || o.receipts.length > 0 || o.closedShort) && (
        <div className="mt-2 space-y-0.5 text-sm text-muted-foreground">
          {o.note && <p>Nota: {o.note}</p>}
          {o.receipts.map((r) => (
            <p key={r.receiptId}>Entrega {relativeTime(r.at)}{r.by ? ` · ${r.by}` : ''}{r.invoiceRef ? ` · factura ${r.invoiceRef}` : ''}</p>
          ))}
          {o.receivedCostCents > 0 && <p>Recibido: {pesos(o.receivedCostCents)}</p>}
          {o.closedShort && <p>Se cerró sin que llegara todo.</p>}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {o.actions.map((a) => (
          <button key={a} type="button" disabled={busy !== null} onClick={() => onAction(a)} className={a === 'send' || a === 'receive' ? btnPrimary : btnSecondary}>
            {busy === `${o._id}:${a}` && <Spinner label="Guardando" />}
            {a === 'send' && <MessageCircle size={18} aria-hidden />}
            {a === 'receive' && <PackageCheck size={18} aria-hidden />}
            {ACTION_LABEL[a]}
          </button>
        ))}
        {o.status !== 'draft' && o.status !== 'cancelled' && (
          <button type="button" className={btnSecondary} onClick={onShowMessage}>
            <ClipboardCopy size={18} aria-hidden /> Ver pedido
          </button>
        )}
      </div>
    </li>
  )
}

// ── Formulario de orden (nueva o borrador) ──────────────────────────────────

interface LineDraft { skuId: string; price: string; qty: Record<string, string> }

function OrderFormPanel({ ctx, order, suppliers, onClose, onDone }: { ctx: V3Context; order: PurchaseOrderView | null; suppliers: SupplierView[]; onClose: () => void; onDone: () => void }) {
  // Sedes donde se puede recibir: las del alcance que tienen depósito.
  const targets = ctx.locations
    .map((l) => {
      const storages = ctx.allStorages.filter((s) => s.locationId === l.id)
      const storage = storages.find((s) => s.isDefaultConsumption) ?? storages[0]
      return storage ? { locationId: l.id, name: l.name, storageId: storage._id } : null
    })
    .filter((x): x is { locationId: string; name: string; storageId: string } => x !== null)

  const [supplierId, setSupplierId] = useState(order?.supplier._id ?? suppliers[0]?._id ?? '')
  const [expectedAt, setExpectedAt] = useState(order?.expectedAt ?? '')
  const [note, setNote] = useState(order?.note ?? '')
  const [lines, setLines] = useState<LineDraft[]>(() =>
    (order?.lines ?? []).map((l) => ({
      skuId: l.skuId,
      price: l.unitCostCents !== null ? String(l.unitCostCents / 100).replace('.', ',') : '',
      qty: Object.fromEntries(l.allocations.map((a) => [a.locationId, String(a.quantity).replace('.', ',')])),
    })),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const supplier = suppliers.find((s) => s._id === supplierId)
  const supplierSkus = new Set(supplier?.products.map((p) => p.skuId) ?? [])
  const pickable = useMemo(
    () =>
      ctx.skus
        .filter((s) => !lines.some((l) => l.skuId === s._id))
        .sort((a, b) => Number(supplierSkus.has(b._id)) - Number(supplierSkus.has(a._id)) || a.name.localeCompare(b.name, 'es'))
        .map((s) => ({ id: s._id, label: s.name, meta: supplierSkus.has(s._id) ? 'De este proveedor' : UNIT_SHORT[s.canonicalUnit] })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx.skus, lines, supplierId],
  )

  function addLine(skuId: string) {
    const last = supplier?.products.find((p) => p.skuId === skuId)?.lastUnitCostCents ?? ctx.skus.find((s) => s._id === skuId)?.lastUnitCostCents ?? null
    const firstTarget = targets.find((t) => t.locationId === ctx.location.id) ?? targets[0]
    setLines((ls) => [...ls, { skuId, price: last ? String(last / 100).replace('.', ',') : '', qty: firstTarget ? { [firstTarget.locationId]: '' } : {} }])
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!supplierId) errs.supplier = 'Elegí el proveedor'
    if (lines.length === 0) errs.lines = 'Agregá al menos un insumo'
    const body = lines.map((l) => {
      const allocations = targets
        .map((t) => ({ locationId: t.locationId, storageLocationId: t.storageId, quantity: parseDecimal(l.qty[t.locationId] ?? '') ?? 0 }))
        .filter((a) => a.quantity > 0)
      if (allocations.length === 0) errs[l.skuId] = 'Indicá cuánto en al menos una sede'
      const price = l.price.trim() ? parsePesosToCents(l.price) : null
      if (l.price.trim() && price === null) errs[`${l.skuId}:price`] = 'Precio inválido'
      return { skuId: l.skuId, unitCostCents: price, allocations }
    })
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    setServerError(null)
    const payload = { lines: body, note: note.trim() || null, expectedAt: expectedAt || null }
    const res = order
      ? await invApi(ctx.tenantSlug, `purchase-orders/${order._id}`, { method: 'PATCH', body: { action: 'update', supplierId, ...payload } })
      : await invApi(ctx.tenantSlug, 'purchase-orders', { method: 'POST', body: { supplierId, ...payload } })
    setBusy(false)
    if (!res.ok) setServerError(res.error.message)
    else onDone()
  }

  return (
    <Panel
      open
      wide
      onOpenChange={(o) => !o && onClose()}
      title={order ? `Editar orden N.º ${order.number}` : 'Nueva orden de compra'}
      description="Queda en borrador hasta que la mandes. Cantidades en la unidad del insumo; el precio es por esa unidad."
      footer={
        <button type="submit" form="po-form" className={`${btnPrimary} w-full`} disabled={busy}>
          {busy && <Spinner label="Guardando" />} Guardar borrador
        </button>
      }
    >
      <form id="po-form" onSubmit={submit} className="space-y-5" noValidate>
        {serverError && <Notice tone="error">{serverError}</Notice>}
        {targets.length === 0 && <Notice tone="error">Ninguna de tus sedes tiene un depósito para recibir mercadería.</Notice>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Proveedor" error={errors.supplier}>
            {(a) => (
              <select {...a} className={inputClass} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                {suppliers.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            )}
          </Field>
          <Field label="Para cuándo (opcional)">
            {(a) => <input {...a} type="date" className={inputClass} value={expectedAt} onChange={(e) => setExpectedAt(e.target.value)} />}
          </Field>
        </div>
        <SearchPicker label="Agregar insumo" placeholder="Buscar insumo…" items={pickable} onPick={addLine} error={errors.lines} />
        {lines.length > 0 && (
          <ul className="space-y-4" aria-label="Insumos de la orden">
            {lines.map((l, i) => {
              const sku = ctx.skus.find((s) => s._id === l.skuId)
              const unit = sku?.canonicalUnit ?? ''
              return (
                <li key={l.skuId} className="rounded-xl border-2 border-border p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-bold">{sku?.name ?? 'Insumo'}</span>
                    <button type="button" className={btnSecondary} aria-label={`Quitar ${sku?.name ?? 'insumo'}`} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={`Precio por ${UNIT_SHORT[unit] ?? unit} (opcional)`} error={errors[`${l.skuId}:price`]} hint="Si no lo sabés, lo cargás al recibir">
                      {(a) => <input {...a} inputMode="decimal" className={inputClass} placeholder="$" value={l.price} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} />}
                    </Field>
                    {targets.map((t) => (
                      <Field key={t.locationId} label={targets.length > 1 ? `Para ${t.name}` : 'Cantidad'} hint={`En ${UNIT_SHORT[unit] ?? unit}`} error={t === targets[0] ? errors[l.skuId] : undefined}>
                        {(a) => (
                          <input {...a} inputMode="decimal" className={inputClass} value={l.qty[t.locationId] ?? ''} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, qty: { ...x.qty, [t.locationId]: e.target.value } } : x)))} />
                        )}
                      </Field>
                    ))}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <Field label="Nota para el proveedor (opcional)">
          {(a) => <input {...a} className={inputClass} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: entregar por la puerta de atrás" />}
        </Field>
      </form>
    </Panel>
  )
}

// ── Enviar: texto para el proveedor ────────────────────────────────────────

function SendPanel({ ctx, order, onClose, onDone }: { ctx: V3Context; order: PurchaseOrderView; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canSend = order.actions.includes('send')

  async function copy() {
    try {
      await navigator.clipboard.writeText(order.message)
      setCopied(true)
    } catch {
      setError('No se pudo copiar: seleccioná el texto y copialo a mano.')
    }
  }
  async function markSent() {
    setBusy(true)
    setError(null)
    const res = await invApi(ctx.tenantSlug, `purchase-orders/${order._id}`, { method: 'PATCH', body: { action: 'send' } })
    setBusy(false)
    if (!res.ok) setError(res.error.message)
    else onDone()
  }

  return (
    <Panel
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Pedido N.º ${order.number} · ${order.supplier.name}`}
      description={canSend ? 'Mandalo por WhatsApp o copialo, y marcalo como enviado.' : 'El texto del pedido, para reenviarlo.'}
      footer={canSend ? (
        <button type="button" className={`${btnPrimary} w-full`} onClick={markSent} disabled={busy}>
          {busy && <Spinner label="Guardando" />} <Truck size={18} aria-hidden /> Marcar como enviada
        </button>
      ) : undefined}
    >
      <div className="space-y-4">
        {error && <Notice tone="error">{error}</Notice>}
        <pre className="whitespace-pre-wrap rounded-xl border-2 border-border bg-muted/40 p-4 font-sans text-sm">{order.message}</pre>
        <div className="flex flex-wrap gap-2">
          {order.whatsapp ? (
            <a href={order.whatsapp} target="_blank" rel="noopener noreferrer" className={btnPrimary}>
              <MessageCircle size={18} aria-hidden /> Abrir WhatsApp
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">El proveedor no tiene teléfono cargado.</p>
          )}
          <button type="button" className={btnSecondary} onClick={copy}>
            <ClipboardCopy size={18} aria-hidden /> {copied ? 'Copiado' : 'Copiar texto'}
          </button>
        </div>
      </div>
    </Panel>
  )
}

// ── Recibir (por sede del alcance) ─────────────────────────────────────────

function ReceivePoPanel({ ctx, order, onClose, onDone }: { ctx: V3Context; order: PurchaseOrderView; onClose: () => void; onDone: () => void }) {
  const mine = new Set(ctx.locations.map((l) => l.id))
  const rows = order.lines.flatMap((l) =>
    l.allocations
      .filter((a) => mine.has(a.locationId))
      .map((a) => ({ key: `${l.skuId}|${a.storageLocationId}`, line: l, alloc: a, pending: Math.max(0, Math.round((a.quantity - a.received) * 1000) / 1000) })),
  )
  const [receiptId] = useState(newClientEventId)
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.key, String(r.pending).replace('.', ',')])))
  const [price, setPrice] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.key, r.line.unitCostCents !== null ? String(r.line.unitCostCents / 100).replace('.', ',') : ''])))
  const [invoice, setInvoice] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const multi = new Set(rows.map((r) => r.alloc.locationId)).size > 1

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    const items = rows.map((r) => {
      const q = parseDecimal(qty[r.key] ?? '')
      if (q === null || q < 0) errs[r.key] = 'Indicá cuánto llegó (0 si nada)'
      const p = (price[r.key] ?? '').trim() ? parsePesosToCents(price[r.key]) : null
      if ((price[r.key] ?? '').trim() && p === null) errs[`${r.key}:p`] = 'Precio inválido'
      return { skuId: r.line.skuId, storageLocationId: r.alloc.storageLocationId, quantity: q ?? 0, unitCostCents: p }
    })
    if (!items.some((i) => i.quantity > 0)) errs.form = 'Indicá cuánto llegó de al menos un insumo'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    setServerError(null)
    const res = await invApi(ctx.tenantSlug, `purchase-orders/${order._id}`, {
      method: 'PATCH',
      body: { action: 'receive', receiptId, invoiceRef: invoice.trim() || null, items: items.filter((i) => i.quantity > 0) },
    })
    setBusy(false)
    if (!res.ok) setServerError(res.error.message)
    else onDone()
  }

  return (
    <Panel
      open
      wide
      onOpenChange={(o) => !o && onClose()}
      title={`Recibir N.º ${order.number} · ${order.supplier.name}`}
      description="Contá lo que llegó. Entra al stock con el precio que pagaste; si falta algo, la orden queda abierta para la próxima entrega."
      footer={
        <button type="submit" form="po-receive" className={`${btnPrimary} w-full`} disabled={busy || rows.length === 0}>
          {busy && <Spinner label="Guardando" />} Confirmar recepción
        </button>
      }
    >
      <form id="po-receive" onSubmit={submit} className="space-y-5" noValidate>
        {serverError && <Notice tone="error">{serverError}</Notice>}
        {errors.form && <Notice tone="error">{errors.form}</Notice>}
        {rows.length === 0 ? (
          <Notice tone="info">Esta orden no tiene entregas para tus sedes.</Notice>
        ) : (
          <ul className="space-y-4" aria-label="Lo que llegó">
            {rows.map((r) => (
              <li key={r.key} className="rounded-xl border-2 border-border p-3">
                <p className="mb-2 font-bold">
                  {r.line.name}
                  {multi && <span className="font-normal text-muted-foreground"> · {r.alloc.locationName}</span>}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Cuánto llegó" hint={`Pedido ${formatQty(r.alloc.quantity, r.line.unit)}${r.alloc.received ? ` · ya llegó ${formatQty(r.alloc.received, r.line.unit)}` : ''} · entra en ${r.alloc.storageName}`} error={errors[r.key]}>
                    {(a) => <input {...a} inputMode="decimal" className={inputClass} value={qty[r.key] ?? ''} onChange={(e) => setQty((v) => ({ ...v, [r.key]: e.target.value }))} />}
                  </Field>
                  <Field label={`Precio por ${UNIT_SHORT[r.line.unit] ?? r.line.unit}`} hint="El de la factura" error={errors[`${r.key}:p`]}>
                    {(a) => <input {...a} inputMode="decimal" className={inputClass} placeholder="$" value={price[r.key] ?? ''} onChange={(e) => setPrice((v) => ({ ...v, [r.key]: e.target.value }))} />}
                  </Field>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Field label="Factura o remito (opcional)">
          {(a) => <input {...a} className={inputClass} maxLength={80} value={invoice} onChange={(e) => setInvoice(e.target.value)} placeholder="Ej.: A-0001-00012345" />}
        </Field>
      </form>
    </Panel>
  )
}

// ── Proveedor (alta / edición) ─────────────────────────────────────────────

function SupplierPanel({ ctx, supplier, onClose, onDone }: { ctx: V3Context; supplier: SupplierView | null; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    name: supplier?.name ?? '',
    taxId: supplier?.taxId ?? '',
    contactName: supplier?.contactName ?? '',
    phone: supplier?.phone ?? '',
    email: supplier?.email ?? '',
    paymentTerms: supplier?.paymentTerms ?? '',
    leadTimeDays: supplier?.leadTimeDays !== null && supplier?.leadTimeDays !== undefined ? String(supplier.leadTimeDays) : '',
    notes: supplier?.notes ?? '',
  })
  const [skuIds, setSkuIds] = useState<string[]>(supplier?.products.map((p) => p.skuId) ?? [])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const pickable = ctx.skus.filter((s) => !skuIds.includes(s._id)).map((s) => ({ id: s._id, label: s.name }))

  async function save(extra: Record<string, unknown> = {}) {
    const errs: Record<string, string> = {}
    if (form.name.trim().length < 2) errs.name = 'Poné el nombre'
    const days = form.leadTimeDays.trim() ? Number(form.leadTimeDays) : null
    if (days !== null && (!Number.isInteger(days) || days < 0 || days > 365)) errs.leadTimeDays = 'Entre 0 y 365 días'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    setServerError(null)
    const body = {
      name: form.name.trim(), taxId: form.taxId.trim() || null, contactName: form.contactName.trim() || null, phone: form.phone.trim() || null,
      email: form.email.trim() || null, paymentTerms: form.paymentTerms.trim() || null, leadTimeDays: days, notes: form.notes.trim() || null, skuIds, ...extra,
    }
    const res = supplier
      ? await invApi(ctx.tenantSlug, `suppliers/${supplier._id}`, { method: 'PATCH', body })
      : await invApi(ctx.tenantSlug, 'suppliers', { method: 'POST', body })
    setBusy(false)
    if (!res.ok) setServerError(res.error.message)
    else onDone()
  }

  const text = (k: keyof typeof form, label: string, opts: { hint?: string; type?: string; inputMode?: 'tel' | 'email' | 'numeric' } = {}) => (
    <Field label={label} hint={opts.hint} error={errors[k]}>
      {(a) => <input {...a} type={opts.type ?? 'text'} inputMode={opts.inputMode} className={inputClass} value={form[k]} onChange={set(k)} />}
    </Field>
  )

  return (
    <Panel
      open
      onOpenChange={(o) => !o && onClose()}
      title={supplier ? `Editar ${supplier.name}` : 'Nuevo proveedor'}
      footer={
        <div className="flex flex-col gap-2">
          <button type="button" className={`${btnPrimary} w-full`} onClick={() => save()} disabled={busy}>
            {busy && <Spinner label="Guardando" />} Guardar
          </button>
          {supplier && (
            <button type="button" className={`${btnSecondary} w-full`} onClick={() => save({ isActive: !supplier.isActive })} disabled={busy}>
              {supplier.isActive ? 'Desactivar proveedor' : 'Reactivar proveedor'}
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {serverError && <Notice tone="error">{serverError}</Notice>}
        {text('name', 'Nombre')}
        <div className="grid gap-4 sm:grid-cols-2">
          {text('contactName', 'Contacto (opcional)')}
          {text('phone', 'Teléfono / WhatsApp (opcional)', { inputMode: 'tel', hint: 'Con código de país para abrir WhatsApp, ej. 54 9 11…' })}
          {text('email', 'Email (opcional)', { type: 'email', inputMode: 'email' })}
          {text('taxId', 'CUIT (opcional)', { inputMode: 'numeric' })}
          {text('paymentTerms', 'Condiciones de pago (opcional)', { hint: 'Ej.: 30 días, contado' })}
          {text('leadTimeDays', 'Demora de entrega en días (opcional)', { inputMode: 'numeric' })}
        </div>
        {text('notes', 'Notas (opcional)')}
        <SearchPicker label="Insumos que vende" placeholder="Buscar insumo…" items={pickable} onPick={(id) => setSkuIds((ids) => [...ids, id])} />
        {skuIds.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Insumos del proveedor">
            {skuIds.map((id) => {
              const s = ctx.skus.find((x) => x._id === id)
              const last = supplier?.products.find((p) => p.skuId === id)?.lastUnitCostCents
              return (
                <li key={id} className="inline-flex items-center gap-1 rounded-full border-2 border-border px-3 py-1 text-sm">
                  {s?.name ?? 'Insumo'}{last ? <span className="text-muted-foreground"> · {pesos(last)}</span> : null}
                  <button type="button" className="ml-1 rounded-full p-1 hover:bg-muted" aria-label={`Quitar ${s?.name ?? 'insumo'}`} onClick={() => setSkuIds((ids) => ids.filter((x) => x !== id))}>
                    <Trash2 size={14} aria-hidden />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Panel>
  )
}
