import type { ZReport, PaymentMethod } from "@takeasygo/types"
import { toPesos } from "@takeasygo/business"

// ============================================================================
// Z Report — Renderer Web (vista compartible por link)
// ============================================================================
// Decisión: Consenso v1 §4 — Vista web compartible con expiración o auth
// mínima. Contiene montos de venta del negocio.
//
// Pensado para compartir por WhatsApp sin descargar archivo.
// Diseño responsive, optimizado para mobile.
//
// NOTA: El envío por email/link al admin depende de sincronización.
// La renderización es local — lee del ZReport persistido.
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
  tenantLogo?: string
  locationName?: string
}

/**
 * Renderiza el ZReport como HTML compartible.
 *
 * Diseño mobile-first, dark theme consistente con el POS.
 * Se puede enviar como link o mostrar en una WebView.
 *
 * @param zReport - Snapshot inmutable del cierre
 * @param options - Branding del tenant
 * @returns HTML string completo
 */
export function renderZWeb(zReport: ZReport, options: RenderOptions): string {
  const { tenantName, tenantLogo, locationName } = options

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Cierre de Caja — ${tenantName}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0d0b0a; color: #f7f4f2; min-height: 100vh; }
  .container { max-width: 400px; margin: 0 auto; padding: 20px; }
  .header { text-align: center; padding: 24px 0; border-bottom: 1px solid rgba(255,255,255,0.1); }
  .header img { height: 40px; margin-bottom: 12px; border-radius: 8px; }
  .header h1 { font-size: 18px; font-weight: 700; }
  .header h2 { font-size: 13px; font-weight: 400; color: #999; margin-top: 4px; }
  .header .badge { display: inline-block; margin-top: 12px; padding: 4px 12px; border-radius: 20px; background: rgba(241,71,34,0.15); color: #f14722; font-size: 11px; font-weight: 600; }
  .section { margin-top: 20px; }
  .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #666; margin-bottom: 8px; }
  .card { background: rgba(255,255,255,0.05); border-radius: 12px; padding: 16px; }
  .row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
  .row:last-child { border-bottom: none; }
  .row .label { font-size: 13px; color: #999; }
  .row .value { font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .row .value.positive { color: #4ade80; }
  .row .value.negative { color: #f87171; }
  .row.highlight { background: rgba(241,71,34,0.08); margin: 0 -16px; padding: 12px 16px; border-radius: 8px; }
  .row.highlight .label { font-weight: 600; color: #f7f4f2; }
  .row.highlight .value { font-size: 20px; font-weight: 700; }
  .footer { text-align: center; padding: 24px 0; margin-top: 20px; border-top: 1px solid rgba(255,255,255,0.1); }
  .footer p { font-size: 10px; color: #666; line-height: 1.6; }
  .divider { height: 1px; background: rgba(255,255,255,0.05); margin: 16px 0; }
</style>
</head>
<body>
  <div class="container">
    <div class="header">
      ${tenantLogo ? `<img src="${tenantLogo}" alt="${tenantName}">` : ""}
      <h1>${tenantName}</h1>
      ${locationName ? `<h2>${locationName}</h2>` : ""}
      <div class="badge">REPORTE DE CIERRE Z</div>
    </div>

    <div class="section">
      <div class="section-title">Información</div>
      <div class="card">
        <div class="row"><span class="label">Fecha</span><span class="value">${formatDate(zReport.closedAt)}</span></div>
        <div class="row"><span class="label">Cajero</span><span class="value">${zReport.closedBy}</span></div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Totales</div>
      <div class="card">
        <div class="row"><span class="label">Inicial</span><span class="value">${formatCurrency(zReport.initialAmount)}</span></div>
        <div class="row"><span class="label">Esperado</span><span class="value">${formatCurrency(zReport.expectedAmount)}</span></div>
        <div class="row"><span class="label">Físico</span><span class="value">${formatCurrency(zReport.finalAmount)}</span></div>
        <div class="row highlight">
          <span class="label">${zReport.difference >= 0 ? "Sobrante" : "Faltante"}</span>
          <span class="value ${zReport.difference >= 0 ? "positive" : "negative"}">${zReport.difference >= 0 ? "+" : "-"}${formatCurrency(Math.abs(zReport.difference))}</span>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Por Canal</div>
      <div class="card">
        <div class="row"><span class="label">Mostrador</span><span class="value">${formatCurrency(zReport.byChannel.counter.sales)}</span></div>
        <div class="row"><span class="label">TakeasyGO</span><span class="value">${formatCurrency(zReport.byChannel.takeasygo.sales)}</span></div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Por Método de Pago</div>
      <div class="card">
        ${Object.entries(zReport.byPaymentMethod)
          .map(([method, total]) => {
            const label = PAYMENT_METHOD_LABELS[method as PaymentMethod] ?? method
            return `<div class="row"><span class="label">${label}</span><span class="value">${formatCurrency(total)}</span></div>`
          })
          .join("\n        ")}
      </div>
    </div>

    <div class="section">
      <div class="section-title">Movimientos</div>
      <div class="card">
        <div class="row"><span class="label">Ingresos</span><span class="value positive">+${formatCurrency(zReport.incomeTotal)}</span></div>
        <div class="row"><span class="label">Egresos</span><span class="value negative">-${formatCurrency(zReport.expenseTotal)}</span></div>
        <div class="row"><span class="label">Ventas</span><span class="value">${formatCurrency(zReport.salesTotal)}</span></div>
        <div class="row"><span class="label">Reembolsos</span><span class="value negative">-${formatCurrency(zReport.refundTotal)}</span></div>
        <div class="row"><span class="label">Total ops</span><span class="value">${zReport.totalMovements}</span></div>
      </div>
    </div>

    <div class="footer">
      <p>Reporte inmutable — cierre definitivo</p>
      <p>Generado ${formatDate(zReport.generatedAt)}</p>
    </div>
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
