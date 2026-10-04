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

const WAITING_STATUSES = new Set(["pending", "awaiting_payment", "awaiting_confirmation"])

/**
 * True si `status` invalida el timeout offline del pedido (cualquier estado
 * que demuestre que el pedido está vivo ya no debe cancelarse por timeout).
 */
export function voidsOfflineTimeout(status: string): boolean {
  return !WAITING_STATUSES.has(status)
}

export async function removePendingOrder(
  orderQueue: BullQueue<OrderJobData>,
  eventId: string
): Promise<void> {
  // Los jobs con delay viven en 'delayed', no en 'wait': isWaiting() solo
  // cubre las listas wait/paused, así que un pedido confirmado a los 2 min
  // nunca se removía y el timeout emitía order:cancelled sobre un pedido
  // que ya estaba operativo. Removemos también paused/delayed/prioritized;
  // active/completed/failed se dejan intactos.
  // Nunca lanza: un Redis caído no puede romper el PATCH de confirmación.
  try {
    const job = await orderQueue.getJob(eventId)
    if (!job) return
    // cast a string: los tipos de BullMQ omiten 'paused' aunque en runtime
    // un job de cola pausada reporta esa lista.
    const state = (await job.getState()) as string
    if (
      state === "waiting" ||
      state === "paused" ||
      state === "delayed" ||
      state === "prioritized"
    ) {
      await job.remove()
    }
  } catch (err) {
    console.warn(
      `[order-queue] removePendingOrder(${eventId}) skipped:`,
      err instanceof Error ? err.message : err
    )
  }
}
