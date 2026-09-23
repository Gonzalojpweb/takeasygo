import { Queue as BullQueue } from "bullmq"

export const QUEUE_COMPLIANCE = "compliance"

export interface ComplianceJobData {
  tenantId: string
  locationId: string
  orderId: string
  orderNumber: string
  fromStatus: string
  toStatus: string
  orderMode: string
  /** Minutos de delay para este nivel (calculado al encolar) */
  delayMinutes: number
  level: 1 | 2 | 3
}

/**
 * Encola jobs delayed para los 3 niveles de compliance de una transición.
 * El job ID incluye orderId + fromStatus para poder cancelarlos si la orden avanza.
 */
export async function enqueueComplianceChecks(
  queue: BullQueue<ComplianceJobData>,
  data: Omit<ComplianceJobData, "delayMinutes" | "level"> & {
    level1Minutes: number
    level2Minutes: number
    level3Minutes: number
  }
): Promise<void> {
  const { level1Minutes, level2Minutes, level3Minutes, ...baseData } = data
  const jobIdBase = `compliance:${data.orderId}:${data.fromStatus}`

  const levels: Array<{ level: 1 | 2 | 3; delayMinutes: number }> = [
    { level: 1, delayMinutes: level1Minutes },
    { level: 2, delayMinutes: level2Minutes },
    { level: 3, delayMinutes: level3Minutes },
  ]

  for (const { level, delayMinutes } of levels) {
    await queue.add(
      `compliance:L${level}`,
      { ...baseData, level, delayMinutes },
      {
        jobId: `${jobIdBase}:L${level}`,
        delay: delayMinutes * 60 * 1000,
        removeOnComplete: 50,
        removeOnFail: 20,
      }
    )
  }
}

/**
 * Cancela todos los jobs de compliance pendientes para una orden en un estado dado.
 * Se llama cuando la orden avanza de estado (el SLA de la transición anterior ya no aplica).
 */
export async function cancelComplianceJobs(
  queue: BullQueue<ComplianceJobData>,
  orderId: string,
  fromStatus: string
): Promise<void> {
  const jobIdBase = `compliance:${orderId}:${fromStatus}`
  for (const level of ["L1", "L2", "L3"]) {
    const job = await queue.getJob(`${jobIdBase}:${level}`)
    if (job && (await job.isWaiting())) {
      await job.remove()
    }
  }
}
