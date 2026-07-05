import { Router } from "express"
import type { Queue as BullQueue } from "bullmq"
import type { Server as SocketServer } from "socket.io"
import mongoose from "mongoose"
import {
  createTranslatedOrder,
  updateOrderStatus,
} from "../services/order-translator"
import { enqueueOrderCreated } from "../queues/order-queue"
import { validate, orderCreateSchema } from "../middleware/validation"

export function ordersRouter(
  io: SocketServer,
  orderQueue: BullQueue
): Router {
  const router = Router()

  // GET /orders — list orders with optional filters (status, orderMode)
  router.get("/", async (req, res) => {
    try {
      const auth = req.auth!
      const tenantId = new mongoose.Types.ObjectId(auth.tenantId)
      const status = req.query.status as string | undefined
      const orderMode = req.query.orderMode as string | undefined

      const db = mongoose.connection.db!
      const orders = db.collection("orders")

      const filter: Record<string, any> = { tenantId }
      if (status) {
        filter.status = { $in: status.split(",") }
      }
      if (orderMode) {
        filter.orderMode = orderMode
      }

      const docs = await orders
        .find(filter)
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray()

      const result = docs.map((o) => ({
        id: o._id?.toString() ?? "",
        orderNumber: o.orderNumber ?? "",
        status: o.status ?? "pending",
        orderMode: o.orderMode ?? "dine-in",
        customer: o.customer ?? {},
        items: o.items ?? [],
        total: o.total ?? 0,
        createdAt: o.createdAt?.toISOString?.() ?? "",
        notes: o.notes ?? undefined,
      }))

      res.json(result)
    } catch (err) {
      console.error("[orders] list error:", err)
      res.status(500).json({ error: "Internal server error" })
    }
  })

  router.post("/", validate(orderCreateSchema), async (req, res) => {
    try {
      const auth = req.auth!
      const data = req.body

      const { id: orderId } = await createTranslatedOrder({
        tenantId: auth.tenantId,
        source: "takeasygo",
        status: "pending",
        items: data.items,
        total: data.total,
        menuVersion: data.menuVersion ?? 1,
        customerId: data.customerId,
        notes: data.notes,
      })

      io.to(`tenant:${auth.tenantId}`).emit("order:created", {
        orderId,
        tenantId: auth.tenantId,
        items: data.items,
        total: data.total,
        timestamp: new Date().toISOString(),
      })

      await enqueueOrderCreated(orderQueue, {
        eventId: orderId,
        tenantId: auth.tenantId,
        orderId,
        timestamp: new Date().toISOString(),
        offlineTimeoutMs: 3 * 60 * 1000,
      })

      res.status(201).json({ orderId })
    } catch (err) {
      console.error("[orders] create error:", err)
      res.status(500).json({ error: "Internal server error" })
    }
  })

  router.patch("/:orderId/confirm", async (req, res) => {
    try {
      const auth = req.auth!
      const { orderId } = req.params

      const updated = await updateOrderStatus(orderId, auth.tenantId, "confirmed")
      if (!updated) {
        res.status(404).json({ error: "Order not found" })
        return
      }

      io.to(`tenant:${auth.tenantId}`).emit("order:confirmed", {
        orderId,
        tenantId: auth.tenantId,
        timestamp: new Date().toISOString(),
      })

      res.json({ status: "confirmed" })
    } catch (err) {
      console.error("[orders] confirm error:", err)
      res.status(500).json({ error: "Internal server error" })
    }
  })

  return router
}
