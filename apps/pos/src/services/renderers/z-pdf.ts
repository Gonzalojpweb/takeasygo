import type { ZReport, PaymentMethod } from "@takeasygo/types"
import { toPesos } from "@takeasygo/business"

// ============================================================================
// Z Report — Renderer PDF (client-side)
// ============================================================================
// Decisión: Consenso v1 §4 — PDF generado client-side (jsPDF o similar).
// El POS es offline-first — el comprobante no puede depender de conexión.
//
// Lee del ZReport persistido, nunca recalcula.
// ============================================================================

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  mercadopago: "MercadoPago",
  posnet_debit: "POSNET Débito",
  posnet_credit: "POSNET Crédito",
  kripton: "Kripton",
  transfer: "Transferencia",
}

interface RenderOptions {
  tenantName: string
  tenantLogo?: string  // base64 data URL o URL externa
  locationName?: string
}

/**
 * Genera el ZReport como HTML listo para convertir a PDF.
 *
 * Retorna HTML completo con estilos inline, optimizado para
 * impresión A4. Se puede usar con window.print() o con
 * una librería de PDF como jsPDF-html2canvas.
 *
 * @param zReport - Snapshot inmutable del cierre
 * @param options - Branding del tenant
 * @returns HTML string
 */
export function renderZPdfHtml(zReport: ZReport, options: RenderOptions): string {
  const { tenantName, tenantLogo, locationName } = options

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Cierre de Caja — ${tenantName}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; padding: 32px; max-width: 600px; margin: 0 auto; }
  .header { text-align: center; margin-bottom: 24px; border-bottom: 2px solid #e5e5e5; padding-bottom: 16px; }
  .header img { height: 48px; margin-bottom: 8px; }
  .header h1 { font-size: 18px; font-weight: 700; }
  .header h2 { font-size: 14px; font-weight: 400; color: #666; margin-top: 4px; }
  .header .subtitle { font-size: 12px; color: #999; margin-top: 8px; }
  .section { margin-bottom: 16px; }
  .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #666; border-bottom: 1px solid #e5e5e5; padding-bottom: 4px; margin-bottom: 8px; }
  .row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
  .row.total { font-weight: 700; font-size: 14px; border-top: 1px solid #e5e5e5; padding-top: 8px; margin-top: 4px; }
  .row .label { color: #333; }
  .row .value { font-weight: 600; font-variant-numeric: tabular-nums; }
  .row .value.positive { color: #16a34a; }
  .row .value.negative { color: #dc2626; }
  .row .value.neutral { color: #666; }
  .footer { text-align: center; margin-top: 24px; padding-top: 16px; border-top: 2px solid #e5e5e5; font-size: 10px; color: #999; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; }
  .badge.partial { background: #fef3c7; color: #92400e; }
</style>
</head>
<body>
  <div class="header">
    ${tenantLogo ? `<img src="${tenantLogo}" alt="${tenantName}">` : ""}
    <h1>${tenantName}</h1>
    ${locationName ? `<h2>${locationName}</h2>` : ""}
    <div class="subtitle">REPORTE DE CIERRE Z</div>
  </div>

  <div class="section">
    <div class="section-title">Información General</div>
    <div class="row"><span class="label">Fecha de cierre</span><span class="value">${formatDate(zReport.closedAt)}</span></div>
    <div class="row"><span class="label">Cajero</span><span class="value">${zReport.closedBy}</span></div>
    <div class="row"><span class="label">ID Caja</span><span class="value neutral">${zReport.registerId.slice(0, 8).toUpperCase()}</span></div>
  </div>

  <div class="section">
    <div class="section-title">Totales Generales</div>
    <div class="row"><span class="label">Monto inicial</span><span class="value">${formatCurrency(zReport.initialAmount)}</span></div>
    <div class="row"><span class="label">Saldo esperado</span><span class="value">${formatCurrency(zReport.expectedAmount)}</span></div>
    <div class="row"><span class="label">Saldo físico</span><span class="value">${formatCurrency(zReport.finalAmount)}</span></div>
    <div class="row total"><span class="label">${zReport.difference >= 0 ? "Sobrante" : "Faltante"}</span><span class="value ${zReport.difference >= 0 ? "positive" : "negative"}">${zReport.difference >= 0 ? "+" : "-"}${formatCurrency(Math.abs(zReport.difference))}</span></div>
  </div>

  <div class="section">
    <div class="section-title">Ventas por Canal</div>
    <div class="row"><span class="label">Mostrador (${zReport.byChannel.counter.movementCount} ops)</span><span class="value">${formatCurrency(zReport.byChannel.counter.sales)}</span></div>
    <div class="row"><span class="label">TakeasyGO (${zReport.byChannel.takeasygo.movementCount} ops)</span><span class="value">${formatCurrency(zReport.byChannel.takeasygo.sales)}</span></div>
  </div>

  <div class="section">
    <div class="section-title">Ventas por Método de Pago</div>
    ${Object.entries(zReport.byPaymentMethod)
      .map(([method, total]) => {
        const label = PAYMENT_METHOD_LABELS[method as PaymentMethod] ?? method
        return `<div class="row"><span class="label">${label}</span><span class="value">${formatCurrency(total)}</span></div>`
      })
      .join("\n    ")}
  </div>

  <div class="section">
    <div class="section-title">Movimientos</div>
    <div class="row"><span class="label">Total movimientos</span><span class="value neutral">${zReport.totalMovements}</span></div>
    <div class="row"><span class="label">Ingresos</span><span class="value positive">+${formatCurrency(zReport.incomeTotal)}</span></div>
    <div class="row"><span class="label">Egresos</span><span class="value negative">-${formatCurrency(zReport.expenseTotal)}</span></div>
    <div class="row"><span class="label">Ventas</span><span class="value">${formatCurrency(zReport.salesTotal)}</span></div>
    <div class="row"><span class="label">Reembolsos</span><span class="value negative">-${formatCurrency(zReport.refundTotal)}</span></div>
  </div>

  <div class="footer">
    <p>Este reporte es inmutable una vez generado.</p>
    <p>Cierre de caja definitivo — ${formatDate(zReport.generatedAt)}</p>
  </div>
</body>
</html>`
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return `$${toPesos(amount).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }) + " " + date.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  })
}
