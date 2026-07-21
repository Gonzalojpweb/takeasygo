import { Router } from "express"
import type { Queue as BullQueue } from "bullmq"
import type { Server as SocketServer } from "socket.io"
import { config } from "../config"
import { createTranslatedOrder, updateOrderStatus } from "../services/order-translator"
import { enqueueOrderCreated, removePendingOrder } from "../queues/order-queue"
import { enqueueConfirmForward } from "../queues/order-confirm-forward-queue"
import type { ConfirmForwardJobData } from "../queues/order-confirm-forward-queue"
import { SyncOrderModel } from "@takeasygo/db"

function internalAuth(req: any, res: any, next: any) {
  const header = req.headers.authorization ?? ""
  const token = header.startsWith("Bearer ") ? header.slice(7) : ""
  if (token !== config.internalApiSecret) {
    return res.status(401).json({ error: "Unauthorized" })
  }
  next()
}

export function internalRouter(
  io: SocketServer,
  orderQueue: BullQueue,
  confirmForwardQueue: BullQueue<ConfirmForwardJobData>
): Router {
  const router = Router()

  router.use(internalAuth)

  router.post("/orders", async (req, res) => {
    try {
      const data = req.body

      const { id: orderId, duplicate } = await createTranslatedOrder({
        tenantId: data.tenantId,
        source: "takeasygo",
        status: "pending",
        items: data.items,
        total: data.total,
        menuVersion: data.menuVersion ?? 1,
        customerId: data.customerId,
        notes: data.notes,
        externalOrderId: data.externalOrderId,
        paymentMethod: data.paymentMethod,
      })

      if (duplicate) {
        res.status(200).json({ orderId, duplicate: true })
        return
      }

      io.to(`tenant:${data.tenantId}`).emit("order:created", {
        orderId,
        tenantId: data.tenantId,
        items: data.items,
        total: data.total,
        paymentMethod: data.paymentMethod,
        timestamp: new Date().toISOString(),
      })

      // Conditional timeout: transfer → 24h, MP/kripton → 10 min
      const timeoutMs = data.paymentMethod === 'transfer'
        ? 24 * 60 * 60 * 1000
        : 10 * 60 * 1000

      await enqueueOrderCreated(orderQueue, {
        eventId: orderId,
        tenantId: data.tenantId,
        orderId,
        timestamp: new Date().toISOString(),
        offlineTimeoutMs: timeoutMs,
      })

      res.status(201).json({ orderId })
    } catch (err) {
      console.error("[internal/orders] create error:", err)
      res.status(500).json({ error: "Internal server error" })
    }
  })

  router.patch("/orders/:orderId/confirm", async (req, res) => {
    try {
      const { orderId } = req.params
      const { tenantId } = req.body

      if (!tenantId) {
        res.status(400).json({ error: "tenantId required" })
        return
      }

      const updated = await updateOrderStatus(orderId, tenantId, "confirmed")
      if (!updated) {
        res.status(404).json({ error: "Order not found" })
        return
      }

      await removePendingOrder(orderQueue, orderId)

      io.to(`tenant:${tenantId}`).emit("order:confirmed", {
        orderId,
        tenantId,
        timestamp: new Date().toISOString(),
      })

      // Also emit order:status_updated for POS UI
      io.to(`tenant:${tenantId}`).emit("order:status_updated", {
        orderId,
        tenantId,
        externalStatus: "confirmed",
        timestamp: new Date().toISOString(),
      })

      // Forward confirm to SaaS via outbox (BullMQ retry)
      const syncOrder = await SyncOrderModel.findOne({ _id: orderId, tenantId }).lean()
      if (syncOrder?.externalOrderId) {
        await enqueueConfirmForward(confirmForwardQueue, {
          tenantId,
          orderId,
          externalOrderId: syncOrder.externalOrderId,
        })
      }

      res.json({ status: "confirmed" })
    } catch (err) {
      console.error("[internal/orders] confirm error:", err)
      res.status(500).json({ error: "Internal server error" })
    }
  })

  // POST /orders/:orderId/status — POS reports status change, SyncLayer forwards to SaaS
  // skipForward: when true (SaaS-initiated), update DB + emit socket but skip forward queue
  router.post("/orders/:orderId/status", async (req, res) => {
    try {
      const { orderId } = req.params
      const { tenantId, status, skipForward } = req.body

      if (!tenantId || !status) {
        res.status(400).json({ error: "tenantId and status required" })
        return
      }

      const updated = await updateOrderStatus(orderId, tenantId, status)
      if (!updated) {
        res.status(404).json({ error: "Order not found" })
        return
      }

      io.to(`tenant:${tenantId}`).emit("order:status_updated", {
        orderId,
        tenantId,
        externalStatus: status,
        timestamp: new Date().toISOString(),
      })

      // Forward to SaaS via outbox (skip when called from SaaS to avoid loop)
      if (!skipForward) {
        const syncOrder = await SyncOrderModel.findOne({ _id: orderId, tenantId }).lean()
        if (syncOrder?.externalOrderId) {
          await enqueueConfirmForward(confirmForwardQueue, {
            tenantId,
            orderId,
            externalOrderId: syncOrder.externalOrderId,
            status,
          })
        }
      }

      res.json({ status })
    } catch (err) {
      console.error("[internal/orders] status update error:", err)
      res.status(500).json({ error: "Internal server error" })
    }
  })

  router.get("/orders", async (req, res) => {
    try {
      const { tenantId, status } = req.query as { tenantId?: string; status?: string }
      if (!tenantId) {
        res.status(400).json({ error: "tenantId required" })
        return
      }

      const filter: Record<string, any> = { tenantId }
      if (status) {
        filter.status = { $in: status.split(",") }
      }

      const { SyncOrderModel } = await import("@takeasygo/db")
      const docs = await SyncOrderModel.find(filter).sort({ createdAt: -1 }).limit(50).lean()

      const orders = docs.map((doc: any) => ({
        orderId: doc._id.toString(),
        tenantId: doc.tenantId,
        source: doc.source,
        status: doc.status,
        paymentMethod: doc.paymentMethod,
        items: doc.items,
        total: doc.total,
        createdAt: doc.createdAt,
      }))

      res.json(orders)
    } catch (err) {
      console.error("[internal/orders] list error:", err)
      res.status(500).json({ error: "Internal server error" })
    }
  })

  return router
}
