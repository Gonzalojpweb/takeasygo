import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * POS offline V2 — etapa 6 (12/11/2026): centro de sincronización.
 * Una operación con conflicto frena a las que dependen de ella. Se puede
 * reintentar o descartar (con las dependientes); descartar pasa por el server
 * (PIN del encargado + auditoría) y borra la copia local que el server no
 * tiene. Una con factura CAEA entregada no se descarta.
 */

const posApiMock = vi.hoisted(() => vi.fn())
const pollMock = vi.hoisted(() => vi.fn(async () => ({})))
const orders = vi.hoisted(() => new Map<string, unknown>())

vi.mock("../db/dexie", () => ({
  db: {
    orders: {
      get: async (id: string) => orders.get(id),
      delete: async (id: string) => { orders.delete(id) },
    },
  },
}))
vi.mock("../services/polling", () => ({ pollNow: pollMock }))
vi.mock("../services/pos-api", async () => {
  class PosApiError extends Error {
    code: string
    status: number
    constructor(message: string, code: string, status: number) { super(message); this.code = code; this.status = status }
  }
  return { PosApiError, isPosApiError: (e: unknown) => e instanceof PosApiError, posApi: (...a: unknown[]) => posApiMock(...a) }
})

import { PosApiError } from "../services/pos-api"
import { createMemoryOfflineStore, setOfflineStore, offlineStore } from "../services/offline/store"
import { getOfflineStatus, setOfflineStatus, __resetOfflineStatusForTests } from "../services/offline/status"
import { refreshOfflineCounts } from "../services/offline/replay"
import { dependentsOf, discardOps, listSyncOps, retryConflicts } from "../services/offline/sync-center"
import type { OfflineOp } from "../services/offline/types"

const T = "64b000000000000000000001"
let seq = 0
function op(id: string, label: string, entityKeys: string[], extra: Partial<OfflineOp> = {}): OfflineOp {
  seq++
  return {
    id, tenantId: T, seq, kind: "order.write", label, method: "POST", path: `/x/${id}`, entityKeys,
    occurredAt: new Date(2026, 10, 12, 20, seq).toISOString(), status: "pending", attempts: 0, lastError: null, createdAt: new Date().toISOString(),
    ...extra,
  }
}

beforeEach(async () => {
  seq = 0
  __resetOfflineStatusForTests()
  setOfflineStore(createMemoryOfflineStore())
  orders.clear()
  posApiMock.mockReset()
  pollMock.mockClear()
  const store = offlineStore()
  // Mesa 5: la ronda tuvo conflicto; el cobro y la entrega dependen de ella.
  await store.addOp(op("op-ronda-0001", "Mesa 5 · ronda a cocina", ["order:o1", "table:t5"], { status: "conflict", attempts: 1, lastError: { code: "conflict", message: "La mesa ya tiene otra orden", status: 409 } }))
  await store.addOp(op("op-cobro-0002", "Mesa 5 · cobro $18.000", ["order:o1"]))
  await store.addOp(op("op-caja-00003", "Caja · Pedido M5", ["register:r1", "order:o1"]))
  await store.addOp(op("op-otra-00004", "Mesa 8 · ronda a cocina", ["order:o2", "table:t8"]))
  await store.addOp(op("op-caja2-0005", "Caja · Retiro", ["register:r1"]))
  await refreshOfflineCounts(T)
  orders.set("o1", { id: "o1", pendingSync: true })
  orders.set("o2", { id: "o2", pendingSync: true })
})

describe("qué frena a qué", () => {
  it("las que comparten orden, mesa o caja con el conflicto esperan; las demás no", async () => {
    const view = await listSyncOps(T)
    const by = Object.fromEntries(view.map((v) => [v.id, v.blockedBy?.id ?? null]))
    expect(by).toEqual({
      "op-ronda-0001": null,
      "op-cobro-0002": "op-ronda-0001",
      "op-caja-00003": "op-ronda-0001",
      "op-otra-00004": null,
      // El retiro comparte la caja con un movimiento frenado: también espera.
      "op-caja2-0005": "op-ronda-0001",
    })
  })

  it("dependientes en cadena", async () => {
    const ops = await offlineStore().listOps(T)
    expect(dependentsOf(ops, "op-ronda-0001").map((o) => o.id)).toEqual(["op-cobro-0002", "op-caja-00003", "op-caja2-0005"])
    expect(dependentsOf(ops, "op-otra-00004")).toEqual([])
  })
})

describe("resolver", () => {
  it("reintentar la vuelve a la cola y se manda en orden", async () => {
    posApiMock.mockResolvedValue({})
    const r = await retryConflicts(T, "op-ronda-0001")
    expect(r).toMatchObject({ sent: 5, conflicts: 0 })
    expect(posApiMock.mock.calls.map((c) => c[1])).toEqual(["/x/op-ronda-0001", "/x/op-cobro-0002", "/x/op-caja-00003", "/x/op-otra-00004", "/x/op-caja2-0005"])
    expect(getOfflineStatus()).toMatchObject({ pending: 0, conflicts: 0 })
  })

  it("descartar con dependientes: aprueba el server, se borra la copia local y se vuelve a leer", async () => {
    posApiMock.mockImplementation(async (_t: string, path: string) => (path === "/offline/discards" ? { discarded: 4, approverName: "Encargada" } : {}))
    const r = await discardOps(T, "op-ronda-0001", { withDependents: true, reason: "La cobró otra caja" })
    expect(r).toEqual({ discarded: 4, approverName: "Encargada" })

    const [, path, request] = posApiMock.mock.calls[0]
    expect(path).toBe("/offline/discards")
    expect(request.body.reason).toBe("La cobró otra caja")
    expect(request.body.ops.map((o: { opId: string }) => o.opId)).toEqual(["op-ronda-0001", "op-cobro-0002", "op-caja-00003", "op-caja2-0005"])
    expect(request.body.ops[0].error).toBe("conflict: La mesa ya tiene otra orden")

    // La de la mesa 8 no dependía: se mandó.
    expect(posApiMock.mock.calls.map((c) => c[1])).toContain("/x/op-otra-00004")
    expect(await offlineStore().listOps(T)).toHaveLength(0)
    expect(orders.has("o1")).toBe(false)
    expect(getOfflineStatus()).toMatchObject({ pending: 0, conflicts: 0 })
    expect(pollMock).toHaveBeenCalled()
  })

  it("sin el PIN del encargado no se descarta nada", async () => {
    posApiMock.mockRejectedValue(new PosApiError("Operación cancelada: falta la aprobación del encargado", "approval_cancelled", 403))
    await expect(discardOps(T, "op-ronda-0001", { withDependents: true })).rejects.toThrow(/aprobación/)
    expect(await offlineStore().listOps(T)).toHaveLength(5)
    expect(orders.has("o1")).toBe(true)
  })

  it("sin conexión no se descarta", async () => {
    setOfflineStatus({ online: false })
    await expect(discardOps(T, "op-ronda-0001", { withDependents: false })).rejects.toThrow(/hace falta conexión/)
    expect(posApiMock).not.toHaveBeenCalled()
  })

  it("una operación con factura CAEA entregada no se descarta", async () => {
    await offlineStore().updateOp("op-cobro-0002", { body: { invoice: { receiver: {}, offlineCaea: { number: 6 } } } })
    await expect(discardOps(T, "op-ronda-0001", { withDependents: true })).rejects.toThrow(/factura CAEA ya entregada/)
    expect((await listSyncOps(T)).find((o) => o.id === "op-cobro-0002")!.hasCaeaInvoice).toBe(true)
    expect(posApiMock).not.toHaveBeenCalled()
  })
})

describe("el reenvío respeta las esperas", () => {
  it("con el conflicto sin resolver, solo sale lo que no depende de él", async () => {
    posApiMock.mockResolvedValue({})
    const { replayOfflineOps } = await import("../services/offline/replay")
    const r = await replayOfflineOps(T)
    expect(posApiMock.mock.calls.map((c) => c[1])).toEqual(["/x/op-otra-00004"])
    expect(r).toMatchObject({ sent: 1 })
  })
})
