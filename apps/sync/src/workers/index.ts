import { Worker } from "bullmq"
import Redis from "ioredis"
import mongoose from "mongoose"
import type { Server as SocketServer } from "socket.io"
import { QUEUE_ORDER_CREATED } from "../queues/order-queue"
import { CashSaleEventModel } from "@takeasygo/db"
import { config } from "../config"

async function getSaaSslug(tenantId: string): Promise<string | null> {
  try {
    const db = mongoose.connection.db!
    const tenant = await db.collection("tenants").findOne({ _id: new mongoose.Types.ObjectId(tenantId) })
    return tenant?.slug ?? null
  } catch {
    return null
  }
}

export function registerWorkers(redisUrl: string, io: SocketServer): void {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null }) as any;
  connection.on("error", (err: Error) => console.error("[worker/redis] error:", err.message));

  // ── Order timeout worker ──────────────────────────────────────────
  new Worker(
    "orders",
    async (job) => {
      const { tenantId, orderId, eventId } = job.data

      switch (job.name) {
        case QUEUE_ORDER_CREATED: {
          console.log(`[worker] order timeout expired: ${orderId} (${tenantId})`)

          io.to(`tenant:${tenantId}`).emit("order:cancelled", {
            orderId,
            reason: "offline_timeout",
            eventId,
            timestamp: new Date().toISOString(),
          })

          return { status: "timeout", orderId }
        }
        default:
          return { status: "unknown_job" }
      }
    },
    {
      connection,
      concurrency: 5,
    }
  )

  // ── Cash sale delivery worker ─────────────────────────────────────
  const cashSaleConnection = new Redis(redisUrl, { maxRetriesPerRequest: null }) as any
  cashSaleConnection.on("error", (err: Error) => console.error("[worker/cash-sale/redis] error:", err.message))

  const cashSaleWorker = new Worker(
    "cash_sale",
    async (job) => {
      const { eventId, tenantId, orderId } = job.data

      const event = await CashSaleEventModel.findById(eventId)
      if (!event) {
        console.warn(`[worker/cash-sale] event not found: ${eventId}`)
        return { status: "not_found" }
      }

      if (event.status === "delivered") {
        return { status: "already_delivered" }
      }

      // Reintentar emit al POS — incluir eventId para ACK
      io.to(`tenant:${tenantId}`).emit("cash_sale", {
        eventId: event._id.toString(),
        orderId: event.orderId,
        tenantId: event.tenantId,
        amount: event.amount,
        paymentMethod: event.paymentMethod,
        orderMode: event.orderMode,
        timestamp: event.timestamp.toISOString(),
        source: "sync_layer",
      })

      // Actualizar estado
      const updated = await CashSaleEventModel.findByIdAndUpdate(
        eventId,
        {
          $inc: { attempts: 1 },
          $set: { lastAttemptAt: new Date() },
        },
        { new: true }
      )

      console.log(
        `[worker/cash-sale] retry #${updated?.attempts} for ${orderId} (${tenantId})`
      )

      return { status: "retried", attempts: updated?.attempts }
    },
    {
      connection: cashSaleConnection,
      concurrency: 5,
    }
  )

  // Cuando BullMQ agota reintentos → marcar como failed en MongoDB
  cashSaleWorker.on("failed", async (job, err) => {
    if (!job) return
    const { eventId, orderId, tenantId } = job.data
    console.error(
      `[worker/cash-sale] exhausted retries for ${orderId} (${tenantId}):`,
      err.message
    )
    await CashSaleEventModel.findByIdAndUpdate(eventId, {
      status: "failed",
      lastError: err.message,
    })
  })

  // ── Confirm forward worker — SyncLayer → SaaS ────────────────────
  const confirmForwardConnection = new Redis(redisUrl, { maxRetriesPerRequest: null }) as any
  confirmForwardConnection.on("error", (err: Error) => console.error("[worker/confirm-forward/redis] error:", err.message))

  const confirmForwardWorker = new Worker(
    "order_confirm_forward",
    async (job) => {
      const { tenantId, orderId, externalOrderId, status } = job.data

      console.log(`[worker/confirm-forward] JOB RECEIVED: orderId=${orderId}, status=${status}, externalOrderId=${externalOrderId}, tenantId=${tenantId}`)

      const saasTenantSlug = await getSaaSslug(tenantId)
      if (!saasTenantSlug) {
        console.error(`[worker/confirm-forward] tenant slug not found for ${tenantId}`)
        return { status: "tenant_not_found" }
      }

      // Route to the correct SaaS endpoint based on status:
      // - confirmed → /confirm-internal (payment confirmation flow)
      // - preparing/ready/delivered/cancelled → /status (status update flow)
      const isStatusUpdate = status && status !== "confirmed"
      const endpoint = isStatusUpdate
        ? `${config.saasBaseUrl}/api/${saasTenantSlug}/orders/${externalOrderId}/status`
        : `${config.saasBaseUrl}/api/${saasTenantSlug}/orders/${externalOrderId}/confirm-internal`

      const body = isStatusUpdate
        ? JSON.stringify({ status })
        : JSON.stringify({ tenantId })

      console.log(`[worker/confirm-forward] forwarding ${isStatusUpdate ? `status→${status}` : "confirm"} for order ${orderId} (external: ${externalOrderId}, tenant: ${tenantId})`)
      console.log(`[worker/confirm-forward] token length=${config.internalApiSecret.length}, first4="${config.internalApiSecret.slice(0, 4)}"`)

      const res = await fetch(endpoint, {
        method: isStatusUpdate ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.internalApiSecret}`,
        },
        body,
      })

      if (!res.ok) {
        const text = await res.text().catch(() => "unknown")
        throw new Error(`SaaS forward failed (${res.status}): ${text}`)
      }

      console.log(`[worker/confirm-forward] successfully forwarded ${isStatusUpdate ? `status→${status}` : "confirm"} for ${orderId}`)
      return { status: "forwarded", orderId }
    },
    {
      connection: confirmForwardConnection,
      concurrency: 5,
    }
  )

  confirmForwardWorker.on("failed", async (job, err) => {
    if (!job) return
    const { orderId, tenantId } = job.data
    console.error(
      `[worker/confirm-forward] exhausted retries for ${orderId} (${tenantId}):`,
      err.message
    )
  })

  console.log("[worker] BullMQ workers registered")
}
