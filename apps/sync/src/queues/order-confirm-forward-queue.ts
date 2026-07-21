import { Queue as BullQueue } from "bullmq"

export const QUEUE_CONFIRM_FORWARD = "order.confirm.forward"

export interface ConfirmForwardJobData {
  tenantId: string
  orderId: string
  externalOrderId: string
}

export async function enqueueConfirmForward(
  queue: BullQueue<ConfirmForwardJobData>,
  data: ConfirmForwardJobData
): Promise<void> {
  await queue.add(QUEUE_CONFIRM_FORWARD, data, {
    jobId: `confirm_forward:${data.orderId}`,
    delay: 2000,
  })
}
