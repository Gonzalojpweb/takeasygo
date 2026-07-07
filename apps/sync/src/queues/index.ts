import { Queue as BullQueue } from "bullmq"
import Redis from "ioredis"

export interface QueueServer {
  orderQueue: BullQueue
}

export function createQueueServer(redisUrl: string): QueueServer {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null })
  connection.on("error", (err) => console.error("[queue/redis] error:", err.message))

  const orderQueue = new BullQueue("orders", {
    connection: connection as any,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  })

  return { orderQueue }
}
