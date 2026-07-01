import { Worker } from "bullmq"
import Redis from "ioredis"
import type { Server as SocketServer } from "socket.io"
import { QUEUE_ORDER_CREATED } from "../queues/order-queue"

export function registerWorkers(redisUrl: string, io: SocketServer): void {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null }) as any

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

  console.log("[worker] BullMQ workers registered")
}
