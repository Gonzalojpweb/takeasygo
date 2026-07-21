import { Router } from "express"
import type { Queue as BullQueue } from "bullmq"
import type { Server as SocketServer } from "socket.io"
import mongoose from "mongoose"
import {
  createTranslatedOrder,
  updateOrderStatus,
} from "../services/order-translator"
import { SyncOrderModel } from "@takeasygo/db"
import { enqueueOrderCreated, removePendingOrder } from "../queues/order-queue"
import { enqueueConfirmForward } from "../queues/order-confirm-forward-queue"
import type { ConfirmForwardJobData } from "../queues/order-confirm-forward-queue"
import { validate, orderCreateSchema } from "../middleware/validation"

export function ordersRouter(
  io: SocketServer,
  orderQueue: BullQueue,
  confirmForwardQueue: BullQueue<ConfirmForwardJobData>
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

      const result = docs.map((o: Record<string, any>) => ({
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

  // GET /orders/pending — fetch active orders for reconnect recovery (JWT auth)
  // Includes delivered (last 24h) so POS can reconcile status changes that
  // happened while offline (e.g., delivery driver marked delivered in SaaS).
  router.get("/pending", async (req, res) => {
    try {
      const auth = req.auth!
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const docs = await SyncOrderModel.find({
        tenantId: auth.tenantId,
        status: { $in: ["pending", "confirmed", "preparing", "ready", "delivered"] },
        updatedAt: { $gte: cutoff },
      }).sort({ createdAt: -1 }).limit(50).lean()

      res.json(docs.map((doc: any) => ({
        orderId: doc._id.toString(),
        tenantId: doc.tenantId,
        source: doc.source,
        status: doc.status,
        paymentMethod: doc.paymentMethod,
        items: doc.items,
        total: doc.total,
      })))
    } catch (err) {
      console.error("[orders] pending list error:", err)
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
        paymentMethod: data.paymentMethod,
      })

      io.to(`tenant:${auth.tenantId}`).emit("order:created", {
        orderId,
        tenantId: auth.tenantId,
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
        tenantId: auth.tenantId,
        orderId,
        timestamp: new Date().toISOString(),
        offlineTimeoutMs: timeoutMs,
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

      await removePendingOrder(orderQueue, orderId)

      io.to(`tenant:${auth.tenantId}`).emit("order:confirmed", {
        orderId,
        tenantId: auth.tenantId,
        timestamp: new Date().toISOString(),
      })

      // Also emit order:status_updated for POS UI
      io.to(`tenant:${auth.tenantId}`).emit("order:status_updated", {
        orderId,
        tenantId: auth.tenantId,
        externalStatus: "confirmed",
        timestamp: new Date().toISOString(),
      })

      // Forward confirm to SaaS via outbox (BullMQ retry)
      const syncOrder = await SyncOrderModel.findOne({ _id: orderId, tenantId: auth.tenantId }).lean()
      if (syncOrder?.externalOrderId) {
        await enqueueConfirmForward(confirmForwardQueue, {
          tenantId: auth.tenantId,
          orderId,
          externalOrderId: syncOrder.externalOrderId,
        })
      }

      res.json({ status: "confirmed" })
    } catch (err) {
      console.error("[orders] confirm error:", err)
      res.status(500).json({ error: "Internal server error" })
    }
  })

  return router
}
