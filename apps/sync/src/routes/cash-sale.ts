import { Router } from "express"
import { z } from "zod"
import type { Queue as BullQueue } from "bullmq"
import { CashSaleEventModel } from "@takeasygo/db"
import { config } from "../config"
import { enqueueCashSaleDelivery, type CashSaleJobData } from "../queues/cash-sale-queue"

// ============================================================================
// Cash Sale — Outbox Pattern para ventas TakeasyGO → Caja
// ============================================================================
// Flujo:
// 1. SaaS confirma pago → POST /api/v1/cash-sale (internal auth)
// 2. Sync Layer persiste el evento en MongoDB (outbox)
// 3. Intenta emit al POS vía WebSocket
// 4. Si el emit falla (POS offline), BullMQ reintenta con backoff exponencial
// 5. Máximo 10 reintentos. Si se agotan → status: "failed"
// 6. POS confirma recepción → PATCH /:eventId/deliver → status: "delivered"
// 7. Eventos failed son visibles vía GET /?status=failed (JWT auth)
// 8. Manager puede reintentar vía POST /:eventId/retry
//
// Auth:
// - POST / (crear): Internal API secret (server-to-server)
// - PATCH /:id/deliver: Internal API secret (POS ACK)
// - GET /, POST /:id/retry: JWT auth (POS o SaaS admin)
// ============================================================================

const cashSaleSchema = z.object({
  orderId: z.string().min(1),
  tenantId: z.string().min(1),
  amount: z.number().positive(),
  paymentMethod: z.enum(["cash", "mercadopago", "posnet_debit", "posnet_credit", "kripton", "transfer"]),
  orderMode: z.enum(["takeaway", "delivery", "dine-in", "business"]),
  timestamp: z.string().datetime().optional(),
})

function verifyInternalAuth(req: any): boolean {
  const header = req.headers.authorization
  if (!header?.startsWith("Bearer ")) return false
  const token = header.slice(7)
  return token === config.internalApiSecret
}

export function cashSaleRouter(
  io: any,
  cashSaleQueue: BullQueue<CashSaleJobData>
): Router {
  const router = Router()

  /**
   * POST /api/v1/cash-sale
   *
   * Recibe una venta confirmada de TakeasyGO y la persiste en el outbox.
   * Intenta emit al POS inmediatamente. Si falla, BullMQ reintenta.
   *
   * El POS procesa con idempotencia — si el evento llega duplicado,
   * lo descarta automáticamente.
   *
   * El unique index en (orderId, tenantId) previene que un POST duplicado
   * del SaaS cree dos eventos. El 2do insert falla con duplicate key error
   * y se retorna 409 Conflict.
   */
  router.post("/", async (req, res) => {
    // ── Auth: internal API secret ──────────────────────────────────
    if (!verifyInternalAuth(req)) {
      return res.status(401).json({ error: "Unauthorized" })
    }

    try {
      const parsed = cashSaleSchema.safeParse(req.body)
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid payload",
          details: parsed.error.flatten().fieldErrors,
        })
      }

      const { orderId, tenantId, amount, paymentMethod, orderMode, timestamp } = parsed.data

      // ── 1. Persistir en outbox (previene duplicados via unique index) ──
      let event
      try {
        event = await CashSaleEventModel.create({
          orderId,
          tenantId,
          amount,
          paymentMethod,
          orderMode,
          timestamp: timestamp ? new Date(timestamp) : new Date(),
          source: "sync_layer",
          status: "pending",
          attempts: 0,
        })
      } catch (err: any) {
        // Duplicate key = evento ya registrado (SaaS reintentó el POST)
        if (err.code === 11000) {
          return res.status(409).json({
            status: "duplicate",
            orderId,
            message: "Event already registered",
          })
        }
        throw err
      }

      // ── 2. Intentar emit al POS inmediatamente ────────────────────
      // Incluir eventId en el payload para que el POS pueda confirmar
      // recepción sin query extra (ACK pattern).
      const payload = {
        eventId: event._id.toString(),
        orderId,
        tenantId,
        amount,
        paymentMethod,
        orderMode,
        timestamp: (timestamp ?? new Date().toISOString()) as string,
        source: "sync_layer" as const,
      }

      io.to(`tenant:${tenantId}`).emit("cash_sale", payload)

      // ── 3. Encolar reintento via BullMQ (fallback si POS offline) ──
      // El worker verificará si el evento ya fue delivered antes de re-emitir.
      await enqueueCashSaleDelivery(cashSaleQueue, {
        eventId: event._id.toString(),
        tenantId,
        orderId,
      })

      return res.status(200).json({
        status: "forwarded",
        orderId,
        eventId: event._id,
        message: "Sale persisted and forwarded to POS",
      })
    } catch (err) {
      console.error("[cash-sale] Error:", err)
      return res.status(500).json({ error: "Internal server error" })
    }
  })

  /**
   * PATCH /api/v1/cash-sale/:eventId/deliver
   *
   * Marcado como delivered cuando el POS confirma recepción.
   * Llamado desde el POS vía flush/replay o directamente.
   */
  router.patch("/:eventId/deliver", async (req, res) => {
    if (!verifyInternalAuth(req)) {
      return res.status(401).json({ error: "Unauthorized" })
    }

    const { eventId } = req.params
    const event = await CashSaleEventModel.findByIdAndUpdate(
      eventId,
      { status: "delivered" },
      { new: true }
    )

    if (!event) {
      return res.status(404).json({ error: "Event not found" })
    }

    return res.status(200).json({ status: "delivered", eventId })
  })

  /**
   * GET /api/v1/cash-sale?status=failed&tenantId=X
   *
   * Lista eventos de cash sale por status. Usado por el POS para mostrar
   * eventos fallidos al manager en la escena "Pendientes".
   *
   * Auth: JWT (montado después de authMiddleware en index.ts).
   */
  router.get("/", async (req, res) => {
    try {
      const auth = req.auth!
      const { status, tenantId } = req.query

      const filter: Record<string, any> = {
        tenantId: tenantId ?? auth.tenantId,
      }
      if (status && ["pending", "delivered", "failed"].includes(status as string)) {
        filter.status = status
      }

      const events = await CashSaleEventModel.find(filter)
        .sort({ createdAt: -1 })
        .limit(50)
        .lean()

      return res.status(200).json({ events })
    } catch (err) {
      console.error("[cash-sale] List error:", err)
      return res.status(500).json({ error: "Internal server error" })
    }
  })

  /**
   * POST /api/v1/cash-sale/:eventId/retry
   *
   * Re-intenta un evento fallido. Resetea status a "pending" y re-encola.
   * Usado por el manager cuando ve eventos fallidos en el POS.
   *
   * Auth: JWT.
   */
  router.post("/:eventId/retry", async (req, res) => {
    try {
      const auth = req.auth!
      const { eventId } = req.params

      const event = await CashSaleEventModel.findById(eventId)
      if (!event) {
        return res.status(404).json({ error: "Event not found" })
      }
      if (event.tenantId !== auth.tenantId) {
        return res.status(403).json({ error: "Tenant mismatch" })
      }
      if (event.status !== "failed") {
        return res.status(400).json({
          error: "Only failed events can be retried",
          currentStatus: event.status,
        })
      }

      // Resetear estado y re-encolar
      await CashSaleEventModel.findByIdAndUpdate(eventId, {
        status: "pending",
        attempts: 0,
        lastError: undefined,
      })

      await enqueueCashSaleDelivery(cashSaleQueue, {
        eventId,
        tenantId: event.tenantId,
        orderId: event.orderId,
      })

      return res.status(200).json({ status: "retried", eventId })
    } catch (err) {
      console.error("[cash-sale] Retry error:", err)
      return res.status(500).json({ error: "Internal server error" })
    }
  })

  return router
}
