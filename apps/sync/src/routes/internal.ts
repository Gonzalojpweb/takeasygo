import mongoose from "mongoose"
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
  const header = req.headers["x-internal-secret"] ?? ""
  if (header !== config.internalApiSecret) {
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
        locationId: data.locationId,
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

      const createdEvent = {
        orderId,
        tenantId: data.tenantId,
        locationId: data.locationId,
        items: data.items,
        total: data.total,
        baseTotal: data.baseTotal,
        surchargeAmount: data.surchargeAmount,
        paymentMethod: data.paymentMethod,
        timestamp: new Date().toISOString(),
      }

      // Dual-room emission: generic tenant room (single-sede POS intactos)
      // + per-location room (multi-sede POS solo reciben su sede).
      io.to(`tenant:${data.tenantId}`).emit("order:created", createdEvent)
      if (data.locationId) {
        io.to(`tenant:${data.tenantId}:location:${data.locationId}`).emit("order:created", createdEvent)
      }

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

      const isObjectId = mongoose.Types.ObjectId.isValid(orderId)
      const syncOrder = await SyncOrderModel.findOne({
        tenantId,
        $or: [
          ...(isObjectId ? [{ _id: orderId }] : []),
          { externalOrderId: orderId },
        ],
      }).lean()
      const locationId = syncOrder?.locationId

      const confirmedEvent = {
        orderId,
        tenantId,
        locationId,
        timestamp: new Date().toISOString(),
      }
      io.to(`tenant:${tenantId}`).emit("order:confirmed", confirmedEvent)
      if (locationId) {
        io.to(`tenant:${tenantId}:location:${locationId}`).emit("order:confirmed", confirmedEvent)
      }

      // Also emit order:status_updated for POS UI
      const statusEvent = {
        orderId,
        tenantId,
        locationId,
        externalStatus: "confirmed",
        timestamp: new Date().toISOString(),
      }
      io.to(`tenant:${tenantId}`).emit("order:status_updated", statusEvent)
      if (locationId) {
        io.to(`tenant:${tenantId}:location:${locationId}`).emit("order:status_updated", statusEvent)
      }

      // Forward confirm to SaaS via outbox (BullMQ retry)
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

      const isObjectId = mongoose.Types.ObjectId.isValid(orderId)
      const syncOrder = await SyncOrderModel.findOne({
        tenantId,
        $or: [
          ...(isObjectId ? [{ _id: orderId }] : []),
          { externalOrderId: orderId },
        ],
      }).lean()
      const locationId = syncOrder?.locationId

      // Forward to SaaS via outbox (skip when called from SaaS to avoid loop)
      if (!skipForward && syncOrder?.externalOrderId) {
        await enqueueConfirmForward(confirmForwardQueue, {
          tenantId,
          orderId,
          externalOrderId: syncOrder.externalOrderId,
          status,
        })
      }

      const statusEvent = {
        orderId,
        tenantId,
        locationId,
        externalStatus: status,
        timestamp: new Date().toISOString(),
      }
      io.to(`tenant:${tenantId}`).emit("order:status_updated", statusEvent)
      if (locationId) {
        io.to(`tenant:${tenantId}:location:${locationId}`).emit("order:status_updated", statusEvent)
      }

      res.json({ status })
    } catch (err) {
      console.error("[internal/orders] status update error:", err)
      res.status(500).json({ error: "Internal server error" })
    }
  })

  router.get("/orders", async (req, res) => {
    try {
      const { tenantId, status, locationId } = req.query as { tenantId?: string; status?: string; locationId?: string }
      if (!tenantId) {
        res.status(400).json({ error: "tenantId required" })
        return
      }

      const filter: Record<string, any> = { tenantId }
      if (status) {
        filter.status = { $in: status.split(",") }
      }
      if (locationId) {
        filter.locationId = locationId
      }

      const { SyncOrderModel } = await import("@takeasygo/db")
      const docs = await SyncOrderModel.find(filter).sort({ createdAt: -1 }).limit(50).lean()

      const orders = docs.map((doc: any) => ({
        orderId: doc._id.toString(),
        tenantId: doc.tenantId,
        locationId: doc.locationId,
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
