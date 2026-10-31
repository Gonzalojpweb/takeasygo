import type { Order } from "@takeasygo/types"
import { Check, Copy, MapPin, Phone, StickyNote } from "lucide-react"
import { formatCurrency } from "../../utils/format"

// ============================================================================
// Pedidos App — Recibir y En curso (maqueta aprobada 30/10/2026)
// ============================================================================
// · Recibir: pedidos nuevos de la App TakeasyGO. Cada tarjeta dice número,
//   cliente, modo, dirección, productos, pago y total, con UNA acción:
//   Aceptar · Confirmar pago (transferencia) · Esperando el pago (MP).
// · En curso: los aceptados, en columnas Por preparar → Preparando → Listo →
//   En camino, con un botón para avanzar cada uno.
// · El detalle vive en el panel derecho (la lista no se pierde).
// Aceptar NO manda nada a cocina: la comanda la imprime el SaaS cuando el
// pedido queda confirmado. Aceptar = tomarlo y pasarlo a En curso.
// ============================================================================

export type AppOrderFilter = "all" | "delivery" | "takeaway" | "pay"
export type AppOrdersMode = "recv" | "run"

const FILTERS: { id: AppOrderFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "delivery", label: "Delivery" },
  { id: "takeaway", label: "Para llevar" },
  { id: "pay", label: "Pago pendiente" },
]

export const REJECT_REASONS = ["Falta un producto", "Estamos cerrando", "Fuera de zona", "Demora muy larga", "Otro motivo"]

// ── Datos que se muestran ────────────────────────────────────────────────────

export function orderNumberLabel(o: Order): string {
  const n = o.display?.orderNumber
  return n ? `#${n.replace(/^#/, "")}` : `#${o.id.slice(-6).toUpperCase()}`
}

export function customerLabel(o: Order): string {
  return o.display?.customerName?.trim() || "Cliente de la App"
}

export const isDeliveryOrder = (o: Order) => o.orderMode === "delivery"

export function ageMinutes(o: Order, now: number): number {
  return Math.max(0, Math.floor((now - new Date(o.createdAt).getTime()) / 60000))
}

const ageClass = (m: number) => (m >= 10 ? " late" : m >= 5 ? " mid" : "")

export type PayState = "paid" | "transfer_pending" | "mp_pending" | "cash"

export function payStateOf(o: Order): PayState {
  if (o.paymentMethod === "cash") return "cash"
  if (o.externalStatus === "awaiting_payment") return o.paymentMethod === "transfer" ? "transfer_pending" : "mp_pending"
  return "paid"
}

export function payLabel(o: Order): { tone: "ok" | "wait" | "mp" | "cash"; text: string } {
  const state = payStateOf(o)
  const method = o.paymentMethod === "mercadopago" ? "MercadoPago" : o.paymentMethod === "kripton" ? "Kripton" : o.paymentMethod === "transfer" ? "Transferencia" : "Pago online"
  switch (state) {
    case "cash": return { tone: "cash", text: isDeliveryOrder(o) ? "Efectivo · cobra el repartidor" : "Efectivo · cobrar al retirar" }
    case "transfer_pending": return { tone: "wait", text: "Transferencia · revisar comprobante" }
    case "mp_pending": return { tone: "wait", text: `${method} · esperando el pago` }
    default: return { tone: o.paymentMethod === "mercadopago" ? "mp" : "ok", text: `${method} · pagado` }
  }
}

const units = (o: Order) => o.items.reduce((n, i) => n + i.quantity, 0)

export function matchesFilter(o: Order, f: AppOrderFilter): boolean {
  if (f === "all") return true
  if (f === "pay") return payStateOf(o) === "transfer_pending" || payStateOf(o) === "mp_pending"
  return f === "delivery" ? isDeliveryOrder(o) : !isDeliveryOrder(o)
}

/** Próximo paso de un pedido en curso (null = no hay botón en el POS). */
export function nextStep(o: Order): { label: string; status: "preparing" | "ready" | "en_ruta" | "arrived" | "delivered" } | null {
  switch (o.status) {
    case "pending":
    case "confirmed": return { label: "Empezar", status: "preparing" }
    case "preparing": return { label: "Marcar listo", status: "ready" }
    case "ready": return isDeliveryOrder(o) ? { label: "Salió el delivery", status: "en_ruta" } : { label: "Entregado", status: "delivered" }
    case "en_ruta": return { label: "Llegó", status: "arrived" }
    case "arrived": return { label: "Entregado", status: "delivered" }
    default: return null
  }
}

// ── Encabezado: las dos funciones ────────────────────────────────────────────

export function AppOrdersHead({ mode, onMode, recvCount, runCount, filter, onFilter, counts }: {
  mode: AppOrdersMode
  onMode: (m: AppOrdersMode) => void
  recvCount: number
  runCount: number
  filter: AppOrderFilter
  onFilter: (f: AppOrderFilter) => void
  counts: Record<AppOrderFilter, number>
}) {
  return (
    <div className="ao-head">
      <div className="ao-modes" role="tablist" aria-label="Pedidos App">
        <button type="button" role="tab" aria-selected={mode === "recv"} className={`ao-mode${mode === "recv" ? " on" : ""}${recvCount > 0 ? " has" : ""}`} onClick={() => onMode("recv")}>
          <span><b>Recibir</b><small>Pedidos nuevos: aceptar, confirmar pago o rechazar.</small></span>
          <span className="ao-mode-count">{recvCount}</span>
        </button>
        <button type="button" role="tab" aria-selected={mode === "run"} className={`ao-mode${mode === "run" ? " on" : ""}`} onClick={() => onMode("run")}>
          <span><b>En curso</b><small>Aceptados: de la preparación a la entrega.</small></span>
          <span className="ao-mode-count">{runCount}</span>
        </button>
      </div>
      {mode === "recv" && (
        <div className="ao-filters" role="group" aria-label="Filtrar pedidos">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className={`ao-chip${filter === f.id ? " on" : ""}`} aria-pressed={filter === f.id} onClick={() => onFilter(f.id)}>
              {f.label} <span>{counts[f.id]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Recibir: tarjetas ────────────────────────────────────────────────────────

function ModeBadge({ order, short = false }: { order: Order; short?: boolean }) {
  return isDeliveryOrder(order)
    ? <span className="ao-badge ao-badge--delivery">Delivery</span>
    : <span className="ao-badge">{short ? "Llevar" : "Para llevar"}</span>
}

export function ReceiveGrid({ orders, now, selectedId, onSelect, onAccept, onConfirmPayment, busyId }: {
  orders: Order[]
  now: number
  selectedId: string | null
  onSelect: (id: string) => void
  onAccept: (id: string) => void
  onConfirmPayment: (id: string) => void
  busyId: string | null
}) {
  if (orders.length === 0) {
    return (
      <div className="ao-empty">
        <b>No hay pedidos para recibir</b>
        Cuando entre un pedido de la App va a sonar y aparecer acá.
      </div>
    )
  }
  return (
    <div className="ao-cards">
      {orders.map((o) => {
        const m = ageMinutes(o, now)
        const pay = payLabel(o)
        const state = payStateOf(o)
        const first = o.items.slice(0, 2).map((i) => `${i.quantity}× ${i.name}`).join(" · ") + (o.items.length > 2 ? ` · +${o.items.length - 2} más` : "")
        return (
          <article
            key={o.id}
            className={`ao-card${selectedId === o.id ? " sel" : ""}`}
            tabIndex={0}
            aria-label={`Pedido ${orderNumberLabel(o)} de ${customerLabel(o)}`}
            onClick={() => onSelect(o.id)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(o.id) } }}
          >
            <div className="ao-card-top">
              <span className="ao-num">{orderNumberLabel(o)}</span>
              <span className={`ao-age${ageClass(m)}`}>{m === 0 ? "Recién" : `hace ${m} min`}</span>
            </div>
            <div className="ao-who">
              <span className="ao-name">{customerLabel(o)}</span>
              <ModeBadge order={o} />
            </div>
            {isDeliveryOrder(o) && o.display?.deliveryAddress && (
              <div className="ao-addr"><MapPin size={14} aria-hidden /> {o.display.deliveryAddress}</div>
            )}
            <div className="ao-items"><b>{units(o)} {units(o) === 1 ? "producto" : "productos"}</b> · {first}</div>
            <div className="ao-foot">
              <span className={`ao-pay ao-pay--${pay.tone}`}><i aria-hidden />{pay.text}</span>
              <span className="ao-total">{formatCurrency(o.total)}</span>
            </div>
            <div className="ao-card-act" onClick={(e) => e.stopPropagation()}>
              {state === "transfer_pending" ? (
                <button type="button" className="btn ao-btn-warn" disabled={busyId === o.id} onClick={() => onConfirmPayment(o.id)}>Confirmar pago</button>
              ) : state === "mp_pending" ? (
                <button type="button" className="btn btn-secondary" disabled>Esperando el pago</button>
              ) : (
                <button type="button" className="btn btn-primary" disabled={busyId === o.id} onClick={() => onAccept(o.id)}>Aceptar</button>
              )}
            </div>
          </article>
        )
      })}
    </div>
  )
}

// ── En curso: tablero ────────────────────────────────────────────────────────

const COLUMNS: { id: string; label: string; statuses: Order["status"][] }[] = [
  { id: "todo", label: "Por preparar", statuses: ["pending", "confirmed"] },
  { id: "prep", label: "Preparando", statuses: ["preparing"] },
  { id: "ready", label: "Listo", statuses: ["ready"] },
  { id: "out", label: "En camino", statuses: ["en_ruta", "arrived"] },
]

export function RunBoard({ orders, now, selectedId, onSelect, onAdvance, busyId }: {
  orders: Order[]
  now: number
  selectedId: string | null
  onSelect: (id: string) => void
  onAdvance: (o: Order) => void
  busyId: string | null
}) {
  if (orders.length === 0) {
    return (
      <div className="ao-empty">
        <b>No hay pedidos en curso</b>
        Los pedidos que aceptes en Recibir aparecen acá hasta que se entregan.
      </div>
    )
  }
  return (
    <div className="ao-board">
      {COLUMNS.map((col) => {
        const list = orders.filter((o) => col.statuses.includes(o.status)).sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
        return (
          <section key={col.id} className="ao-col" aria-label={col.label}>
            <h3 className="ao-col-head">{col.label}<span>{list.length}</span></h3>
            {list.length === 0 && <p className="ao-col-empty">Nada acá</p>}
            {list.map((o) => {
              const m = ageMinutes(o, now)
              const step = nextStep(o)
              return (
                <article
                  key={o.id}
                  className={`ao-kcard${selectedId === o.id ? " sel" : ""}`}
                  tabIndex={0}
                  onClick={() => onSelect(o.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(o.id) } }}
                >
                  <div className="ao-kcard-top">
                    <b>{orderNumberLabel(o)}</b>
                    <ModeBadge order={o} short />
                    <span className={`ao-age${ageClass(m)}`}>{m} min</span>
                  </div>
                  <div className="ao-kcard-name">{customerLabel(o)}</div>
                  <div className="ao-kcard-sub">{units(o)} {units(o) === 1 ? "producto" : "productos"} · {formatCurrency(o.total)}{o.status === "arrived" ? " · llegó" : ""}</div>
                  {step && (
                    <button type="button" className="btn btn-primary btn-sm" disabled={busyId === o.id} onClick={(e) => { e.stopPropagation(); onAdvance(o) }}>
                      {step.label}
                    </button>
                  )}
                </article>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}

// ── Detalle (panel derecho) ──────────────────────────────────────────────────

export function AppOrderDetail({ order: o, now, rejecting, onReject }: {
  order: Order
  now: number
  /** Mostrando los motivos de rechazo. */
  rejecting: boolean
  onReject: (reason: string) => void
}) {
  const m = ageMinutes(o, now)
  const pay = payLabel(o)
  const subtotal = o.baseTotal ?? o.items.reduce((s, i) => s + i.total, 0)
  const phone = o.display?.customerPhone
  return (
    <div className="ao-detail">
      <div className="ao-detail-head">
        <div>
          <div className="ao-detail-num">Pedido {orderNumberLabel(o)}</div>
          <div className="ao-detail-sub">
            Recibido {new Date(o.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} · {isDeliveryOrder(o) ? "Delivery" : "Para llevar"}
          </div>
        </div>
        <span className={`ao-age${ageClass(m)}`}>{m} min</span>
      </div>

      <section className="ao-blk">
        <h4>Cliente</h4>
        <div className="ao-blk-body">
          <div className="ao-who-big">{customerLabel(o)}</div>
          {phone && (
            <div className="ao-row">
              <span className="ao-phone"><Phone size={14} aria-hidden /> {phone}</span>
              <button type="button" className="ao-copy" onClick={() => { void navigator.clipboard?.writeText(phone).catch(() => {}) }}>
                <Copy size={13} aria-hidden /> Copiar
              </button>
            </div>
          )}
        </div>
      </section>

      {isDeliveryOrder(o) && (
        <section className="ao-blk">
          <h4>Entrega</h4>
          <div className="ao-blk-body">
            {o.display?.deliveryAddress
              ? <div className="ao-addr-big"><MapPin size={15} aria-hidden /> {o.display.deliveryAddress}</div>
              : <div className="ao-muted">La dirección se ve en el panel web del pedido.</div>}
            {o.display?.deliveryReference && <div className="ao-muted">{o.display.deliveryReference}</div>}
          </div>
        </section>
      )}

      {o.notes && !o.notes.startsWith("Pedido online #") && (
        <div className="ao-note"><StickyNote size={15} aria-hidden /> {o.notes}</div>
      )}

      <section className="ao-blk">
        <h4>Productos · {units(o)}</h4>
        <div className="ao-blk-body">
          {o.items.map((i, idx) => (
            <div key={`${i.productId}-${idx}`} className="ao-item">
              <span className="ao-item-q">{i.quantity}×</span>
              <span className="ao-item-n">{i.name}</span>
              <span className="ao-item-p">{formatCurrency(i.total)}</span>
              {i.modifiers && i.modifiers.length > 0 && (
                <span className="ao-item-m">{i.modifiers.map((md) => md.name).join(" · ")}</span>
              )}
              {i.notes && <span className="ao-item-o">Nota: {i.notes}</span>}
            </div>
          ))}
        </div>
      </section>

      <section className="ao-blk">
        <h4>Pago</h4>
        <div className="ao-blk-body">
          <span className={`ao-pay ao-pay--${pay.tone}`}><i aria-hidden />{pay.text}</span>
          {(o.surchargeAmount ?? 0) > 0 && (
            <>
              <div className="ao-row"><span className="ao-muted">Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
              <div className="ao-row"><span className="ao-muted">Recargo</span><span>{formatCurrency(o.surchargeAmount ?? 0)}</span></div>
            </>
          )}
          <div className="ao-tot"><span>Total</span><span>{formatCurrency(o.total)}</span></div>
        </div>
      </section>

      {rejecting && (
        <section className="ao-blk ao-blk--reject">
          <h4>¿Por qué lo rechazás?</h4>
          <div className="ao-blk-body">
            <div className="ao-reasons">
              {REJECT_REASONS.map((r) => (
                <button key={r} type="button" className="ao-chip" onClick={() => onReject(r)}>{r}</button>
              ))}
            </div>
            <div className="ao-muted">El motivo queda registrado en el pedido.</div>
          </div>
        </section>
      )}

      {o.integratedAt && (
        <div className="ao-muted ao-accepted"><Check size={14} aria-hidden /> Aceptado {new Date(o.integratedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</div>
      )}
    </div>
  )
}
