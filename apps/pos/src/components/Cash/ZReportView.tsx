import { CASH_EXPENSE_CATEGORY_LABELS } from "@takeasygo/business/browser"
import type { CashExpenseCategory, PaymentMethod, ZReport } from "@takeasygo/types"
import { formatCurrency } from "../../utils/format"

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  mercadopago: "MercadoPago",
  posnet_debit: "Débito",
  posnet_credit: "Crédito",
  kripton: "Kripton",
  transfer: "Transferencia",
}

function billLabel(cents: number): string {
  return `$${(cents / 100).toLocaleString("es-AR")}`
}

/**
 * Reporte Z (cierre de caja) — lee SOLO el snapshot inmutable guardado al
 * cerrar. Mismo componente en el POS y como base del ticket impreso.
 */
export function ZReportView({ z }: { z: ZReport }) {
  const methods = Object.entries(z.byPaymentMethod ?? {}).filter(([, total]) => total !== 0)
  const categories = Object.entries(z.byCategory ?? {}).filter(([, total]) => (total ?? 0) > 0)
  const diff = z.difference
  const diffLabel = diff === 0 ? "Caja exacta" : diff > 0 ? "Sobrante" : "Faltante"

  return (
    <div className="z-report">
      <div className={`z-result ${diff === 0 ? "ok" : diff > 0 ? "over" : "short"}`}>
        <span className="z-result-label">{diffLabel}</span>
        <span className="z-result-amount">
          {diff > 0 ? "+" : diff < 0 ? "−" : ""}
          {formatCurrency(Math.abs(diff))}
        </span>
      </div>

      <div className="z-grid">
        <section className="z-block">
          <h3>Efectivo</h3>
          <dl>
            <dt>Fondo inicial</dt><dd>{formatCurrency(z.initialAmount)}</dd>
            <dt>Esperado</dt><dd>{formatCurrency(z.expectedAmount)}</dd>
            <dt>Contado</dt><dd><strong>{formatCurrency(z.finalAmount)}</strong></dd>
          </dl>
          {z.closingCount && z.closingCount.bills.length > 0 && (
            <dl className="z-count">
              {z.closingCount.bills.map((b) => (
                <div key={b.value} className="z-count-row">
                  <dt>{billLabel(b.value)} × {b.count}</dt>
                  <dd>{formatCurrency(b.value * b.count)}</dd>
                </div>
              ))}
              {z.closingCount.coins > 0 && (
                <div className="z-count-row"><dt>Monedas</dt><dd>{formatCurrency(z.closingCount.coins)}</dd></div>
              )}
            </dl>
          )}
        </section>

        <section className="z-block">
          <h3>Ventas por medio de pago</h3>
          {methods.length === 0 ? (
            <p className="text-muted text-sm">Sin ventas</p>
          ) : (
            <dl>
              {methods.map(([method, total]) => (
                <div key={method} className="z-count-row">
                  <dt>{PAYMENT_METHOD_LABELS[method as PaymentMethod] ?? method}</dt>
                  <dd>{formatCurrency(total)}</dd>
                </div>
              ))}
            </dl>
          )}
          <dl className="z-totals">
            <dt>Ventas</dt><dd>{formatCurrency(z.salesTotal)}</dd>
            {z.refundTotal > 0 && (<><dt>Devoluciones</dt><dd>−{formatCurrency(z.refundTotal)}</dd></>)}
            {(z.voidCount ?? 0) > 0 && (<><dt>Ventas anuladas</dt><dd>{z.voidCount}</dd></>)}
          </dl>
          {z.fiscal && (
            <dl className="z-totals">
              <dt>Facturado ({z.fiscal.invoices})</dt><dd>{formatCurrency(z.fiscal.invoicedCents)}</dd>
              {z.fiscal.creditNotes > 0 && (<><dt>Notas de crédito ({z.fiscal.creditNotes})</dt><dd>−{formatCurrency(z.fiscal.creditedCents)}</dd></>)}
              {z.fiscal.pending > 0 && (<><dt>Facturas esperando a ARCA</dt><dd>{z.fiscal.pending}</dd></>)}
            </dl>
          )}
        </section>

        <section className="z-block">
          <h3>Gastos y retiros</h3>
          {categories.length === 0 ? (
            <p className="text-muted text-sm">Sin egresos</p>
          ) : (
            <dl>
              {categories.map(([category, total]) => (
                <div key={category} className="z-count-row">
                  <dt>{CASH_EXPENSE_CATEGORY_LABELS[category as CashExpenseCategory] ?? category}</dt>
                  <dd>−{formatCurrency(total ?? 0)}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      </div>

      <p className="z-meta">
        Cerró {z.closedBy} · {new Date(z.closedAt).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · {z.totalMovements} movimientos
      </p>
    </div>
  )
}
