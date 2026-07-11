import { Router } from "express"
import type { Queue as BullQueue } from "bullmq"
import type { Server as SocketServer } from "socket.io"
import { config } from "../config"
import { createTranslatedOrder } from "../services/order-translator"
import { enqueueOrderCreated } from "../queues/order-queue"

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

      const { id: orderId } = await createTranslatedOrder({
        tenantId: data.tenantId,
        source: "takeasygo",
        status: "pending",
        items: data.items,
        total: data.total,
        menuVersion: data.menuVersion ?? 1,
        customerId: data.customerId,
        notes: data.notes,
      })

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
        offlineTimeoutMs: 3 * 60 * 1000,
      })

      res.status(201).json({ orderId })
    } catch (err) {
      console.error("[internal/orders] create error:", err)
      res.status(500).json({ error: "Internal server error" })
    }
  })

  return router
}
