import type { ComponentType, ReactNode } from "react"
import { Banknote, CreditCard, Receipt, TrendingDown, HandCoins, FileText, CheckCircle2, AlertTriangle, PlusCircle } from "lucide-react"
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

// ============================================================================
// Piezas del informe de caja (piloto 06/11/2026)
// ============================================================================
// Antes: todo blanco, centrado y con el mismo peso; costaba distinguir qué
// era efectivo, qué ventas y qué gastos. Ahora: franja de resultado, fichas
// de totales y bloques con color + ícono por tipo (nunca solo color: cada
// bloque lleva su título). Se usan en el Z y en el X.
// ============================================================================

type Tone = "cash" | "sales" | "fiscal" | "expense" | "tip"

export function ReportKpi({ label, value, tone, icon: Icon, hint }: { label: string; value: string; tone: Tone; icon: ComponentType<{ size?: number; "aria-hidden"?: boolean }>; hint?: string }) {
  return (
    <div className={`zr-kpi zr-tone--${tone}`}>
      <span className="zr-kpi-icon"><Icon size={18} aria-hidden /></span>
      <span className="zr-kpi-label">{label}</span>
      <strong className="zr-kpi-value">{value}</strong>
      {hint && <span className="zr-kpi-hint">{hint}</span>}
    </div>
  )
}

export function ReportBlock({ title, tone, icon: Icon, children, wide }: { title: string; tone: Tone; icon: ComponentType<{ size?: number; "aria-hidden"?: boolean }>; children: ReactNode; wide?: boolean }) {
  return (
    <section className={`zr-block zr-tone--${tone}${wide ? " zr-block--wide" : ""}`}>
      <h3 className="zr-block-head"><span className="zr-block-icon"><Icon size={16} aria-hidden /></span>{title}</h3>
      {children}
    </section>
  )
}

export function ReportRows({ rows, negative }: { rows: { label: string; value: number; strong?: boolean }[]; negative?: boolean }) {
  return (
    <dl className="zr-rows">
      {rows.map((r) => (
        <div key={r.label} className={`zr-row${r.strong ? " is-strong" : ""}`}>
          <dt>{r.label}</dt>
          <dd>{(negative && r.value > 0) || r.value < 0 ? "−" : ""}{formatCurrency(Math.abs(r.value))}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Medios de pago con barra de participación (más fácil de leer de un vistazo). */
export function MethodBars({ methods }: { methods: [string, number][] }) {
  const positive = methods.filter(([, v]) => v > 0)
  const max = Math.max(1, ...positive.map(([, v]) => v))
  const total = positive.reduce((s, [, v]) => s + v, 0)
  if (methods.length === 0) return <p className="zr-empty">Sin ventas en el turno</p>
  return (
    <ul className="zr-bars">
      {methods.sort((a, b) => b[1] - a[1]).map(([method, value]) => (
        <li key={method} className="zr-bar">
          <div className="zr-bar-top">
            <span>{PAYMENT_METHOD_LABELS[method as PaymentMethod] ?? method}</span>
            <b>{formatCurrency(value)}</b>
          </div>
          <div className="zr-bar-track" aria-hidden>
            <i style={{ width: `${Math.max(0, (value / max) * 100)}%` }} />
          </div>
          {total > 0 && value > 0 && <span className="zr-bar-share">{Math.round((value / total) * 100)}% de lo cobrado</span>}
        </li>
      ))}
    </ul>
  )
}

/**
 * Reporte Z (cierre de caja) — lee SOLO el snapshot inmutable guardado al
 * cerrar. Mismo componente en el POS y como base del ticket impreso.
 */
export function ZReportView({ z }: { z: ZReport }) {
  const methods = Object.entries(z.byPaymentMethod ?? {}).filter(([, total]) => total !== 0) as [string, number][]
  const categories = Object.entries(z.byCategory ?? {}).filter(([, total]) => (total ?? 0) > 0) as [string, number][]
  const diff = z.difference
  const state = diff === 0 ? "ok" : diff > 0 ? "over" : "short"
  const diffLabel = diff === 0 ? "Caja exacta" : diff > 0 ? "Sobrante" : "Faltante"
  const expenses = categories.reduce((s, [, v]) => s + v, 0)
  const tips = z.tipTotal ?? 0
  const closedAt = new Date(z.closedAt).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })

  return (
    <div className="zr">
      <header className={`zr-hero zr-hero--${state}`}>
        <div className="zr-hero-main">
          <span className="zr-hero-icon" aria-hidden>{state === "ok" ? <CheckCircle2 size={28} /> : <AlertTriangle size={28} />}</span>
          <div>
            <span className="zr-hero-label">{diffLabel}</span>
            <strong className="zr-hero-amount">{diff > 0 ? "+" : diff < 0 ? "−" : ""}{formatCurrency(Math.abs(diff))}</strong>
          </div>
        </div>
        <p className="zr-hero-meta">
          Cierre Z{z.shiftName ? ` · Turno ${z.shiftName}` : ""} · {closedAt} · cerró {z.closedBy} · {z.totalMovements} movimientos
        </p>
      </header>

      <div className="zr-kpis">
        <ReportKpi label="Ventas" value={formatCurrency(z.salesTotal)} tone="sales" icon={Receipt} hint={(z.voidCount ?? 0) > 0 ? `${z.voidCount} anuladas` : undefined} />
        <ReportKpi label="Efectivo contado" value={formatCurrency(z.finalAmount)} tone="cash" icon={Banknote} hint={`Esperado ${formatCurrency(z.expectedAmount)}`} />
        <ReportKpi label="Gastos y retiros" value={formatCurrency(expenses)} tone="expense" icon={TrendingDown} />
        {tips > 0 && <ReportKpi label="Propinas" value={formatCurrency(tips)} tone="tip" icon={HandCoins} hint="Fuera de las ventas" />}
      </div>

      <div className="zr-grid">
        <ReportBlock title="Ventas por medio de pago" tone="sales" icon={CreditCard} wide>
          <MethodBars methods={methods} />
          <ReportRows rows={[
            { label: "Total de ventas", value: z.salesTotal, strong: true },
            ...(z.refundTotal > 0 ? [{ label: "Devoluciones", value: -z.refundTotal }] : []),
          ]} />
        </ReportBlock>

        <ReportBlock title="Efectivo del cajón" tone="cash" icon={Banknote}>
          <ReportRows rows={[
            { label: "Fondo inicial", value: z.initialAmount },
            { label: "Esperado", value: z.expectedAmount },
            { label: "Contado", value: z.finalAmount, strong: true },
          ]} />
          {z.closingCount && z.closingCount.bills.length > 0 && (
            <details className="zr-details">
              <summary>Conteo por billete</summary>
              <ReportRows rows={[
                ...z.closingCount.bills.map((b) => ({ label: `${billLabel(b.value)} × ${b.count}`, value: b.value * b.count })),
                ...(z.closingCount.coins > 0 ? [{ label: "Monedas", value: z.closingCount.coins }] : []),
              ]} />
            </details>
          )}
        </ReportBlock>

        <ReportBlock title="Gastos y retiros" tone="expense" icon={TrendingDown}>
          {categories.length === 0 ? (
            <p className="zr-empty">Sin egresos en el turno</p>
          ) : (
            <ReportRows negative rows={categories.map(([c, v]) => ({ label: CASH_EXPENSE_CATEGORY_LABELS[c as CashExpenseCategory] ?? c, value: v }))} />
          )}
        </ReportBlock>

        {(z.incomeTotal - z.salesTotal > 0 || tips > 0) && (
          <ReportBlock title="Otros ingresos" tone="tip" icon={PlusCircle}>
            <ReportRows rows={[
              ...(tips > 0 ? [{ label: "Propinas", value: tips }] : []),
              ...(z.incomeTotal - z.salesTotal - tips > 0 ? [{ label: "Ingresos y depósitos", value: z.incomeTotal - z.salesTotal - tips }] : []),
            ]} />
          </ReportBlock>
        )}

        {z.fiscal && (
          <ReportBlock title="Facturación" tone="fiscal" icon={FileText}>
            <ReportRows rows={[
              { label: `Facturado (${z.fiscal.invoices})`, value: z.fiscal.invoicedCents, strong: true },
              ...(z.fiscal.creditNotes > 0 ? [{ label: `Notas de crédito (${z.fiscal.creditNotes})`, value: -z.fiscal.creditedCents }] : []),
              ...(z.fiscal.iva ?? []).flatMap((r) => r.rate > 0
                ? [{ label: `Neto gravado ${r.rate}%`, value: r.netCents }, { label: `IVA ${r.rate}%`, value: r.ivaCents }]
                : [{ label: "Exento / no gravado", value: r.netCents }]),
            ]} />
            {z.fiscal.pending > 0 && <p className="zr-warn">{z.fiscal.pending} factura{z.fiscal.pending === 1 ? "" : "s"} esperando a ARCA</p>}
          </ReportBlock>
        )}
      </div>
    </div>
  )
}
