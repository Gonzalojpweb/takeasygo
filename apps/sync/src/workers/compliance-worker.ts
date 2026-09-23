import { Worker } from "bullmq"
import Redis from "ioredis"
import type { Server as SocketServer } from "socket.io"
import { processComplianceJob, type ComplianceJobData } from "./compliance-processor"

/**
 * Compliance Worker — wrapper BullMQ del processor.
 * Toda la lógica de re-checks vive en compliance-processor.ts (testeable).
 */
export function registerComplianceWorker(
  redisUrl: string,
  io: SocketServer
): { worker: Worker; redisConnection: InstanceType<typeof Redis> } {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null }) as any
  connection.on("error", (err: Error) =>
    console.error("[worker/compliance/redis] error:", err.message)
  )

  const worker = new Worker(
    "compliance",
    async (job) => {
      const data = job.data as ComplianceJobData

      const result = await processComplianceJob(data, async (event) => {
        io.to(`tenant:${data.tenantId}`).emit("compliance:update", event)
        if (data.locationId) {
          io.to(`tenant:${data.tenantId}:location:${data.locationId}`).emit(
            "compliance:update",
            event
          )
        }
      })

      if (result.status === "alert_created") {
        console.log(
          `[compliance] ALERT L${data.level} for order ${data.orderNumber} (${result.elapsedMinutes}min in ${data.fromStatus}, expected ${data.toStatus})`
        )
      } else if (result.status === "escalated") {
        console.log(
          `[compliance] ESCALATED order ${data.orderNumber} to L${data.level} (${result.elapsedMinutes}min in ${data.fromStatus})`
        )
      }

      return result
    },
    {
      connection,
      concurrency: 10,
    }
  )

  worker.on("failed", (job, err) => {
    console.error(`[compliance] Job ${job?.id} failed:`, err.message)
  })

  return { worker, redisConnection: connection }
}
