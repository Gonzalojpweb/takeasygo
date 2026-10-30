import { ArrowDownCircle, ArrowUpCircle, Ellipsis, HandCoins, KeyRound, ShoppingBasket, Truck, Users, Wallet, Zap } from "lucide-react"
import type { CashChannel, CashExpenseCategory, CashMovement } from "@takeasygo/types"
import { CASH_EXPENSE_CATEGORIES, CASH_EXPENSE_CATEGORY_LABELS } from "@takeasygo/business/browser"
import { formatCurrency, parsePesosInput, timeAgo } from "../../utils/format"

// ============================================================================
// Caja · formularios de Gasto / Retiro / Ingreso y Abrir caja (obs. UX 30/10)
// ============================================================================
// Mismo lenguaje que el cobro rediseñado: el formulario ocupa el workspace,
// con encabezado y secciones con borde y título (nada flotando en el medio
// de un fondo blanco). El tipo de movimiento son tarjetas con dirección
// (sale / entra del cajón) y color; el retiro avisa que pide el PIN del
// encargado. El resumen de lo que se va a registrar vive en el panel derecho
// (CashDashboard) y la acción, con tipo y monto, en la barra de acciones.
// ============================================================================

export type ManualType = "expense" | "withdrawal" | "income"

export const MANUAL_TYPES: { id: ManualType; label: string; verb: string; hint: string; direction: "out" | "in" }[] = [
  { id: "expense", label: "Gasto", verb: "Registrar gasto", hint: "Pago con plata del cajón: proveedores, compras.", direction: "out" },
  { id: "withdrawal", label: "Retiro", verb: "Registrar retiro", hint: "Sacar efectivo del cajón.", direction: "out" },
  { id: "income", label: "Ingreso", verb: "Registrar ingreso", hint: "Agregar efectivo: cambio, refuerzo.", direction: "in" },
]

const TYPE_ICON: Record<ManualType, typeof ArrowDownCircle> = { expense: ArrowDownCircle, withdrawal: HandCoins, income: ArrowUpCircle }

const CATEGORY_ICON: Record<CashExpenseCategory, typeof Truck> = {
  suppliers: Truck,
  supplies: ShoppingBasket,
  services: Zap,
  salaries: Users,
  owner_withdrawal: Wallet,
  other: Ellipsis,
}

/** Montos rápidos en pesos (lo más común en caja chica). */
const QUICK_AMOUNTS = [1000, 5000, 10000, 20000, 50000]

function AmountField({ id, value, onChange, onEnter, label, hint }: {
  id: string
  value: string
  onChange: (v: string) => void
  onEnter: () => void
  label: string
  hint?: string
}) {
  return (
    <section className="checkout-section cashf-amount" aria-labelledby={`${id}-label`}>
      <h3 className="checkout-section-title" id={`${id}-label`}>
        {label}
        {hint && <span className="checkout-section-hint">{hint}</span>}
      </h3>
      <label className="cashf-amount-field" htmlFor={id}>
        <span aria-hidden>$</span>
        <input
          id={id}
          inputMode="decimal"
          placeholder="0"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onEnter()}
          autoFocus
        />
      </label>
      <div className="cashf-quick" role="group" aria-label="Montos rápidos">
        {QUICK_AMOUNTS.map((n) => (
          <button key={n} type="button" className="cashf-quick-btn" onClick={() => onChange(String(n))}>
            $ {n.toLocaleString("es-AR")}
          </button>
        ))}
      </div>
    </section>
  )
}

// ── Gasto / Retiro / Ingreso ────────────────────────────────────────────────

export function MovementForm({ shiftLabel, type, onType, amount, onAmount, category, onCategory, reason, onReason, onSubmit }: {
  shiftLabel: string
  type: ManualType
  onType: (t: ManualType) => void
  amount: string
  onAmount: (v: string) => void
  category: CashExpenseCategory | null
  onCategory: (c: CashExpenseCategory) => void
  reason: string
  onReason: (v: string) => void
  onSubmit: () => void
}) {
  const needsCategory = type !== "income"
  return (
    <div className="cashf">
      <header className="checkout-head cashf-head">
        <div>
          <div className="checkout-eyebrow">{shiftLabel}</div>
          <h2 className="cashf-title">Registrar movimiento de efectivo</h2>
        </div>
      </header>

      <div className="cashf-types" role="radiogroup" aria-label="Tipo de movimiento">
        {MANUAL_TYPES.map((t) => {
          const Icon = TYPE_ICON[t.id]
          const on = type === t.id
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={on}
              className={`cashf-type cashf-type--${t.direction}${on ? " on" : ""}`}
              onClick={() => onType(t.id)}
            >
              <Icon size={26} aria-hidden className="cashf-type-icon" />
              <span className="cashf-type-text">
                <b>{t.label}</b>
                <small>{t.direction === "out" ? "Sale del cajón" : "Entra al cajón"} · {t.hint}</small>
              </span>
              {t.id === "withdrawal" && (
                <span className="cashf-pin"><KeyRound size={13} aria-hidden /> Pide PIN del encargado</span>
              )}
            </button>
          )
        })}
      </div>

      <div className={`cashf-grid${needsCategory ? "" : " cashf-grid--single"}`}>
        <AmountField
          id="cashf-amount"
          label="Monto"
          hint="En efectivo del cajón"
          value={amount}
          onChange={onAmount}
          onEnter={onSubmit}
        />
        {needsCategory && (
          <section className="checkout-section" aria-labelledby="cashf-cat-label">
            <h3 className="checkout-section-title" id="cashf-cat-label">
              Categoría
              <span className={`checkout-section-hint${category ? "" : " is-error"}`}>{category ? "Sale así en el cierre" : "Obligatoria"}</span>
            </h3>
            <div className="cashf-cats" role="radiogroup" aria-label="Categoría">
              {CASH_EXPENSE_CATEGORIES.map((c) => {
                const Icon = CATEGORY_ICON[c]
                return (
                  <button key={c} type="button" role="radio" aria-checked={category === c} className={`cashf-cat${category === c ? " on" : ""}`} onClick={() => onCategory(c)}>
                    <Icon size={18} aria-hidden /> {CASH_EXPENSE_CATEGORY_LABELS[c]}
                  </button>
                )
              })}
            </div>
          </section>
        )}
      </div>

      <section className="checkout-section" aria-labelledby="cashf-detail-label">
        <h3 className="checkout-section-title" id="cashf-detail-label">
          Detalle <span className="checkout-section-hint">Opcional · ayuda a entender el cierre</span>
        </h3>
        <input
          id="cashf-detail"
          className="search-input cashf-detail"
          type="text"
          maxLength={120}
          placeholder={type === "income" ? "Ej: cambio para el turno" : "Ej: Verdulería Don José, factura 0012"}
          value={reason}
          onChange={(e) => onReason(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
        />
      </section>
    </div>
  )
}

/** Lo que falta para registrar (null = listo). */
export function movementMissing(type: ManualType, amount: string, category: CashExpenseCategory | null): string | null {
  const cents = parsePesosInput(amount)
  if (cents === null || cents <= 0) return "Ingresá el monto"
  if (type !== "income" && !category) return "Elegí la categoría"
  return null
}

/** Panel derecho: qué se va a registrar y cómo queda el cajón. */
export function MovementSummary({ type, amount, category, reason, expected, movements }: {
  type: ManualType
  amount: string
  category: CashExpenseCategory | null
  reason: string
  /** Efectivo esperado (solo encargado y admin; undefined = cierre ciego). */
  expected?: number
  movements: CashMovement[]
}) {
  const t = MANUAL_TYPES.find((x) => x.id === type)!
  const cents = parsePesosInput(amount) ?? 0
  const sign = t.direction === "out" ? -1 : 1
  const recent = [...movements].filter((m) => m.type !== "sale").slice(-4).reverse()
  return (
    <div className="cashf-summary">
      <dl className="cashf-summary-list">
        <div><dt>Tipo</dt><dd><span className={`cashf-dir cashf-dir--${t.direction}`}>{t.direction === "out" ? "↓" : "↑"}</span> {t.label}</dd></div>
        <div><dt>Monto</dt><dd className={`cashf-summary-amount ${cents ? (sign < 0 ? "neg" : "pos") : ""}`}>{cents ? `${sign < 0 ? "−" : "+"}${formatCurrency(cents)}` : "—"}</dd></div>
        {type !== "income" && <div><dt>Categoría</dt><dd>{category ? CASH_EXPENSE_CATEGORY_LABELS[category] : <span className="cashf-missing">Sin elegir</span>}</dd></div>}
        {reason.trim() && <div><dt>Detalle</dt><dd>{reason.trim()}</dd></div>}
      </dl>
      {expected !== undefined && (
        <div className="cashf-impact">
          <span>Efectivo esperado</span>
          <b>{formatCurrency(expected)} → {formatCurrency(expected + sign * cents)}</b>
        </div>
      )}
      {type === "withdrawal" && <p className="cash-help"><KeyRound size={14} aria-hidden /> Al registrar se pide el PIN de un encargado.</p>}
      <p className="cash-help">Queda registrado con tu usuario y aparece en el cierre por categoría.</p>
      {recent.length > 0 && (
        <div className="cashf-recent">
          <div className="checkout-eyebrow">Últimos del turno</div>
          <ul>
            {recent.map((m) => (
              <li key={m.id}>
                <span className="cashf-recent-reason">{m.reason || m.type}</span>
                <span className={["expense", "withdrawal", "refund", "cash_order_not_collected"].includes(m.type) ? "neg" : "pos"}>
                  {["expense", "withdrawal", "refund", "cash_order_not_collected"].includes(m.type) ? "−" : "+"}{formatCurrency(m.amount)}
                </span>
                <small>{timeAgo(m.timestamp)}</small>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── Abrir caja ───────────────────────────────────────────────────────────────

export interface ShiftChoice {
  id: string
  name: string
  start: string
  end: string
  status: "free" | "open" | "closed"
}

export function OpenRegisterForm({ amount, onAmount, onSubmit, shifts, selectedShift, onShift, channelOptions, channel, onChannel }: {
  amount: string
  onAmount: (v: string) => void
  onSubmit: () => void
  shifts: ShiftChoice[]
  selectedShift: string | null
  onShift: (id: string) => void
  channelOptions: { id: CashChannel | null; label: string }[]
  channel: CashChannel | null
  onChannel: (c: CashChannel | null) => void
}) {
  return (
    <div className="cashf">
      <header className="checkout-head cashf-head">
        <div>
          <div className="checkout-eyebrow">Inicio de turno</div>
          <h2 className="cashf-title">Abrir caja</h2>
        </div>
      </header>
      <div className="cashf-grid">
        <AmountField
          id="cash-initial"
          label="Efectivo en el cajón"
          hint="Contalo antes de empezar"
          value={amount}
          onChange={onAmount}
          onEnter={onSubmit}
        />
        <div className="checkout-side">
          {shifts.length > 0 && (
            <section className="checkout-section" aria-labelledby="cashf-shift-label">
              <h3 className="checkout-section-title" id="cashf-shift-label">
                Turno
                <span className={`checkout-section-hint${selectedShift ? "" : " is-error"}`}>{selectedShift ? "Una caja por turno" : "Elegí el turno"}</span>
              </h3>
              <div className="cashf-cats" role="radiogroup" aria-label="Turno de la caja">
                {shifts.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={selectedShift === t.id}
                    className={`cashf-cat${selectedShift === t.id ? " on" : ""}`}
                    disabled={t.status !== "free"}
                    title={t.status === "free" ? undefined : t.status === "open" ? "Ya tiene la caja abierta" : "Ya se cerró en esta jornada"}
                    onClick={() => onShift(t.id)}
                  >
                    <span><b>{t.name}</b> · {t.start}–{t.end}{t.status === "closed" ? " · cerrado" : t.status === "open" ? " · abierto" : ""}</span>
                  </button>
                ))}
              </div>
              {shifts.every((t) => t.status !== "free") && (
                <p className="cash-help">Todos los turnos de hoy ya tuvieron su caja. Un turno tiene una sola caja.</p>
              )}
            </section>
          )}
          <section className="checkout-section" aria-labelledby="cashf-channel-label">
            <h3 className="checkout-section-title" id="cashf-channel-label">
              Esta caja recibe <span className="checkout-section-hint">Qué pedidos se cobran acá</span>
            </h3>
            <div className="cashf-cats" role="radiogroup" aria-label="Pedidos que recibe la caja">
              {channelOptions.map((c) => (
                <button key={String(c.id)} type="button" role="radio" aria-checked={channel === c.id} className={`cashf-cat${channel === c.id ? " on" : ""}`} onClick={() => onChannel(c.id)}>
                  {c.label}
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
