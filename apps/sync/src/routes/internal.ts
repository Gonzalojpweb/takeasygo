import { Router } from "express"
import type { Queue as BullQueue } from "bullmq"
import type { Server as SocketServer } from "socket.io"
import { config } from "../config"
import { createTranslatedOrder, updateOrderStatus } from "../services/order-translator"
import { enqueueOrderCreated, removePendingOrder } from "../queues/order-queue"

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
  orderQueue: BullQueue
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
        timestamp: new Date().toISOString(),
      })

      await enqueueOrderCreated(orderQueue, {
        eventId: orderId,
        tenantId: data.tenantId,
        orderId,
        timestamp: new Date().toISOString(),
        offlineTimeoutMs: 10 * 60 * 1000,
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

      res.json({ status: "confirmed" })
    } catch (err) {
      console.error("[internal/orders] confirm error:", err)
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
