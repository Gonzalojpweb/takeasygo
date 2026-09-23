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
import { enqueueComplianceChecks, cancelComplianceJobs } from "../queues/compliance-queue"
import type { ComplianceJobData } from "../queues/compliance-queue"
import { validate, orderCreateSchema } from "../middleware/validation"
import { ComplianceConfigModel, DEFAULT_SLA_RULES } from "@takeasygo/db"

/** Mapa de status → siguiente status esperado (para dispatch de compliance) */
const NEXT_STATUS: Record<string, string> = {
  pending: "confirmed",
  confirmed: "preparing",
  preparing: "ready",
  ready: "en_ruta",
  en_ruta: "arrived",
  arrived: "delivered",
}

export function ordersRouter(
  io: SocketServer,
  orderQueue: BullQueue,
  confirmForwardQueue: BullQueue<ConfirmForwardJobData>,
  complianceQueue: BullQueue<ComplianceJobData>
): Router {
  const router = Router()

  /** Helper: obtener reglas SLA para una sede (config o defaults) */
  async function getSlaRules(tenantId: string, locationId?: string) {
    try {
      const config = await ComplianceConfigModel.findOne({
        tenantId: new mongoose.Types.ObjectId(tenantId),
        $or: [
          ...(locationId ? [{ locationId: new mongoose.Types.ObjectId(locationId) }] : []),
          { locationId: null },
        ],
      }).sort({ locationId: -1 }).lean()

      if (!config || !config.enabled) return null
      return config.slaRules.length > 0 ? config.slaRules : DEFAULT_SLA_RULES
    } catch {
      return DEFAULT_SLA_RULES
    }
  }

  /** Helper: despachar jobs de compliance para una transición */
  async function dispatchCompliance(
    tenantId: string,
    locationId: string | undefined,
    orderId: string,
    orderNumber: string,
    fromStatus: string,
    toStatus: string,
    orderMode: string
  ) {
    if (!locationId) return
    const rules = await getSlaRules(tenantId, locationId)
    if (!rules) return

    const rule = rules.find(
      (r: any) =>
        r.fromStatus === fromStatus &&
        r.toStatus === toStatus &&
        (r.orderMode === orderMode || r.orderMode === "all")
    ) ?? rules.find(
      (r: any) =>
        r.fromStatus === fromStatus &&
        r.toStatus === toStatus &&
        r.orderMode === "all"
    )

    if (!rule) return

    await enqueueComplianceChecks(complianceQueue, {
      tenantId,
      locationId,
      orderId,
      orderNumber,
      fromStatus,
      toStatus,
      orderMode,
      level1Minutes: rule.level1Minutes,
      level2Minutes: rule.level2Minutes,
      level3Minutes: rule.level3Minutes,
    })
  }

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
      const filter: Record<string, any> = {
        tenantId: auth.tenantId,
        status: { $in: ["pending", "confirmed", "preparing", "ready", "delivered"] },
        updatedAt: { $gte: cutoff },
      }
      if (auth.locationId) {
        filter.locationId = auth.locationId
      }
      const docs = await SyncOrderModel.find(filter).sort({ createdAt: -1 }).limit(50).lean()

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
        locationId: auth.locationId,
        source: "takeasygo",
        status: "pending",
        items: data.items,
        total: data.total,
        baseTotal: data.baseTotal,
        surchargeAmount: data.surchargeAmount,
        menuVersion: data.menuVersion ?? 1,
        customerId: data.customerId,
        notes: data.notes,
        paymentMethod: data.paymentMethod,
      })

      const createdEvent = {
        orderId,
        tenantId: auth.tenantId,
        locationId: auth.locationId,
        items: data.items,
        total: data.total,
        baseTotal: data.baseTotal,
        surchargeAmount: data.surchargeAmount,
        paymentMethod: data.paymentMethod,
        timestamp: new Date().toISOString(),
      }

      io.to(`tenant:${auth.tenantId}`).emit("order:created", createdEvent)
      if (auth.locationId) {
        io.to(`tenant:${auth.tenantId}:location:${auth.locationId}`).emit("order:created", createdEvent)
      }

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

      // Schedule compliance checks for pending → confirmed
      dispatchCompliance(
        auth.tenantId,
        auth.locationId,
        orderId,
        data.orderNumber ?? orderId.slice(-6),
        "pending",
        "confirmed",
        data.orderMode ?? "takeaway"
      ).catch((err) => console.error("[orders] compliance dispatch error (non-blocking):", err))

      res.status(201).json({ orderId })
    } catch (err) {
      console.error("[orders] create error:", err)
      res.status(500).json({ error: "Internal server error" })
    }
  })

  // POST /orders/:orderId/status — POS reports status change, forwards to SaaS
  router.post("/:orderId/status", async (req, res) => {
    try {
      const auth = req.auth!
      const { orderId } = req.params
      const { status } = req.body

      if (!status) {
        res.status(400).json({ error: "status required" })
        return
      }

      console.log(`[orders/status] orderId=${orderId}, isObjectId=${mongoose.Types.ObjectId.isValid(orderId)}, tenantId=${auth.tenantId}, status=${status}`)

      // Read current status before update (for compliance job cancellation)
      const isObjectIdCheck = mongoose.Types.ObjectId.isValid(orderId)
      const currentOrder = await SyncOrderModel.findOne({
        tenantId: auth.tenantId,
        $or: [
          ...(isObjectIdCheck ? [{ _id: orderId }] : []),
          { externalOrderId: orderId },
        ],
      }).lean<{ status: string; locationId?: string; orderMode?: string; orderNumber?: string }>()

      const previousStatus = currentOrder?.status

      const updated = await updateOrderStatus(orderId, auth.tenantId, status)
      if (!updated) {
        console.warn(`[orders/status] ORDER NOT FOUND: orderId=${orderId}, tenantId=${auth.tenantId}`)
        res.status(404).json({ error: "Order not found" })
        return
      }

      const isObjectId = mongoose.Types.ObjectId.isValid(orderId)
      const syncOrder = await SyncOrderModel.findOne({
        tenantId: auth.tenantId,
        $or: [
          ...(isObjectId ? [{ _id: orderId }] : []),
          { externalOrderId: orderId },
        ],
      }).lean()

      const statusEvent = {
        orderId,
        tenantId: auth.tenantId,
        locationId: syncOrder?.locationId,
        externalStatus: status,
        timestamp: new Date().toISOString(),
      }
      io.to(`tenant:${auth.tenantId}`).emit("order:status_updated", statusEvent)
      if (syncOrder?.locationId) {
        io.to(`tenant:${auth.tenantId}:location:${syncOrder.locationId}`).emit("order:status_updated", statusEvent)
      }

      // ── Compliance: cancel old jobs, schedule new ones ────────────────
      if (previousStatus && previousStatus !== status) {
        cancelComplianceJobs(complianceQueue, orderId, previousStatus).catch(
          (err) => console.error("[orders] compliance cancel error (non-blocking):", err)
        )
        const syncAny = syncOrder as any
        dispatchCompliance(
          auth.tenantId,
          syncOrder?.locationId,
          orderId,
          syncAny?.orderNumber ?? orderId.slice(-6),
          status,
          NEXT_STATUS[status] ?? status,
          syncAny?.orderMode ?? "takeaway"
        ).catch((err) => console.error("[orders] compliance dispatch error (non-blocking):", err))
      }

      // Forward to SaaS via outbox
      console.log(`[orders/status] syncOrder found=${!!syncOrder}, externalOrderId=${syncOrder?.externalOrderId ?? "UNDEFINED"}`)
      if (syncOrder?.externalOrderId) {
        await enqueueConfirmForward(confirmForwardQueue, {
          tenantId: auth.tenantId,
          orderId,
          externalOrderId: syncOrder.externalOrderId,
          status,
        })
        console.log(`[orders/status] enqueueConfirmForward CALLED for ${orderId}`)
      } else {
        console.warn(`[orders/status] SKIPPED enqueueConfirmForward — syncOrder=${!!syncOrder}, externalOrderId=${syncOrder?.externalOrderId ?? "UNDEFINED"}`)
      }

      res.json({ status })
    } catch (err) {
      console.error("[orders] status update error:", err)
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

      const isObjectId = mongoose.Types.ObjectId.isValid(orderId)
      const syncOrder = await SyncOrderModel.findOne({
        tenantId: auth.tenantId,
        $or: [
          ...(isObjectId ? [{ _id: orderId }] : []),
          { externalOrderId: orderId },
        ],
      }).lean()

      const confirmedEvent = {
        orderId,
        tenantId: auth.tenantId,
        locationId: syncOrder?.locationId,
        timestamp: new Date().toISOString(),
      }
      io.to(`tenant:${auth.tenantId}`).emit("order:confirmed", confirmedEvent)
      if (syncOrder?.locationId) {
        io.to(`tenant:${auth.tenantId}:location:${syncOrder.locationId}`).emit("order:confirmed", confirmedEvent)
      }

      // Also emit order:status_updated for POS UI
      const statusEvent = {
        orderId,
        tenantId: auth.tenantId,
        locationId: syncOrder?.locationId,
        externalStatus: "confirmed",
        timestamp: new Date().toISOString(),
      }
      io.to(`tenant:${auth.tenantId}`).emit("order:status_updated", statusEvent)
      if (syncOrder?.locationId) {
        io.to(`tenant:${auth.tenantId}:location:${syncOrder.locationId}`).emit("order:status_updated", statusEvent)
      }

      // Forward confirm to SaaS via outbox (BullMQ retry)
      if (syncOrder?.externalOrderId) {
        await enqueueConfirmForward(confirmForwardQueue, {
          tenantId: auth.tenantId,
          orderId,
          externalOrderId: syncOrder.externalOrderId,
        })
      }

      // ── Compliance: cancel pending→confirmed jobs, schedule confirmed→preparing
      cancelComplianceJobs(complianceQueue, orderId, "pending").catch(
        (err) => console.error("[orders/confirm] compliance cancel error (non-blocking):", err)
      )
      const confirmSyncAny = syncOrder as any
      dispatchCompliance(
        auth.tenantId,
        syncOrder?.locationId,
        orderId,
        confirmSyncAny?.orderNumber ?? orderId.slice(-6),
        "confirmed",
        "preparing",
        confirmSyncAny?.orderMode ?? "takeaway"
      ).catch((err) => console.error("[orders/confirm] compliance dispatch error (non-blocking):", err))

      res.json({ status: "confirmed" })
    } catch (err) {
      console.error("[orders] confirm error:", err)
      res.status(500).json({ error: "Internal server error" })
    }
  })

  return router
}
