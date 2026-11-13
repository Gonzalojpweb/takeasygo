import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { Table } from "@takeasygo/types"

/**
 * POS offline V2 — etapa 7 (12/11/2026): PIN sin internet.
 *   · Entra sin internet quien ya entró con internet en este equipo (últimos
 *     7 días): se guarda un verificador del PIN, nunca el PIN ni el token.
 *   · El PIN del encargado se verifica en el equipo para descuentos y para
 *     quitar platos ya enviados; la operación viaja con
 *     X-Pos-Offline-Approver.
 *   · Prueba de corte: un servicio completo sin internet y, al volver, todo
 *     se manda en orden con sus aprobaciones.
 */

const posApiMock = vi.hoisted(() => vi.fn())
const stores = vi.hoisted(() => ({ tables: new Map<string, unknown>(), orders: new Map<string, unknown>(), registers: new Map<string, unknown>() }))

vi.mock("../db/dexie", () => {
  const clone = <T,>(v: T): T => structuredClone(v)
  const table = (store: Map<string, unknown>) => ({
    get: async (id: string) => (store.has(id) ? clone(store.get(id)) : undefined),
    put: async (rec: Record<string, unknown>) => { store.set(rec.id as string, clone(rec)); return rec.id },
    update: async (id: string, changes: object) => { if (store.has(id)) store.set(id, { ...(store.get(id) as object), ...changes }) },
    where: (field: string) => ({
      equals: (value: unknown) => {
        const rows = () => [...store.values()].filter((r) => (r as Record<string, unknown>)[field] === value).map(clone) as Record<string, unknown>[]
        return { toArray: async () => rows(), and: (fn: (r: Record<string, unknown>) => boolean) => ({ first: async () => rows().find(fn), toArray: async () => rows().filter(fn) }) }
      },
    }),
  })
  return {
    db: {
      diningTable: table(stores.tables),
      orders: table(stores.orders),
      cashRegister: table(stores.registers),
      pendingMovements: table(new Map()),
      menuSnapshot: { get: async () => undefined },
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
  return {
    PosApiError,
    isPosApiError: (e: unknown) => e instanceof PosApiError,
    posApi: (...a: unknown[]) => posApiMock(...a),
    posApiDownload: vi.fn(),
    SESSION_CACHE_KEY: "takeasygo_session",
  }
})
vi.mock("../services/sync-api", () => ({ notifyStatusToSyncLayer: vi.fn(async () => {}) }))

import { PosApiError } from "../services/pos-api"
import { createMemoryOfflineStore, setOfflineStore, offlineStore } from "../services/offline/store"
import { setOfflineStatus, __resetOfflineStatusForTests } from "../services/offline/status"
import { replayOfflineOps } from "../services/offline/replay"
import { rememberOfflineUser, offlinePinLogin, offlineSessionFor, offlineApprovalHeaders, currentPosUser, OFFLINE_LOGIN_TRUST_MS } from "../services/offline/offline-auth"
import { subscribeApproval, answerApproval } from "../services/manager-approval"
import { createOrder, discountOrder, discountTable, voidSentItem, recordPayments, settleToDelivered } from "../services/order"
import { openRegister } from "../services/cash"
import { occupyTableWithGuests, bindTableOrder } from "../services/table"
import "../services/offline/kinds"

const T = "64b000000000000000000001"
const ANA = "64b0000000000000000000a1" // encargada
const LUIS = "64b0000000000000000000a2" // cajero
const jwtFor = (sub: string) => `x.${btoa(JSON.stringify({ sub, tenantId: T })).replace(/=+$/, "")}.y`
const login = (sub: string, name: string, role: string) => ({ accessToken: jwtFor(sub), expiresAt: Math.floor(Date.now() / 1000) + 1800, deviceType: "hub" as const, profile: { userName: name, role, tenantName: "Local", locationName: "Centro" } })

const session = new Map<string, string>()
const pizza = { productId: "p1", name: "Pizza", quantity: 2, unitPrice: 900_000, total: 1_800_000 }
const agua = { productId: "p2", name: "Agua", quantity: 1, unitPrice: 200_000, total: 200_000 }

/** Responde el próximo pedido de PIN con `pin`. */
function answerNextPin(pin: string | null) {
  const unsub = subscribeApproval((prompt) => {
    if (!prompt) return
    queueMicrotask(() => { unsub(); answerApproval(pin) })
  })
}

function actAs(user: ReturnType<typeof offlineSessionFor>) {
  session.set("takeasygo_session", JSON.stringify({ ...user, tenantId: T }))
}

beforeEach(async () => {
  __resetOfflineStatusForTests()
  setOfflineStore(createMemoryOfflineStore())
  Object.values(stores).forEach((m) => m.clear())
  session.clear()
  vi.stubGlobal("sessionStorage", { getItem: (k: string) => session.get(k) ?? null, setItem: (k: string, v: string) => session.set(k, v), removeItem: (k: string) => session.delete(k) })
  stores.tables.set("t5", { id: "t5", tenantId: T, number: 5, capacity: 4, status: "free" } satisfies Table)
  posApiMock.mockReset()
  posApiMock.mockRejectedValue(new PosApiError("Failed to fetch", "network", 0))
  await offlineStore().setMeta(`eligibility:${T}`, { enabled: true, role: "primary", name: "Caja", limit: 1, checkedAt: new Date().toISOString() })
  // Los dos entraron con internet en este equipo.
  await rememberOfflineUser(T, "4826", login(ANA, "Ana", "manager"))
  await rememberOfflineUser(T, "1357", login(LUIS, "Luis", "cashier"))
  setOfflineStatus({ online: false })
})

afterEach(() => vi.unstubAllGlobals())

describe("ingreso sin internet", () => {
  it("guarda solo un verificador del PIN y deja entrar a quien ya entró", async () => {
    const saved = JSON.stringify(await offlineStore().getMeta(`offlineUsers:${T}`))
    expect(saved).not.toContain("4826")
    expect(saved).not.toContain(jwtFor(ANA))

    const ok = await offlinePinLogin(T, "1357")
    expect(ok).toMatchObject({ ok: true, user: { userId: LUIS, name: "Luis", role: "cashier" } })
    const s = offlineSessionFor((ok as { user: Parameters<typeof offlineSessionFor>[0] }).user)
    expect(s).toMatchObject({ accessToken: "", offline: true, offlineUserId: LUIS, profile: { userName: "Luis" } })
    actAs(s)
    expect(currentPosUser()).toEqual({ userId: LUIS, role: "cashier", offline: true })
  })

  it("PIN errado: 5 seguidos bloquean 5 minutos", async () => {
    for (let i = 0; i < 4; i++) expect(await offlinePinLogin(T, "0000")).toEqual({ ok: false, reason: "invalid" })
    expect(await offlinePinLogin(T, "0000")).toMatchObject({ ok: false, reason: "locked", retryAfter: 300 })
    expect(await offlinePinLogin(T, "1357")).toMatchObject({ ok: false, reason: "locked" })
  })

  it("no entra quien no entró en 7 días, ni en un equipo no habilitado", async () => {
    expect(await offlinePinLogin(T, "1357", Date.now() + OFFLINE_LOGIN_TRUST_MS + 60_000)).toMatchObject({ ok: false })
    await offlineStore().setMeta(`eligibility:${T}`, { enabled: false, role: null, name: null, limit: 1, checkedAt: new Date().toISOString() })
    expect(await offlinePinLogin(T, "1357")).toEqual({ ok: false, reason: "not_enabled" })
  })
})

describe("PIN del encargado sin internet", () => {
  it("el encargado aprueba solo; el cajero pide el PIN y se verifica en el equipo", async () => {
    actAs(offlineSessionFor((await offlinePinLogin(T, "4826") as { user: Parameters<typeof offlineSessionFor>[0] }).user))
    expect(await offlineApprovalHeaders(T, "Descuento")).toEqual({ "X-Pos-Offline-Approver": ANA })

    actAs(offlineSessionFor((await offlinePinLogin(T, "1357") as { user: Parameters<typeof offlineSessionFor>[0] }).user))
    answerNextPin("1357") // el PIN del cajero no sirve…
    setTimeout(() => answerNextPin("4826"), 5) // …el de la encargada sí
    expect(await offlineApprovalHeaders(T, "Descuento")).toEqual({ "X-Pos-Offline-Approver": ANA })

    answerNextPin(null)
    await expect(offlineApprovalHeaders(T, "Descuento")).rejects.toMatchObject({ code: "approval_cancelled" })
  })

  it("sin ningún encargado guardado en el equipo no se puede aprobar", async () => {
    await offlineStore().setMeta(`offlineUsers:${T}`, ((await offlineStore().getMeta(`offlineUsers:${T}`)) as { role: string }[]).filter((u) => u.role !== "manager"))
    actAs(offlineSessionFor((await offlinePinLogin(T, "1357") as { user: Parameters<typeof offlineSessionFor>[0] }).user))
    await expect(offlineApprovalHeaders(T, "Descuento")).rejects.toThrow(/encargado que ya haya entrado/)
  })
})

describe("prueba de corte: un servicio entero sin internet", () => {
  it("caja, mesa, descuento con PIN, plato quitado, cobro y entrega; al volver, todo en orden", async () => {
    actAs(offlineSessionFor((await offlinePinLogin(T, "1357") as { user: Parameters<typeof offlineSessionFor>[0] }).user))

    await openRegister(T, 1_000_000, "Luis")
    await occupyTableWithGuests(T, "t5", LUIS, 2)
    await createOrder(T, "t5", [pizza, agua], undefined, undefined, { id: "o1", status: "confirmed" })
    await bindTableOrder(T, "t5", LUIS, "o1")
    // El server ya conocía las líneas (lineId) de una ronda anterior sincronizada:
    const o1 = stores.orders.get("o1") as { items: { lineId?: string }[] }
    o1.items[1].lineId = "line-agua"
    stores.orders.set("o1", o1)

    // Quitar el agua ya enviada: pide PIN (la ronda está en cocina).
    answerNextPin("4826")
    await voidSentItem(T, "o1", { productId: "p2", lineId: "line-agua" }, 0, "changed_mind")
    // 10 % de descuento a la cuenta: pide PIN.
    answerNextPin("4826")
    const discounted = await discountOrder(T, "o1", { kind: "percent", value: 10, reason: "courtesy" })
    expect(discounted.total).toBe(1_620_000)
    expect(discounted.items).toEqual([expect.objectContaining({ productId: "p1", total: 1_620_000, discount: expect.objectContaining({ amount: 180_000, scope: "order" }) })])

    await recordPayments(T, "o1", [{ id: "pay1", method: "cash", amount: 1_620_000 }], "Pedido M5")
    await settleToDelivered(T, "o1")

    const ops = await offlineStore().listOps(T)
    expect(ops.map((o) => o.path)).toEqual([
      "/cash/registers", "/tables/t5", "/orders", "/tables/t5",
      "/orders/o1/items/p2", "/orders/o1/discounts", "/orders/o1/payments",
      // Entregar desde cocina: preparando → lista → entregada.
      "/orders/o1", "/orders/o1", "/orders/o1",
    ])
    expect(ops[4].headers).toEqual({ "X-Pos-Offline-Approver": ANA })
    expect(ops[5].headers).toEqual({ "X-Pos-Offline-Approver": ANA })
    expect(ops[2].headers).toBeUndefined()

    // Vuelve la red (con un token real): se manda todo, en orden, con la aprobación.
    posApiMock.mockReset()
    posApiMock.mockResolvedValue({})
    setOfflineStatus({ online: true })
    const r = await replayOfflineOps(T)
    expect(r).toMatchObject({ sent: 10, conflicts: 0 })
    const sent = posApiMock.mock.calls.map((c) => [c[1], (c[2].headers as Record<string, string>)["X-Pos-Offline-Approver"] ?? null])
    expect(sent[4]).toEqual(["/orders/o1/items/p2", ANA])
    expect(sent[5]).toEqual(["/orders/o1/discounts", ANA])
  })

  it("descuento de la mesa: un monto se reparte entre las rondas por su importe", async () => {
    actAs(offlineSessionFor((await offlinePinLogin(T, "4826") as { user: Parameters<typeof offlineSessionFor>[0] }).user))
    await occupyTableWithGuests(T, "t5", ANA, 2)
    await createOrder(T, "t5", [pizza], undefined, undefined, { id: "r1", status: "confirmed" })
    await createOrder(T, "t5", [agua], undefined, undefined, { id: "r2", status: "confirmed" })
    const cents = await discountTable(T, "t5", { kind: "amount", value: 100_000, reason: "complaint" })
    expect(cents).toBe(100_000)
    expect((stores.orders.get("r1") as { total: number }).total).toBe(1_800_000 - 90_000)
    expect((stores.orders.get("r2") as { total: number }).total).toBe(200_000 - 10_000)
    const op = (await offlineStore().listOps(T)).find((o) => o.path === "/tables/t5/discount")!
    expect(op).toMatchObject({ kind: "order.many", headers: { "X-Pos-Offline-Approver": ANA } })
  })

  it("quitar un plato que todavía no se mandó a cocina no pide PIN", async () => {
    actAs(offlineSessionFor((await offlinePinLogin(T, "1357") as { user: Parameters<typeof offlineSessionFor>[0] }).user))
    await createOrder(T, "t5", [pizza, agua], undefined, undefined, { id: "o2" })
    const o2 = stores.orders.get("o2") as { items: { lineId?: string }[] }
    o2.items[0].lineId = "line-pizza"
    stores.orders.set("o2", o2)
    await voidSentItem(T, "o2", { productId: "p1", lineId: "line-pizza" }, 1, "load_error")
    expect((stores.orders.get("o2") as { total: number }).total).toBe(900_000 + 200_000)
    const op = (await offlineStore().listOps(T)).find((o) => o.path === "/orders/o2/items/p1")!
    expect(op.headers).toBeUndefined()
  })
})
