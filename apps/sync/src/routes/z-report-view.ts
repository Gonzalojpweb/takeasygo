import { Router } from "express"
import { ZReportRecordModel, TenantModel } from "@takeasygo/db"

// ============================================================================
// Z Report Shareable — Vista web del cierre de caja
// ============================================================================
// Consenso v1 §4 — El Z Report se puede compartir por link.
// Auth: token de alta entropía en la URL (no JWT).
// Expiración: 30 días desde la generación.
// Tenant branding: logo + nombre del tenant.
//
// Seguridad: el token es un UUID v4 (128 bits de entropía).
// La ruta se excluye de logging verboso de requests (ver nota en index.ts).
// ============================================================================

const TOKEN_EXPIRY_DAYS = 30

export function zReportViewRouter(): Router {
  const router = Router()

  /**
   * GET /api/v1/z-report/:shareToken
   *
   * Retorna el HTML del Z Report renderizado con branding del tenant.
   * No requiere JWT — el token de share ES la autenticación.
   * Expira después de 30 días.
   */
  router.get("/:shareToken", async (req, res) => {
    try {
      const { shareToken } = req.params

      const record = await ZReportRecordModel.findOne({ shareToken })
      if (!record) {
        return res.status(404).send(`
          <!DOCTYPE html>
          <html><head><title>Z Report no encontrado</title></head>
          <body style="font-family:system-ui;padding:40px;text-align:center">
            <h1>Enlace no válido</h1>
            <p>El enlace que solicitaste no existe o expiró.</p>
          </body></html>
        `)
      }

      // Verificar expiración (30 días)
      const createdAt = new Date(record.createdAt)
      const expiryMs = TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
      if (Date.now() - createdAt.getTime() > expiryMs) {
        return res.status(410).send(`
          <!DOCTYPE html>
          <html><head><title>Z Report expirado</title></head>
          <body style="font-family:system-ui;padding:40px;text-align:center">
            <h1>Enlace expirado</h1>
            <p>Este enlace expiró después de ${TOKEN_EXPIRY_DAYS} días.</p>
          </body></html>
        `)
      }

      // Obtener branding del tenant
      let tenantName = "Restaurante"
      let tenantLogo: string | undefined
      try {
        const tenant = await TenantModel.findById(record.tenantId).lean()
        if (tenant) {
          tenantName = (tenant as any).name ?? tenantName
          tenantLogo = (tenant as any).branding?.logoUrl
        }
      } catch {
        // Continuar con defaults si falla
      }

      // Renderizar HTML con branding
      // NOTA: renderZWeb del POS no es importable desde el server.
      // Se usa generateStaticHTML como fallback. En producción,
      // el sync server y el POS comparten el mismo bundle de renderers
      // o se extrae a un paquete compartido.
      const html = generateStaticHTML(record.zReport as any, {
        tenantName,
        tenantLogo,
      })

      res.setHeader("Content-Type", "text/html; charset=utf-8")
      res.setHeader("Cache-Control", "private, max-age=3600")
      return res.send(html)
    } catch (err) {
      console.error("[z-report-view] Error:", err)
      return res.status(500).send(`
        <!DOCTYPE html>
        <html><head><title>Error</title></head>
        <body style="font-family:system-ui;padding:40px;text-align:center">
          <h1>Error al cargar el reporte</h1>
          <p>Intenta nuevamente más tarde.</p>
        </body></html>
      `)
    }
  })

  return router
}

/**
 * HTML estático de fallback cuando no se puede importar renderZWeb del POS.
 * En producción, el POS se build separadamente y este import funciona.
 * Este fallback es para desarrollo/testing.
 */
function generateStaticHTML(zReport: any, options: { tenantName: string; tenantLogo?: string }): string {
  const { tenantName, tenantLogo } = options
  const z = zReport

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Z Report — ${tenantName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0d0b0a; color: #f5f5f4; padding: 24px; max-width: 480px; margin: 0 auto; }
    .header { text-align: center; margin-bottom: 24px; }
    .header img { max-height: 48px; margin-bottom: 8px; }
    .header h1 { font-size: 18px; font-weight: 700; }
    .header p { font-size: 13px; color: #a8a29e; margin-top: 4px; }
    .section { background: #1c1917; border-radius: 12px; padding: 16px; margin-bottom: 12px; }
    .section-title { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #78716c; margin-bottom: 12px; }
    .row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
    .row.total { border-top: 1px solid #292524; margin-top: 8px; padding-top: 12px; font-weight: 700; font-size: 16px; }
    .row .label { color: #a8a29e; }
    .positive { color: #22c55e; }
    .negative { color: #ef4444; }
    .footer { text-align: center; font-size: 11px; color: #57534e; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="header">
    ${tenantLogo ? `<img src="${tenantLogo}" alt="${tenantName}">` : ""}
    <h1>${tenantName}</h1>
    <p>${z.cashierName} — ${new Date(z.closedAt).toLocaleDateString("es-AR")}</p>
  </div>

  <div class="section">
    <div class="section-title">Totales</div>
    <div class="row"><span class="label">Inicial</span><span>$${z.initialCashCount?.toFixed(2) ?? "0.00"}</span></div>
    <div class="row"><span class="label">Esperado (efectivo)</span><span>$${z.expectedAmount?.toFixed(2) ?? "0.00"}</span></div>
    <div class="row"><span class="label">Físico</span><span>$${z.physicalCashCount?.toFixed(2) ?? "0.00"}</span></div>
    <div class="row total"><span>Diferencia</span><span class="${(z.difference ?? 0) >= 0 ? "positive" : "negative"}">$${z.difference?.toFixed(2) ?? "0.00"}</span></div>
  </div>

  <div class="section">
    <div class="section-title">Por canal</div>
    ${Object.entries(z.byChannel ?? {}).map(([ch, data]: [string, any]) => `
      <div class="row"><span class="label">${ch === "counter" ? "Mostrador" : "TakeasyGO"}</span><span>$${data.sales?.toFixed(2) ?? "0.00"}</span></div>
    `).join("")}
  </div>

  <div class="section">
    <div class="section-title">Por método de pago</div>
    ${Object.entries(z.byPaymentMethod ?? {}).map(([pm, amount]: [string, any]) => `
      <div class="row"><span class="label">${pm}</span><span>$${typeof amount === "number" ? amount.toFixed(2) : "0.00"}</span></div>
    `).join("")}
  </div>

  <div class="footer">
    Reporte inmutable generado el ${new Date(z.closedAt).toLocaleString("es-AR")}
  </div>
</body>
</html>`
}
