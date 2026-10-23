import { useMemo, useState } from "react"
import type { PaymentMethod } from "@takeasygo/types"
import {
  cashChange,
  isCheckoutComplete,
  remainingToPay,
  splitEvenly,
  type CheckoutPart,
} from "@takeasygo/business/browser"
import { PaymentMethodGrid } from "./PaymentMethodGrid"
import { formatCurrency, parsePesosInput, centsToPesosInput } from "../../utils/format"
import { formatPaymentMethod, isExternalPaymentMethod } from "../../services/payment"

// ============================================================================
// CheckoutPanel — cobro con uno o varios métodos y montos libres
// ============================================================================
// Reemplaza el cobro anterior (Auditoría POS Online V1 §5):
//   · split en partes IGUALES con Math.ceil → cobraba de más
//   · los comensales que no elegían método quedaban forzados a "cash"
//   · MP/POSNET/transferencia no se registraban en ningún lado
// Acá cada parte tiene método + monto libre + comprobante opcional, y el
// botón se habilita solo cuando la suma es EXACTAMENTE el total (regla de
// @takeasygo/business/checkout; el server la vuelve a validar).
//
// Los ids de las partes se generan al agregarlas y no cambian: son la
// Idempotency-Key de cada parte si el cobro se reintenta.
// ============================================================================

interface CheckoutPanelProps {
  /** Total a cobrar, en centavos. */
  total: number
  busy?: boolean
  onConfirm: (parts: CheckoutPart[]) => void
  /** Mostrador: "Enviar a cocina" (la orden nace confirmada e imprime comanda). */
  sendToKitchen?: { value: boolean; onChange: (value: boolean) => void }
  /** Celular del cliente para el club (opcional): suma puntos y cuenta como visita. */
  clubPhone?: { value: string; onChange: (value: string) => void }
}

/** Celular válido para el club: vacío (no se usa) u 8 a 15 dígitos. */
export function isClubPhoneValid(phone: string): boolean {
  const digits = phone.replace(/\D/g, "")
  return digits.length === 0 || (digits.length >= 8 && digits.length <= 15)
}

export function CheckoutPanel({ total, busy = false, onConfirm, sendToKitchen, clubPhone }: CheckoutPanelProps) {
  const [parts, setParts] = useState<CheckoutPart[]>([])
  const [amountText, setAmountText] = useState<Record<string, string>>({})
  const [received, setReceived] = useState("")
  const [splitCount, setSplitCount] = useState(2)

  const remaining = remainingToPay(total, parts)
  const complete = isCheckoutComplete(total, parts)
  const cashDue = useMemo(
    () => parts.filter((p) => p.method === "cash").reduce((s, p) => s + p.amount, 0),
    [parts]
  )
  const receivedCents = parsePesosInput(received)
  const hasExternal = parts.some((p) => isExternalPaymentMethod(p.method))

  const setAll = (next: CheckoutPart[]) => {
    setParts(next)
    setAmountText(Object.fromEntries(next.map((p) => [p.id, centsToPesosInput(p.amount)])))
  }

  const addPart = (method: PaymentMethod) => {
    const amount = remaining > 0 ? remaining : 0
    const part: CheckoutPart = { id: crypto.randomUUID(), method, amount }
    setParts((prev) => [...prev, part])
    setAmountText((prev) => ({ ...prev, [part.id]: amount > 0 ? centsToPesosInput(amount) : "" }))
  }

  const updatePart = (id: string, patch: Partial<CheckoutPart>) => {
    setParts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  const updateAmount = (id: string, text: string) => {
    setAmountText((prev) => ({ ...prev, [id]: text }))
    updatePart(id, { amount: parsePesosInput(text) ?? 0 })
  }

  const removePart = (id: string) => {
    setParts((prev) => prev.filter((p) => p.id !== id))
  }

  const splitInto = (n: number) => {
    setAll(splitEvenly(total, n).map((amount) => ({ id: crypto.randomUUID(), method: "cash" as const, amount })))
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <div className="text-muted text-sm">Total a cobrar</div>
        <div style={{ fontSize: 32, fontWeight: 700, color: "var(--primary-action)" }}>{formatCurrency(total)}</div>
        {parts.length > 0 && (
          <div
            className="text-sm"
            style={{ marginTop: 4, fontWeight: 600, color: remaining === 0 ? "var(--success)" : "var(--error)" }}
          >
            {remaining === 0
              ? "Cubierto"
              : remaining > 0
                ? `Falta ${formatCurrency(remaining)}`
                : `Sobra ${formatCurrency(-remaining)}`}
          </div>
        )}
      </div>

      {parts.length > 0 && (
        <div className="flex flex-col gap-3">
          {parts.map((part, i) => {
            const info = formatPaymentMethod(part.method)
            return (
              <div key={part.id} className="card" style={{ padding: "var(--sp-3)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", marginBottom: "var(--sp-2)" }}>
                  <span style={{ fontSize: 20 }}>{info.icon}</span>
                  <select
                    className="search-input"
                    value={part.method}
                    onChange={(e) => updatePart(part.id, { method: e.target.value as PaymentMethod })}
                    aria-label={`Método de la parte ${i + 1}`}
                    style={{ flex: 1 }}
                  >
                    {(["cash", "mercadopago", "posnet_debit", "posnet_credit", "transfer"] as PaymentMethod[]).map((m) => (
                      <option key={m} value={m}>
                        {formatPaymentMethod(m).name}
                      </option>
                    ))}
                  </select>
                  <button className="btn btn-ghost btn-sm" onClick={() => removePart(part.id)} aria-label="Quitar parte">
                    ✕
                  </button>
                </div>
                <input
                  className="search-input"
                  inputMode="decimal"
                  placeholder="Monto"
                  value={amountText[part.id] ?? ""}
                  onChange={(e) => updateAmount(part.id, e.target.value)}
                  aria-label={`Monto de la parte ${i + 1}`}
                  style={{ fontSize: 20, textAlign: "center" }}
                />
                {isExternalPaymentMethod(part.method) && (
                  <input
                    className="search-input"
                    placeholder="Comprobante / N° de operación (opcional)"
                    maxLength={100}
                    value={part.reference ?? ""}
                    onChange={(e) => updatePart(part.id, { reference: e.target.value || undefined })}
                    style={{ marginTop: "var(--sp-2)" }}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      {remaining > 0 && (
        <div>
          <div className="text-sm text-muted" style={{ marginBottom: "var(--sp-2)" }}>
            {parts.length === 0 ? "Elegí cómo paga" : "Agregar otro método"}
          </div>
          <PaymentMethodGrid onSelect={addPart} />
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", justifyContent: "center" }}>
        <span className="text-sm text-muted">Dividir en</span>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setSplitCount((n) => Math.max(2, n - 1))}
          disabled={splitCount <= 2}
          style={{ width: 32, height: 32, padding: 0 }}
        >
          −
        </button>
        <span style={{ fontWeight: 600, minWidth: 24, textAlign: "center" }}>{splitCount}</span>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setSplitCount((n) => Math.min(20, n + 1))}
          style={{ width: 32, height: 32, padding: 0 }}
        >
          +
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => splitInto(splitCount)}>
          partes iguales
        </button>
      </div>

      {cashDue > 0 && (
        <div className="card" style={{ padding: "var(--sp-3)" }}>
          <label className="text-sm text-muted" style={{ display: "block", marginBottom: "var(--sp-1)" }}>
            Efectivo recibido (para calcular el vuelto)
          </label>
          <input
            className="search-input"
            inputMode="decimal"
            placeholder={centsToPesosInput(cashDue)}
            value={received}
            onChange={(e) => setReceived(e.target.value)}
          />
          {receivedCents !== null && receivedCents > 0 && (
            <div style={{ marginTop: "var(--sp-2)", fontWeight: 700 }}>
              {receivedCents < cashDue
                ? `Faltan ${formatCurrency(cashDue - receivedCents)} en efectivo`
                : `Vuelto: ${formatCurrency(cashChange(cashDue, receivedCents))}`}
            </div>
          )}
        </div>
      )}

      {sendToKitchen && (
        <label style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={sendToKitchen.value}
            onChange={(e) => sendToKitchen.onChange(e.target.checked)}
          />
          <span>
            Enviar a cocina <span className="text-muted text-sm">(imprime la comanda; se entrega desde Mis Pedidos)</span>
          </span>
        </label>
      )}

      {clubPhone && (
        <div className="card" style={{ padding: "var(--sp-3)" }}>
          <label htmlFor="club-phone" className="text-sm" style={{ display: "block", marginBottom: "var(--sp-1)", fontWeight: 600 }}>
            Celular del cliente para el club <span className="text-muted">(opcional)</span>
          </label>
          <input
            id="club-phone"
            className="search-input"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="Ej: 11 2345 6789"
            value={clubPhone.value}
            onChange={(e) => clubPhone.onChange(e.target.value)}
            aria-invalid={!isClubPhoneValid(clubPhone.value)}
          />
          <div className="text-sm text-muted" style={{ marginTop: "var(--sp-1)" }}>
            {isClubPhoneValid(clubPhone.value)
              ? "Si es socio del club, la compra le suma puntos. Si lo invitó otro socio, cuenta como su visita al local."
              : "Revisá el número: tiene que tener entre 8 y 15 dígitos."}
          </div>
        </div>
      )}

      {hasExternal && (
        <div className="text-sm text-muted text-center">
          Confirmá solo cuando el terminal / la transferencia esté aprobada.
        </div>
      )}

      <button
        className="btn btn-primary"
        disabled={!complete || busy || (clubPhone ? !isClubPhoneValid(clubPhone.value) : false)}
        onClick={() => onConfirm(parts)}
      >
        {busy ? "Registrando cobro…" : `Confirmar cobro ${formatCurrency(total)}`}
      </button>
    </div>
  )
}
