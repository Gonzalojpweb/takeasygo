import { describe, it, expect, vi } from "vitest"
import {
  enqueueOrderCreated,
  removePendingOrder,
  voidsOfflineTimeout,
  type OrderJobData,
} from "../src/queues/order-queue"

function fakeJob(state: string) {
  return {
    getState: vi.fn(async () => state),
    remove: vi.fn(async () => undefined),
  }
}

function fakeQueue(job: unknown) {
  return {
    getJob: vi.fn(async () => job),
  }
}

const JOB: OrderJobData = {
  eventId: "syncid0001",
  tenantId: "tenant1",
  orderId: "syncid0001",
  timestamp: new Date().toISOString(),
  offlineTimeoutMs: 600_000,
}

describe("enqueueOrderCreated", () => {
  it("usa el eventId como jobId y aplica el delay del timeout", async () => {
    const add = vi.fn(async () => undefined)
    await enqueueOrderCreated({ add } as never, JOB)

    expect(add).toHaveBeenCalledWith(
      "order.created",
      expect.objectContaining({ eventId: "syncid0001", orderId: "syncid0001" }),
      { jobId: "syncid0001", delay: 600_000 }
    )
  })
})

describe("removePendingOrder", () => {
  it("remueve jobs con delay (estado delayed) — el bug que dejaba vivo el timeout", async () => {
    const job = fakeJob("delayed")
    const queue = fakeQueue(job)

    await removePendingOrder(queue as never, "syncid0001")

    expect(queue.getJob).toHaveBeenCalledWith("syncid0001")
    expect(job.remove).toHaveBeenCalledTimes(1)
  })

  it.each(["waiting", "paused", "prioritized"])(
    "remueve jobs en estado %s",
    async (state) => {
      const job = fakeJob(state)
      await removePendingOrder(fakeQueue(job) as never, "syncid0001")
      expect(job.remove).toHaveBeenCalledTimes(1)
    }
  )

  it.each(["active", "completed", "failed"])(
    "NO remueve jobs en estado %s",
    async (state) => {
      const job = fakeJob(state)
      await removePendingOrder(fakeQueue(job) as never, "syncid0001")
      expect(job.remove).not.toHaveBeenCalled()
    }
  )

  it("no truena si el job ya no existe", async () => {
    await expect(removePendingOrder(fakeQueue(null) as never, "x")).resolves.toBeUndefined()
  })

  it("si getJob lanza, no propaga la excepción", async () => {
    const queue = { getJob: vi.fn(async () => { throw new Error("redis down") }) }
    await expect(removePendingOrder(queue as never, "x")).resolves.toBeUndefined()
  })
})

describe("voidsOfflineTimeout", () => {
  it("estados en espera NO invalidan el timeout", () => {
    expect(voidsOfflineTimeout("pending")).toBe(false)
    expect(voidsOfflineTimeout("awaiting_payment")).toBe(false)
    expect(voidsOfflineTimeout("awaiting_confirmation")).toBe(false)
  })

  it("estados que avanzan el ciclo SÍ invalidan el timeout", () => {
    for (const status of [
      "confirmed",
      "preparing",
      "ready",
      "en_ruta",
      "arrived",
      "delivered",
      "cancelled",
    ]) {
      expect(voidsOfflineTimeout(status)).toBe(true)
    }
  })
})
