import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * POS offline V2 — etapa 1 (12/11/2026): ejecutor y reenvío de la cola.
 *
 * Contrato:
 *   1. Con red, server-first como siempre; el opId viaja también online.
 *   2. Sin red y equipo habilitado: se aplica local y se encola con ESE opId.
 *   3. Sin red y equipo no habilitado: error claro, nada encolado.
 *   4. Un rechazo del server (no de red) se propaga igual que hoy.
 *   5. Con cola pendiente, lo nuevo también se encola (no se desordena).
 *   6. Reenvío: éxito sale de la cola; corte de red frena; un 4xx queda «con
 *      conflicto» y frena solo lo que depende de esa entidad.
 */

const posApiMock = vi.hoisted(() => vi.fn())

vi.mock("../db/dexie", () => ({ db: {} }))
vi.mock("../services/pos-api", async () => {
  class PosApiError extends Error {
    code: string
    status: number
    constructor(message: string, code: string, status: number) {
      super(message)
      this.code = code
      this.status = status
    }
  }
  return {
    PosApiError,
    isPosApiError: (e: unknown) => e instanceof PosApiError,
    posApi: (...args: unknown[]) => posApiMock(...args),
  }
})

import { PosApiError } from "../services/pos-api"
import { createMemoryOfflineStore, setOfflineStore, offlineStore } from "../services/offline/store"
import { offlineAware, OFFLINE_NOT_ENABLED_MESSAGE } from "../services/offline/executor"
import { replayOfflineOps } from "../services/offline/replay"
import { registerOfflineOpKind, __clearOfflineOpKinds } from "../services/offline/registry"
import { isOfflineEnabled } from "../services/offline/device"
import { getOfflineStatus, setOfflineStatus, __resetOfflineStatusForTests } from "../services/offline/status"
import type { OfflineOp } from "../services/offline/types"

const T = "64b000000000000000000001"
const netErr = () => new PosApiError("Failed to fetch", "network", 0)

async function enableDevice(checkedAt = new Date().toISOString()) {
  await offlineStore().setMeta(`eligibility:${T}`, { enabled: true, role: "primary", name: "Caja", limit: 1, checkedAt })
}

function params(over: Partial<Parameters<typeof offlineAware<string>>[0]> = {}) {
  return {
    tenantId: T,
    kind: "test.op",
    label: "Mesa 5 · nueva ronda",
    request: { method: "POST" as const, path: "/orders", body: { id: "o1" } },
    entityKeys: ["order:o1", "table:t5"],
    online: vi.fn(async () => "online"),
    applyLocal: vi.fn(async () => "local"),
    ...over,
  }
}

beforeEach(() => {
  __resetOfflineStatusForTests()
  __clearOfflineOpKinds()
  setOfflineStore(createMemoryOfflineStore())
  posApiMock.mockReset()
})

describe("ejecutor offline", () => {
  it("con red va al server y manda el opId; no encola nada", async () => {
    const p = params()
    expect(await offlineAware(p)).toBe("online")
    expect(p.online).toHaveBeenCalledWith(expect.objectContaining({ "X-Pos-Op-Id": expect.any(String), "X-Pos-Occurred-At": expect.any(String) }))
    expect(p.applyLocal).not.toHaveBeenCalled()
    expect(await offlineStore().listOps(T)).toHaveLength(0)
  })

  it("sin red y habilitado: aplica local y encola con el MISMO opId del intento online", async () => {
    await enableDevice()
    let sentOpId = ""
    const p = params({ online: vi.fn(async (h: Record<string, string>) => { sentOpId = h["X-Pos-Op-Id"]; throw netErr() }) })
    expect(await offlineAware(p)).toBe("local")
    const ops = await offlineStore().listOps(T)
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ id: sentOpId, kind: "test.op", status: "pending", path: "/orders", entityKeys: ["order:o1", "table:t5"] })
    expect(getOfflineStatus()).toMatchObject({ online: false, pending: 1 })
  })

  it("sin red y NO habilitado: error claro y nada encolado", async () => {
    const p = params({ online: vi.fn(async () => { throw netErr() }) })
    await expect(offlineAware(p)).rejects.toThrow(OFFLINE_NOT_ENABLED_MESSAGE)
    expect(p.applyLocal).not.toHaveBeenCalled()
    expect(await offlineStore().listOps(T)).toHaveLength(0)
  })

  it("un rechazo del server (409) se propaga como hoy", async () => {
    await enableDevice()
    const p = params({ online: vi.fn(async () => { throw new PosApiError("Mesa ocupada", "conflict", 409) }) })
    await expect(offlineAware(p)).rejects.toThrow("Mesa ocupada")
    expect(await offlineStore().listOps(T)).toHaveLength(0)
  })

  it("ya sin conexión no intenta el server; con cola pendiente, lo nuevo también se encola", async () => {
    await enableDevice()
    setOfflineStatus({ online: false })
    const p1 = params()
    await offlineAware(p1)
    expect(p1.online).not.toHaveBeenCalled()

    // Volvió la red pero la cola tiene algo: la segunda no se adelanta.
    setOfflineStatus({ online: true })
    posApiMock.mockRejectedValue(netErr()) // el reenvío automático no llega
    const p2 = params({ request: { method: "PATCH", path: "/tables/t5", body: { status: "free" } } })
    await offlineAware(p2)
    expect(p2.online).not.toHaveBeenCalled()
    const ops = await offlineStore().listOps(T)
    expect(ops.map((o) => o.path)).toEqual(["/orders", "/tables/t5"])
    expect(ops[0].seq).toBeLessThan(ops[1].seq)
  })

  it("la habilitación guardada vale 7 días sin red", async () => {
    await enableDevice(new Date(Date.now() - 6 * 86_400_000).toISOString())
    expect(await isOfflineEnabled(T)).toBe(true)
    await enableDevice(new Date(Date.now() - 8 * 86_400_000).toISOString())
    expect(await isOfflineEnabled(T)).toBe(false)
  })
})

function op(id: string, seq: number, entityKeys: string[], kind = "test.op"): OfflineOp {
  return {
    id, tenantId: T, seq, kind, label: id, method: "POST", path: `/x/${id}`, entityKeys,
    occurredAt: new Date().toISOString(), status: "pending", attempts: 0, lastError: null, createdAt: new Date().toISOString(),
  }
}

describe("reenvío de la cola", () => {
  it("en orden; guarda la respuesta del server y vacía la cola", async () => {
    const saved: string[] = []
    registerOfflineOpKind("test.op", { onSuccess: async (res) => { saved.push(String(res)) } })
    for (const o of [op("a", 1, ["order:1"]), op("b", 2, ["order:2"])]) await offlineStore().addOp(o)
    const send = vi.fn(async (o: OfflineOp) => `ok-${o.id}`)
    const r = await replayOfflineOps(T, send)
    expect(r).toEqual({ sent: 2, conflicts: 0, retryLater: false })
    expect(send.mock.calls.map((c) => c[0].id)).toEqual(["a", "b"])
    expect(saved).toEqual(["ok-a", "ok-b"])
    expect(await offlineStore().listOps(T)).toHaveLength(0)
    expect(getOfflineStatus().lastSyncAt).not.toBeNull()
  })

  it("se corta la red: frena y conserva el resto para después", async () => {
    for (const o of [op("a", 1, ["order:1"]), op("b", 2, ["order:2"])]) await offlineStore().addOp(o)
    const send = vi.fn(async () => { throw netErr() })
    const r = await replayOfflineOps(T, send)
    expect(r.retryLater).toBe(true)
    expect(send).toHaveBeenCalledTimes(1)
    const ops = await offlineStore().listOps(T)
    expect(ops).toHaveLength(2)
    expect(ops[0]).toMatchObject({ status: "pending", attempts: 1 })
    expect(getOfflineStatus().online).toBe(false)
  })

  it("un 4xx queda con conflicto y frena SOLO lo que depende de esa entidad", async () => {
    for (const o of [op("crear", 1, ["order:1", "table:5"]), op("cobrar", 2, ["order:1"]), op("otra", 3, ["order:2"])]) await offlineStore().addOp(o)
    const send = vi.fn(async (o: OfflineOp) => {
      if (o.id === "crear") throw new PosApiError("La mesa ya está ocupada", "conflict", 409)
      return "ok"
    })
    const r = await replayOfflineOps(T, send)
    expect(r).toMatchObject({ sent: 1, conflicts: 1 })
    expect(send.mock.calls.map((c) => c[0].id)).toEqual(["crear", "otra"])
    const ops = await offlineStore().listOps(T)
    expect(ops.find((o) => o.id === "crear")).toMatchObject({ status: "conflict", lastError: { code: "conflict", status: 409 } })
    expect(ops.find((o) => o.id === "cobrar")?.status).toBe("pending")
    expect(getOfflineStatus()).toMatchObject({ pending: 1, conflicts: 1 })
  })

  it("«ya estaba hecho» (tolerate) cuenta como enviado", async () => {
    registerOfflineOpKind("order.status", { tolerate: (e) => e.code === "transition_invalid" })
    await offlineStore().addOp(op("cocina", 1, ["order:1"], "order.status"))
    const r = await replayOfflineOps(T, async () => { throw new PosApiError("Transición no permitida", "transition_invalid", 409) })
    expect(r).toMatchObject({ sent: 1, conflicts: 0 })
    expect(await offlineStore().listOps(T)).toHaveLength(0)
  })

  it("«se está aplicando» o un 5xx no es conflicto: se reintenta", async () => {
    await offlineStore().addOp(op("a", 1, ["order:1"]))
    const r = await replayOfflineOps(T, async () => { throw new PosApiError("La operación se está aplicando; reintentá en unos segundos", "conflict", 409) })
    expect(r.retryLater).toBe(true)
    expect((await offlineStore().listOps(T))[0].status).toBe("pending")
  })
})
