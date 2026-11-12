import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { Product, Table } from "@takeasygo/types"

/**
 * POS offline V2 — etapa 4 (12/11/2026): impresión sin internet.
 *
 * Sin red, la ronda que va a cocina sale igual: el POS arma la comanda con el
 * renderer del server y se la manda al agente por la red local. Al volver la
 * red, la operación le dice al server en qué impresoras ya salió
 * (X-Pos-Printed) para que no la repita; las que fallaron las imprime el
 * server. El reenvío espera a que termine la impresión local.
 */

const posApiMock = vi.hoisted(() => vi.fn())
const stores = vi.hoisted(() => ({ tables: new Map<string, unknown>(), orders: new Map<string, unknown>(), menu: new Map<string, unknown>() }))

vi.mock("../db/dexie", () => {
  const clone = <T,>(v: T): T => structuredClone(v)
  const table = (store: Map<string, unknown>, key = "id") => ({
    get: async (id: string) => (store.has(id) ? clone(store.get(id)) : undefined),
    put: async (rec: Record<string, unknown>) => { store.set(rec[key] as string, clone(rec)); return rec[key] },
    update: async (id: string, changes: object) => { if (store.has(id)) store.set(id, { ...(store.get(id) as object), ...changes }) },
    where: () => ({ equals: () => ({ and: () => ({ first: async () => undefined, toArray: async () => [] }), toArray: async () => [] }) }),
  })
  return {
    db: {
      diningTable: table(stores.tables),
      orders: table(stores.orders),
      menuSnapshot: table(stores.menu, "tenantId"),
      cashRegister: table(new Map()),
      pendingMovements: table(new Map()),
      tenantConfig: { get: async () => undefined },
    },
  }
})

vi.mock("../services/pos-api", async () => {
  class PosApiError extends Error {
    code: string
    status: number
    constructor(message: string, code: string, status: number) { super(message); this.code = code; this.status = status }
  }
  return { PosApiError, isPosApiError: (e: unknown) => e instanceof PosApiError, posApi: (...a: unknown[]) => posApiMock(...a) }
})
vi.mock("../services/sync-api", () => ({ notifyStatusToSyncLayer: vi.fn(async () => {}) }))

import { PosApiError } from "../services/pos-api"
import { createMemoryOfflineStore, setOfflineStore, offlineStore } from "../services/offline/store"
import { replayOfflineOps } from "../services/offline/replay"
import { getOfflineStatus, setOfflineStatus, __resetOfflineStatusForTests } from "../services/offline/status"
import { cachePrinters, setPrintAgent, toPrintOrder, normalizeAgentUrl, offlineOrderNumber } from "../services/offline/local-print"
import { isLocalWorkPending } from "../services/offline/local-work"
import { createOrder, fireCourse } from "../services/order"
import "../services/offline/kinds"

const T = "64b000000000000000000001"
const netErr = () => new PosApiError("Failed to fetch", "network", 0)

const COCINA = "6a0000000000000000000001"
const BARRA = "6a0000000000000000000002"

const products: Partial<Product>[] = [
  { id: "p-pizza", name: "Pizza", category: "Pizzas", printRole: "kitchen" },
  { id: "p-birra", name: "Cerveza", category: "Bebidas", printRole: "bar" },
]
const pizza = { productId: "p-pizza", name: "Pizza", quantity: 1, unitPrice: 900_000, total: 900_000, course: "principal" as const }
const birra = { productId: "p-birra", name: "Cerveza", quantity: 2, unitPrice: 300_000, total: 600_000 }

type AgentCall = { url: string; init: RequestInit & { headers: Record<string, string> } }
let agentCalls: AgentCall[] = []
let agentReply: (jobs: { id: string; printerId: string }[]) => Promise<{ id: string; ok: boolean; error?: string }[]>

const decode = (b64: string) => Array.from(atob(b64), (c) => c).join("")

async function settle() {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0))
}

beforeEach(async () => {
  __resetOfflineStatusForTests()
  setOfflineStore(createMemoryOfflineStore())
  Object.values(stores).forEach((m) => m.clear())
  stores.tables.set("t5", { id: "t5", tenantId: T, number: 5, capacity: 4, status: "free" } satisfies Table)
  stores.menu.set(T, { tenantId: T, products, categories: [], version: 1, updatedAt: new Date() })
  posApiMock.mockReset()
  posApiMock.mockRejectedValue(netErr())
  setOfflineStatus({ online: false })
  await offlineStore().setMeta(`eligibility:${T}`, { enabled: true, role: "primary", name: "Caja", limit: 1, checkedAt: new Date().toISOString() })
  await cachePrinters(T, [
    { id: COCINA, name: "Cocina", paperWidth: 80, roles: ["kitchen"], printSettings: {} },
    { id: BARRA, name: "Barra", paperWidth: 58, roles: ["bar", "cashier"], printSettings: {} },
  ])
  await setPrintAgent(T, { url: "http://127.0.0.1:7717", key: "K7P2-M9XQ" })
  agentCalls = []
  agentReply = async (jobs) => jobs.map((j) => ({ id: j.id, ok: true }))
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: AgentCall["init"]) => {
    agentCalls.push({ url, init })
    const body = JSON.parse(String(init.body)) as { jobs: { id: string; printerId: string }[] }
    return new Response(JSON.stringify({ results: await agentReply(body.jobs) }), { status: 200 })
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("comanda sin internet", () => {
  it("la ronda a cocina sale por la red local en cocina y barra, y el server no la repite", async () => {
    const order = await createOrder(T, "t5", [pizza, birra], undefined, undefined, { id: "o1", status: "confirmed" })
    expect(order.pendingSync).toBe(true)
    await settle()

    expect(agentCalls).toHaveLength(1)
    expect(agentCalls[0].url).toBe("http://127.0.0.1:7717/print")
    expect(agentCalls[0].init.headers["X-Local-Key"]).toBe("K7P2-M9XQ")
    const jobs = (JSON.parse(String(agentCalls[0].init.body)) as { jobs: { id: string; printerName: string; payload: string }[] }).jobs
    expect(jobs.map((j) => j.printerName)).toEqual(["Cocina", "Barra"])
    const cocina = decode(jobs[0].payload)
    const barra = decode(jobs[1].payload)
    expect(cocina).toContain("*** COCINA ***")
    expect(cocina).toContain("MESA 5")
    expect(cocina).toContain("1x PIZZA")
    expect(cocina).not.toContain("CERVEZA")
    expect(barra).toContain("*** BARRA / BEBIDAS ***")
    expect(barra).toContain("2x CERVEZA")
    // Sin ticket de caja: el comprobante sale al cobrar (como el server para el POS).
    expect(jobs).toHaveLength(2)

    const [op] = await offlineStore().listOps(T)
    expect(await offlineStore().getMeta(`printed:${op.id}`)).toEqual([COCINA, BARRA])
    expect(getOfflineStatus().printIssue).toBeNull()

    // Vuelve la red: la operación avisa dónde ya salió.
    posApiMock.mockReset()
    posApiMock.mockResolvedValue({ order: { ...order, pendingSync: undefined } })
    setOfflineStatus({ online: true })
    await replayOfflineOps(T)
    const headers = posApiMock.mock.calls[0][2].headers as Record<string, string>
    expect(headers["X-Pos-Printed"]).toBe(`${COCINA},${BARRA}`)
    expect(await offlineStore().getMeta(`printed:${op.id}`)).toBeUndefined()
  })

  it("si la barra falla, solo cocina cuenta como impresa y se avisa", async () => {
    agentReply = async (jobs) => jobs.map((j) => ({ id: j.id, ok: j.printerId === COCINA, ...(j.printerId === BARRA ? { error: "Sin papel" } : {}) }))
    await createOrder(T, "t5", [pizza, birra], undefined, undefined, { id: "o2", status: "confirmed" })
    await settle()
    const [op] = await offlineStore().listOps(T)
    expect(await offlineStore().getMeta(`printed:${op.id}`)).toEqual([COCINA])
    expect(getOfflineStatus().printIssue).toMatch(/No se imprimió en Barra \(Sin papel\)/)
  })

  it("sin agente vinculado no se imprime, se avisa y el server la imprime al volver", async () => {
    await setPrintAgent(T, null)
    await createOrder(T, "t5", [pizza], undefined, undefined, { id: "o3", status: "confirmed" })
    await settle()
    expect(agentCalls).toHaveLength(0)
    expect(getOfflineStatus().printIssue).toMatch(/vincular el agente/)
    const [op] = await offlineStore().listOps(T)
    expect(await offlineStore().getMeta(`printed:${op.id}`)).toBeUndefined()
  })

  it("una ronda que no va a cocina (pendiente) no imprime", async () => {
    await createOrder(T, "t5", [pizza], undefined, undefined, { id: "o4" })
    await settle()
    expect(agentCalls).toHaveLength(0)
  })

  it("el reenvío espera a que termine la impresión local", async () => {
    let release!: () => void
    agentReply = (jobs) => new Promise((resolve) => { release = () => resolve(jobs.map((j) => ({ id: j.id, ok: true }))) })
    const order = await createOrder(T, "t5", [pizza], undefined, undefined, { id: "o5", status: "confirmed" })
    await settle()
    const [op] = await offlineStore().listOps(T)
    expect(isLocalWorkPending(op.id)).toBe(true)

    posApiMock.mockReset()
    posApiMock.mockResolvedValue({ order })
    setOfflineStatus({ online: true })
    const first = await replayOfflineOps(T)
    expect(first).toMatchObject({ sent: 0, retryLater: true })
    expect(posApiMock).not.toHaveBeenCalled()

    release()
    await settle()
    // Al terminar la impresión se manda sola, ya con X-Pos-Printed.
    expect(posApiMock).toHaveBeenCalledTimes(1)
    expect((posApiMock.mock.calls[0][2].headers as Record<string, string>)["X-Pos-Printed"]).toBe(COCINA)
  })
})

describe("marcha sin internet", () => {
  it("imprime la marcha solo si el tiempo seguía en espera", async () => {
    await createOrder(T, "t5", [pizza], undefined, undefined, { id: "o6", status: "confirmed", holdCourses: ["principal"] })
    await settle()
    const comanda = decode((JSON.parse(String(agentCalls[0].init.body)) as { jobs: { payload: string }[] }).jobs[0].payload)
    expect(comanda).toContain("PRINCIPALES - EN ESPERA")

    agentCalls = []
    await fireCourse(T, "o6", "principal", "Ana")
    await settle()
    const jobs = (JSON.parse(String(agentCalls[0].init.body)) as { jobs: { printerName: string; payload: string }[] }).jobs
    expect(jobs.map((j) => j.printerName)).toEqual(["Cocina"])
    const marcha = decode(jobs[0].payload)
    expect(marcha).toContain("MARCHA")
    expect(marcha).toContain("PRINCIPAL")
    expect(marcha).toContain("1 plato en espera")
    expect(marcha).toContain("Ana")

    agentCalls = []
    await fireCourse(T, "o6", "principal")
    await settle()
    expect(agentCalls).toHaveLength(0)
  })
})

describe("armado", () => {
  it("la orden del POS se imprime con la estación y la categoría de la carta", () => {
    const p = toPrintOrder(
      { id: "abc-123-xyz9", tenantId: T, source: "pos", status: "confirmed", items: [{ ...pizza, modifiers: [{ name: "Extra queso", price: 50_000 }], total: 950_000, notes: " sin sal " }], total: 950_000, menuVersion: 1, createdAt: new Date(), updatedAt: new Date() },
      new Map(products.map((x) => [x.id!, x as Product]))
    )
    expect(p.orderNumber).toBe(offlineOrderNumber("abc-123-xyz9"))
    expect(p.orderNumber).toBe("SR-XYZ9")
    expect(p.items[0]).toMatchObject({ printRole: "kitchen", categoryName: "Pizzas", price: 950_000, extraPrice: 50_000, notes: "sin sal", customizations: [{ groupName: "Modificadores", selectedOptions: [{ name: "Extra queso" }] }] })
  })

  it("normaliza la dirección del agente", () => {
    expect(normalizeAgentUrl("192.168.0.20")).toBe("http://192.168.0.20:7717")
    expect(normalizeAgentUrl("http://127.0.0.1:7717/")).toBe("http://127.0.0.1:7717")
    expect(normalizeAgentUrl("http://pc-caja:8000")).toBe("http://pc-caja:8000")
    expect(normalizeAgentUrl("http://x/print")).toBeNull()
    expect(normalizeAgentUrl("")).toBeNull()
  })
})
