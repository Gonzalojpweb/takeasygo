import type { CashRegister, ZReport } from "@takeasygo/types"

// ============================================================================
// Z Report Sync — Sube el ZReport al Sync Layer después del cierre
// ============================================================================
// Después de cerrar la caja, el POS sube el ZReport completo al Sync Layer
// para la vista web compartible.
//
// Flujo:
// 1. closeRegister() genera ZReport + shareToken
// 2. uploadZReport() lo sube al Sync Layer
// 3. Sync Layer almacena y genera la URL compartible
// ============================================================================

const SYNC_URL = import.meta.env.VITE_SYNC_URL

export interface UploadZReportPayload {
  registerId: string
  cashierName: string
  closedAt: string
  zReport: ZReport
  shareToken: string
}

export interface UploadZReportResult {
  status: "uploaded"
  shareUrl: string
}

/**
 * Sube el ZReport al Sync Layer para la vista web compartible.
 *
 * @param jwt - Token de autenticación del POS
 * @param register - Caja cerrada con zReport y shareToken
 * @returns URL del reporte compartible
 */
export async function uploadZReport(
  jwt: string,
  register: CashRegister
): Promise<UploadZReportResult | null> {
  if (!register.zReport || !register.shareToken) return null
  if (!SYNC_URL) {
    console.warn("[z-report-sync] VITE_SYNC_URL not configured")
    return null
  }

  try {
    const payload: UploadZReportPayload = {
      registerId: register.id,
      cashierName: register.closedBy ?? "Unknown",
      closedAt: register.closedAt!.toISOString(),
      zReport: register.zReport,
      shareToken: register.shareToken,
    }

    const response = await fetch(`${SYNC_URL}/api/v1/z-report`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      console.error("[z-report-sync] Upload failed:", response.status)
      return null
    }

    const result = await response.json()
    return result as UploadZReportResult
  } catch (err) {
    console.error("[z-report-sync] Upload error:", err)
    return null
  }
}
