import { describe, it, expect, vi, beforeEach } from "vitest"
import type { CashRegister, Order, Table } from "@takeasygo/types"

/**
 * POS offline V2 — etapa 3 (12/11/2026): cobro y caja sin internet.
 *
 * Sin red y con el equipo habilitado: se abre la caja, se cobra la mesa (en
 * partes, efectivo + tarjeta), cada parte deja su movimiento en la caja (solo
 * el efectivo mueve el arqueo), se entrega y se libera la mesa. Las reglas
 * del server se respetan en local (suma = total, no cobrar dos veces, una
 * caja abierta). Al volver la red, todo se manda en orden.
 */

const posApiMock = vi.hoisted(() => vi.fn())
const stores = vi.hoisted(() => ({ tables: new Map<string, unknown>(), orders: new Map<string, unknown>(), registers: new Map<string, unknown>(), pending: new Map<string, unknown>() }))

vi.mock("../db/dexie", () => {
  const clone = <T,>(v: T): T => structuredClone(v)
  const table = (store: Map<string, unknown>) => ({
    get: async (id: string) => (store.has(id) ? clone(store.get(id)) : undefined),
    put: async (rec: { id: string }) => { store.set(rec.id, clone(rec)); return rec.id },
    add: async (rec: { id: string }) => { store.set(rec.id, clone(rec)); return rec.id },
    delete: async (id: string) => { store.delete(id) },
    update: async (id: string, changes: object) => { if (store.has(id)) store.set(id, { ...(store.get(id) as object), ...changes }) },
    where: (field: string) => ({
      equals: (value: unknown) => {
        const rows = () => [...store.values()].filter((r) => (r as Record<string, unknown>)[field] === value).map(clone) as Record<string, unknown>[]
        return {
          filter: (fn: (r: Record<string, unknown>) => boolean) => ({
            modify: async (changes: object) => {
              const hit = rows().filter(fn)
              hit.forEach((r) => store.set(r.id as string, { ...r, ...changes }))
              return hit.length
            },
          }),
          and: (fn: (r: Record<string, unknown>) => boolean) => ({ toArray: async () => rows().filter(fn), first: async () => rows().find(fn) }),
          toArray: async () => rows(),
        }
      },
    }),
  })
  return {
    db: {
      diningTable: table(stores.tables),
      orders: table(stores.orders),
      cashRegister: table(stores.registers),
      pendingMovements: table(stores.pending),
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
import { occupyTableWithGuests, bindTableOrder, freeTable } from "../services/table"
import { createOrder, recordPayments, settleToDelivered } from "../services/order"
import { openRegister } from "../services/cash"
import { registerCounterSale } from "../services/counter-sale"
import "../services/offline/kinds"

const T = "64b000000000000000000001"
const netErr = () => new PosApiError("Failed to fetch", "network", 0)
const pizza = { productId: "p1", name: "Pizza", quantity: 2, unitPrice: 900_000, total: 1_800_000 }

beforeEach(async () => {
  __resetOfflineStatusForTests()
  setOfflineStore(createMemoryOfflineStore())
  Object.values(stores).forEach((m) => m.clear())
  stores.tables.set("t5", { id: "t5", tenantId: T, number: 5, capacity: 4, status: "free" } satisfies Table)
  posApiMock.mockReset()
  posApiMock.mockRejectedValue(netErr())
  await offlineStore().setMeta(`eligibility:${T}`, { enabled: true, role: "primary", name: "Caja", limit: 1, checkedAt: new Date().toISOString() })
})

describe("cobro sin internet", () => {
  it("caja, mesa cobrada en partes, movimientos en caja y mesa liberada", async () => {
    const register = await openRegister(T, 2_000_000, "Ana")
    expect(register).toMatchObject({ status: "open", initialAmount: 2_000_000, expectedAmount: 2_000_000 })

    await occupyTableWithGuests(T, "t5", "counter", 2)
    await createOrder(T, "t5", [pizza], undefined, undefined, { id: "o1" })
    await bindTableOrder(T, "t5", "counter", "o1")

    const parts = [
      { id: "pay-1", method: "cash" as const, amount: 1_000_000 },
      { id: "pay-2", method: "posnet_debit" as const, amount: 800_000 },
    ]
    const paid = await recordPayments(T, "o1", parts, "Pedido M5")
    expect(paid).toMatchObject({ payments: [{ method: "cash", amount: 1_000_000 }, { method: "posnet_debit", amount: 800_000 }], pendingSync: true })

    // Cada parte deja su movimiento (la propia caja decide; nunca queda «pendiente»).
    const r1 = await registerCounterSale({ tenantId: T, amount: 1_000_000, paymentMethod: "cash", reason: "Pedido M5 (parte 1/2)", relatedOrderId: "o1#0" })
    const r2 = await registerCounterSale({ tenantId: T, amount: 800_000, paymentMethod: "posnet_debit", reason: "Pedido M5 (parte 2/2)", relatedOrderId: "o1#1" })
    expect(r1.status).toBe("registered")
    expect(r2.status).toBe("registered")
    expect(stores.pending.size).toBe(0)
    const reg = stores.registers.get(register.id) as CashRegister
    expect(reg.movements).toHaveLength(2)
    // Solo el efectivo mueve el arqueo.
    expect(reg.expectedAmount).toBe(3_000_000)

    await settleToDelivered(T, "o1")
    expect(stores.orders.get("o1")).toMatchObject({ status: "delivered" })
    // Entregar ya liberó la mesa: como en handlePay, freeTable solo si sigue ocupada.
    expect(stores.tables.get("t5")).toMatchObject({ status: "free" })
    if ((stores.tables.get("t5") as Table).status !== "free") await freeTable(T, "t5")

    const ops = await offlineStore().listOps(T)
    expect(ops.map((o) => o.kind)).toEqual([
      "cash.register", "table.write", "order.write", "table.write", "order.write",
      "cash.movement", "cash.movement",
      "order.status",
    ])
    expect(ops[4]).toMatchObject({ path: "/orders/o1/payments", label: "Mesa 5 · cobro $18.000" })
    expect(ops[5].entityKeys).toEqual([`register:${register.id}`, "order:o1"])
    expect(getOfflineStatus().pending).toBe(ops.length)
  })

  it("mismas reglas que el server: suma distinta del total, dos cobros, dos cajas", async () => {
    await createOrder(T, "mostrador-1", [pizza], undefined, undefined, { id: "o2" })
    await expect(recordPayments(T, "o2", [{ id: "x", method: "cash", amount: 100 }])).rejects.toThrow("no cubre el total")
    await recordPayments(T, "o2", [{ id: "y", method: "cash", amount: 1_800_000 }])
    await expect(recordPayments(T, "o2", [{ id: "z", method: "cash", amount: 1_800_000 }])).rejects.toThrow("ya fue cobrada")

    await openRegister(T, 0, "Ana")
    await expect(openRegister(T, 0, "Beto")).rejects.toThrow("Ya hay una caja abierta")
  })

  it("el mismo movimiento no se registra dos veces", async () => {
    await openRegister(T, 0, "Ana")
    await registerCounterSale({ tenantId: T, amount: 500, paymentMethod: "cash", reason: "Pedido", relatedOrderId: "o9" })
    const again = await registerCounterSale({ tenantId: T, amount: 500, paymentMethod: "cash", reason: "Pedido", relatedOrderId: "o9" })
    expect(again.status).toBe("duplicate")
  })
})

describe("vuelve la red", () => {
  it("la caja y el cobro se mandan en orden y gana lo que responde el server", async () => {
    const register = await openRegister(T, 1000, "Ana")
    await createOrder(T, "mostrador-1", [pizza], undefined, undefined, { id: "o3" })
    await recordPayments(T, "o3", [{ id: "p", method: "cash", amount: 1_800_000 }])

    const serverRegister = { ...register, openedAt: new Date().toISOString(), shiftName: "Noche" }
    const serverOrder = { id: "o3", tenantId: T, source: "pos", status: "pending", items: [pizza], total: 1_800_000, menuVersion: 1, payments: [{ method: "cash", amount: 1_800_000 }], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    posApiMock.mockReset()
    posApiMock.mockImplementation(async (_t: string, path: string) => (path === "/cash/registers" ? { register: serverRegister } : { order: serverOrder }))
    setOfflineStatus({ online: true })

    const r = await replayOfflineOps(T)
    expect(r).toEqual({ sent: 3, conflicts: 0, retryLater: false })
    expect(posApiMock.mock.calls.map((c) => c[1])).toEqual(["/cash/registers", "/orders", "/orders/o3/payments"])
    expect(stores.registers.get(register.id)).toMatchObject({ shiftName: "Noche" })
    expect((stores.orders.get("o3") as Order).pendingSync).toBeUndefined()
  })
})
