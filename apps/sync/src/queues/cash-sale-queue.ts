import { Queue as BullQueue } from "bullmq"

export const QUEUE_CASH_SALE = "cash_sale.deliver"

export interface CashSaleJobData {
  eventId: string
  tenantId: string
  orderId: string
}

export async function enqueueCashSaleDelivery(
  queue: BullQueue<CashSaleJobData>,
  data: CashSaleJobData
): Promise<void> {
  await queue.add(QUEUE_CASH_SALE, data, {
    jobId: `cash_sale:${data.eventId}`,
    delay: 5000,
  })
}
