import { Queue as BullQueue } from "bullmq"
import { config } from "../config"

export const QUEUE_ORDER_CREATED = "order.created"

export interface OrderJobData {
  eventId: string
  tenantId: string
  orderId: string
  timestamp: string
  offlineTimeoutMs: number
}

export async function enqueueOrderCreated(
  orderQueue: BullQueue<OrderJobData>,
  data: OrderJobData
): Promise<void> {
  await orderQueue.add(QUEUE_ORDER_CREATED, data, {
    jobId: data.eventId,
    delay: data.offlineTimeoutMs ?? config.offlineTimeoutMs,
  })
}

export async function removePendingOrder(
  orderQueue: BullQueue<OrderJobData>,
  eventId: string
): Promise<void> {
  const job = await orderQueue.getJob(eventId)
  if (job && (await job.isWaiting())) {
    await job.remove()
  }
}
