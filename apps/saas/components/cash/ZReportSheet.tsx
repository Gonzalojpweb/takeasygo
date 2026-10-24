import { CASH_EXPENSE_CATEGORY_LABELS, formatCents } from '@takeasygo/business'
import type { CashExpenseCategory, PaymentMethod, ZReport } from '@takeasygo/types'

// ============================================================================
// Hoja del reporte Z — misma vista en el panel del dueño, el PDF (imprimir →
// guardar como PDF) y el link compartible. Lee SOLO el snapshot inmutable.
// Fase 2 de caja (2026-10) — ADMIN/FASE2_Z_PARA_LLEVARSE.md
// ============================================================================

const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  mercadopago: 'MercadoPago',
  posnet_debit: 'Débito',
  posnet_credit: 'Crédito',
  kripton: 'Kripton',
  transfer: 'Transferencia',
}

export interface ZSheetHeader {
  tenantName: string
  locationName: string
  logoUrl?: string | null
  openedAt: Date
  openedBy: string
  timezone?: string
}

function when(d: Date | string, tz?: string): string {
  return new Date(d).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz || 'America/Argentina/Buenos_Aires',
  })
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? 'font-black tabular-nums' : 'font-semibold tabular-nums'}>{value}</span>
    </div>
  )
}

export function ZReportSheet({ z, header }: { z: ZReport; header: ZSheetHeader }) {
  const diff = z.difference
  const methods = Object.entries(z.byPaymentMethod ?? {}).filter(([, v]) => v !== 0)
  const categories = Object.entries(z.byCategory ?? {}).filter(([, v]) => (v ?? 0) > 0)

  return (
    <article className="mx-auto max-w-3xl rounded-3xl border-2 border-border/60 bg-card p-6 print:border-0 print:p-0 print:shadow-none">
      <header className="flex items-center justify-between gap-4 border-b border-border/60 pb-4">
        <div className="flex items-center gap-3">
          {header.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={header.logoUrl} alt="" className="h-12 w-12 rounded-xl object-cover" />
          ) : null}
          <div>
            <div className="text-lg font-black">{header.tenantName}</div>
            <div className="text-sm text-muted-foreground">{header.locationName} · Cierre de caja (Z)</div>
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>Abrió {header.openedBy} · {when(header.openedAt, header.timezone)}</div>
          <div>Cerró {z.closedBy} · {when(z.closedAt, header.timezone)}</div>
        </div>
      </header>

      <div
        className={`mt-5 flex items-baseline justify-between rounded-2xl px-5 py-4 ${
          diff === 0 ? 'bg-emerald-50 text-emerald-900' : diff > 0 ? 'bg-sky-50 text-sky-900' : 'bg-red-50 text-red-900'
        }`}
      >
        <span className="font-bold">{diff === 0 ? 'Caja exacta' : diff > 0 ? 'Sobrante' : 'Faltante'}</span>
        <span className="text-2xl font-black tabular-nums">
          {diff > 0 ? '+' : diff < 0 ? '−' : ''}
          {formatCents(Math.abs(diff))}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
        <section className="rounded-2xl bg-muted/30 p-4">
          <h3 className="mb-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Efectivo</h3>
          <Row label="Fondo inicial" value={formatCents(z.initialAmount)} />
          <Row label="Esperado" value={formatCents(z.expectedAmount)} />
          <Row label="Contado" value={formatCents(z.finalAmount)} strong />
          {z.closingCount && z.closingCount.bills.length > 0 && (
            <div className="mt-2 border-t border-dashed border-border pt-2 text-xs">
              {z.closingCount.bills.map((b) => (
                <Row key={b.value} label={`${formatCents(b.value)} × ${b.count}`} value={formatCents(b.value * b.count)} />
              ))}
              {z.closingCount.coins > 0 && <Row label="Monedas" value={formatCents(z.closingCount.coins)} />}
            </div>
          )}
        </section>

        <section className="rounded-2xl bg-muted/30 p-4">
          <h3 className="mb-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Ventas por medio de pago</h3>
          {methods.length === 0 ? (
            <p className="text-muted-foreground">Sin ventas</p>
          ) : (
            methods.map(([m, v]) => <Row key={m} label={METHOD_LABELS[m as PaymentMethod] ?? m} value={formatCents(v)} />)
          )}
          <div className="mt-2 border-t border-dashed border-border pt-2">
            <Row label="Total ventas" value={formatCents(z.salesTotal)} strong />
            {z.refundTotal > 0 && <Row label="Devoluciones" value={`−${formatCents(z.refundTotal)}`} />}
            {(z.voidCount ?? 0) > 0 && <Row label="Ventas anuladas" value={String(z.voidCount)} />}
          </div>
        </section>

        <section className="rounded-2xl bg-muted/30 p-4">
          <h3 className="mb-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Gastos y retiros</h3>
          {categories.length === 0 ? (
            <p className="text-muted-foreground">Sin egresos</p>
          ) : (
            categories.map(([c, v]) => (
              <Row
                key={c}
                label={CASH_EXPENSE_CATEGORY_LABELS[c as CashExpenseCategory] ?? c}
                value={`−${formatCents(v ?? 0)}`}
              />
            ))
          )}
          <div className="mt-2 border-t border-dashed border-border pt-2">
            <Row label="Movimientos" value={String(z.totalMovements)} />
          </div>
        </section>
      </div>

      <p className="mt-5 text-center text-[11px] text-muted-foreground">
        Reporte generado al cerrar la caja. No se modifica después del cierre.
      </p>
    </article>
  )
}
