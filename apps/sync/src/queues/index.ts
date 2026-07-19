import { Queue as BullQueue } from "bullmq"
import Redis from "ioredis"
import type { CashSaleJobData } from "./cash-sale-queue"

export interface QueueServer {
  orderQueue: BullQueue
  cashSaleQueue: BullQueue<CashSaleJobData>
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

  const cashSaleConnection = new Redis(redisUrl, { maxRetriesPerRequest: null })
  cashSaleConnection.on("error", (err) => console.error("[queue/cash-sale/redis] error:", err.message))

  const cashSaleQueue = new BullQueue<CashSaleJobData>("cash_sale", {
    connection: cashSaleConnection as any,
    defaultJobOptions: {
      attempts: 10,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
      removeOnComplete: 200,
      removeOnFail: 100,
    },
  })

  return { orderQueue, cashSaleQueue }
}
