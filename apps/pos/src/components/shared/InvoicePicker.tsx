import type { FiscalConfig, InvoiceChoice } from "../../services/fiscal"
import { isInvoiceChoiceValid } from "../../services/fiscal"
import { FiscalHelpButton } from "../Fiscal/FiscalHelpCenter"

/**
 * Factura en el cobro (Fase 5 de caja). Un renglón con la elección y, solo
 * si hace falta, el CUIT o DNI del cliente. Sin pantallas nuevas.
 */
export function InvoicePicker({
  config,
  value,
  onChange,
}: {
  config: FiscalConfig
  value: InvoiceChoice
  onChange: (value: InvoiceChoice) => void
}) {
  if (!config.enabled) return null
  const options: { id: InvoiceChoice["type"]; label: string }[] = [
    ...(config.mode === "ask" ? [{ id: "none" as const, label: "Sin factura" }] : []),
    { id: "final", label: `Factura ${config.letterForFinalConsumer ?? ""}` },
    { id: "company", label: `Factura ${config.letterForCompany ?? ""} con CUIT` },
  ]
  const set = (patch: Partial<InvoiceChoice>) => onChange({ ...value, ...patch })
  const valid = isInvoiceChoiceValid(value)

  return (
    <div className="card invoice-picker" style={{ padding: "var(--sp-3)" }}>
      <div className="chip-row" role="radiogroup" aria-label="Factura">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value.type === o.id}
            className={`chip ${value.type === o.id ? "active" : ""}`}
            onClick={() => set({ type: o.id })}
          >
            {o.label}
          </button>
        ))}
        {config.environment === "homologation" && <span className="invoice-test">Pruebas</span>}
        {/* Fase L: ¿A, B o C? ¿DNI? — ayuda a mano en el cobro */}
        <FiscalHelpButton topic={value.type === "company" ? "cuit" : "abc"} label="?" />
      </div>

      {value.type === "company" && (
        <div className="invoice-fields">
          <input
            className="search-input"
            inputMode="numeric"
            placeholder="CUIT del cliente"
            aria-label="CUIT del cliente"
            aria-invalid={!valid}
            value={value.docNumber}
            onChange={(e) => set({ docNumber: e.target.value.replace(/[^\d-]/g, "").slice(0, 13) })}
          />
          <input
            className="search-input"
            placeholder="Razón social (opcional)"
            aria-label="Razón social"
            maxLength={120}
            value={value.name}
            onChange={(e) => set({ name: e.target.value })}
          />
          <div className="chip-row" role="radiogroup" aria-label="Condición del cliente">
            {(
              [
                ["responsable_inscripto", "Resp. Inscripto"],
                ["monotributo", "Monotributo"],
                ["exento", "Exento"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={value.companyCondition === id}
                className={`chip ${value.companyCondition === id ? "active" : ""}`}
                onClick={() => set({ companyCondition: id })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {value.type === "final" && (
        <input
          className="search-input"
          inputMode="numeric"
          placeholder="DNI del cliente (opcional)"
          aria-label="DNI del cliente"
          aria-invalid={!valid}
          value={value.docNumber}
          onChange={(e) => set({ docNumber: e.target.value.replace(/\D/g, "").slice(0, 11) })}
          style={{ marginTop: "var(--sp-2)" }}
        />
      )}
      {!valid && <div className="text-sm" style={{ color: "var(--error)", marginTop: "var(--sp-1)" }}>
        {value.type === "company" ? "El CUIT tiene 11 dígitos." : "El DNI tiene 7 u 8 dígitos."}
      </div>}
    </div>
  )
}
