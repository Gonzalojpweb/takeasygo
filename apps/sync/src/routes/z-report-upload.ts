import { Router } from "express"
import { ZReportRecordModel } from "@takeasygo/db"

// ============================================================================
// Z Report Upload — POS → Sync Layer
// ============================================================================
// Después de cerrar la caja, el POS sube el ZReport completo al Sync Layer
// junto con el shareToken. El Sync Layer lo almacena para servirlo vía
// la ruta pública /z-report/:shareToken.
//
// Auth: JWT del POS (authMiddleware + tenantMiddleware ya están montados).
// ============================================================================

export function zReportUploadRouter(): Router {
  const router = Router()

  /**
   * POST /api/v1/z-report
   *
   * Sube un Z Report completo al Sync Layer para la vista compartible.
   * El POS llama a este endpoint después de cerrar la caja.
   *
   * Idempotencia: si el registerId ya existe, actualiza (upsert).
   */
  router.post("/", async (req, res) => {
    try {
      const auth = req.auth!
      const { registerId, cashierName, closedAt, zReport, shareToken } = req.body

      if (!registerId || !cashierName || !closedAt || !zReport || !shareToken) {
        return res.status(400).json({
          error: "Missing required fields: registerId, cashierName, closedAt, zReport, shareToken",
        })
      }

      await ZReportRecordModel.findOneAndUpdate(
        { registerId, tenantId: auth.tenantId },
        {
          registerId,
          tenantId: auth.tenantId,
          cashierName,
          closedAt: new Date(closedAt),
          zReport: zReport as Record<string, unknown>,
          shareToken,
        },
        { upsert: true, new: true }
      )

      const syncUrl = process.env.SYNC_URL ?? ""
      const shareUrl = `${syncUrl}/api/v1/z-report/${shareToken}`

      console.log(
        `[z-report] uploaded: ${registerId} (${auth.tenantId}) → ${shareUrl}`
      )

      return res.status(200).json({
        status: "uploaded",
        registerId,
        shareUrl,
      })
    } catch (err) {
      console.error("[z-report] Upload error:", err)
      return res.status(500).json({ error: "Internal server error" })
    }
  })

  return router
}
