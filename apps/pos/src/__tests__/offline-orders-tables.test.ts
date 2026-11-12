import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Order, Table } from "@takeasygo/types"

/**
 * POS offline V2 — etapa 2 (12/11/2026): mesas y pedidos sin internet.
 *
 * Sin red y con el equipo habilitado, el salón sigue: abrir mesa, cargar la
 * ronda, mandarla a cocina, entregar (libera la mesa) y mover de mesa. Todo
 * queda en la cola en orden; al volver la red, la respuesta del server
 * reemplaza lo local (gana el server) y `pendingSync` desaparece.
 */

const posApiMock = vi.hoisted(() => vi.fn())
const tables = vi.hoisted(() => new Map<string, unknown>())
const orders = vi.hoisted(() => new Map<string, unknown>())

vi.mock("../db/dexie", () => {
  const clone = <T,>(v: T): T => structuredClone(v)
  const table = (store: Map<string, unknown>) => ({
    get: async (id: string) => (store.has(id) ? clone(store.get(id)) : undefined),
    put: async (rec: { id: string }) => { store.set(rec.id, clone(rec)); return rec.id },
    update: async (id: string, changes: object) => { if (store.has(id)) store.set(id, { ...(store.get(id) as object), ...changes }) },
    where: (field: string) => ({
      equals: (value: unknown) => {
        const rows = () => [...store.values()].filter((r) => (r as Record<string, unknown>)[field] === value) as Record<string, unknown>[]
        return {
          filter: (fn: (r: Record<string, unknown>) => boolean) => ({
            modify: async (changes: object) => {
              const hit = rows().filter(fn)
              hit.forEach((r) => store.set(r.id as string, { ...r, ...changes }))
              return hit.length
            },
          }),
          and: (fn: (r: Record<string, unknown>) => boolean) => ({ toArray: async () => rows().filter(fn) }),
          toArray: async () => rows(),
        }
      },
    }),
  })
  return { db: { diningTable: table(tables), orders: table(orders), tenantConfig: { get: async () => undefined } } }
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
import { occupyTableWithGuests, bindTableOrder, moveTable } from "../services/table"
import { createOrder, confirmOrder, deliverOrder } from "../services/order"
import { OFFLINE_NOT_ENABLED_MESSAGE } from "../services/offline/executor"
import "../services/offline/kinds"

const T = "64b000000000000000000001"
const netErr = () => new PosApiError("Failed to fetch", "network", 0)

const mesa = (id: string, number: number, extra: Partial<Table> = {}): Table => ({ id, tenantId: T, number, capacity: 4, status: "free", ...extra })
const empanada = { productId: "p1", name: "Empanada", quantity: 3, unitPrice: 150_000, total: 3 * (150_000 + 20_000), modifiers: [{ name: "Picante", price: 20_000 }] }
const cerveza = { productId: "p2", name: "Cerveza", quantity: 1, unitPrice: 400_000, total: 400_000 }

beforeEach(async () => {
  __resetOfflineStatusForTests()
  setOfflineStore(createMemoryOfflineStore())
  tables.clear()
  orders.clear()
  tables.set("t5", mesa("t5", 5))
  tables.set("t6", mesa("t6", 6))
  posApiMock.mockReset()
  posApiMock.mockRejectedValue(netErr())
  await offlineStore().setMeta(`eligibility:${T}`, { enabled: true, role: "primary", name: "Caja", limit: 1, checkedAt: new Date().toISOString() })
})

describe("salón sin internet", () => {
  it("abrir mesa, cargar ronda, mandar a cocina y entregar: todo local y en cola, en orden", async () => {
    await occupyTableWithGuests(T, "t5", "counter", 3)
    expect(tables.get("t5")).toMatchObject({ status: "occupied", guests: 3 })
    expect(getOfflineStatus().online).toBe(false)

    const order = await createOrder(T, "t5", [empanada, cerveza], undefined, undefined, { id: "o1" })
    // Misma regla de totales que el server: Σ item.total (los agregados ya están en la línea).
    expect(order).toMatchObject({ id: "o1", status: "pending", tableId: "t5", tableNumber: 5, total: 510_000 + 400_000, pendingSync: true })

    await bindTableOrder(T, "t5", "counter", "o1")
    await confirmOrder(T, "o1")
    expect(orders.get("o1")).toMatchObject({ status: "confirmed", sentToKitchenAt: expect.any(Date) })

    await deliverOrder(T, "o1")
    expect(orders.get("o1")).toMatchObject({ status: "delivered" })
    // Entregar libera la mesa (igual que el server).
    expect(tables.get("t5")).toMatchObject({ status: "free", needsBill: false })
    expect((tables.get("t5") as Table).currentOrderId).toBeUndefined()

    const ops = await offlineStore().listOps(T)
    expect(ops.map((o) => `${o.kind} ${o.method} ${o.path}`)).toEqual([
      "table.write PATCH /tables/t5",
      "order.write POST /orders",
      "table.write PATCH /tables/t5",
      "order.status PATCH /orders/o1",
      "order.status PATCH /orders/o1",
    ])
    expect(ops[1]).toMatchObject({ idempotencyKey: "o1", entityKeys: ["order:o1", "table:t5"], label: "Mesa 5 · nueva ronda" })
    expect(ops[4].label).toBe("Mesa 5 · entregada")
    expect(getOfflineStatus().pending).toBe(5)
  })

  it("mover de mesa: la mesa de destino toma la ronda y la de origen queda libre", async () => {
    await occupyTableWithGuests(T, "t5", "counter", 2)
    await createOrder(T, "t5", [cerveza], undefined, undefined, { id: "o2" })
    await bindTableOrder(T, "t5", "counter", "o2")
    const res = await moveTable(T, "t5", "t6", false)
    expect(res).toEqual({ mode: "move", movedOrders: 1 })
    expect(tables.get("t6")).toMatchObject({ status: "occupied", guests: 2, currentOrderId: "o2" })
    expect(tables.get("t5")).toMatchObject({ status: "free" })
    expect(orders.get("o2")).toMatchObject({ tableId: "t6" })
  })

  it("equipo no habilitado: el error de siempre y nada cambia", async () => {
    await offlineStore().setMeta(`eligibility:${T}`, { enabled: false, role: null, name: null, limit: 1, checkedAt: new Date().toISOString() })
    await expect(occupyTableWithGuests(T, "t5", "counter", 2)).rejects.toThrow(OFFLINE_NOT_ENABLED_MESSAGE)
    expect(tables.get("t5")).toMatchObject({ status: "free" })
    expect(await offlineStore().listOps(T)).toHaveLength(0)
  })
})

describe("vuelve la red", () => {
  it("se manda la cola con el opId y la respuesta del server reemplaza lo local", async () => {
    await occupyTableWithGuests(T, "t5", "counter", 2)
    await createOrder(T, "t5", [cerveza], undefined, undefined, { id: "o3" })

    const serverTable: Table = mesa("t5", 5, { status: "occupied", guests: 2, serverId: "u1", serverName: "Ana" })
    const serverOrder = { id: "o3", tenantId: T, source: "pos", status: "pending", tableId: "t5", items: [{ ...cerveza, lineId: "L1" }], total: 400_000, menuVersion: 1, createdAt: "2026-11-12T20:00:00.000Z", updatedAt: "2026-11-12T20:00:00.000Z" }
    posApiMock.mockReset()
    posApiMock.mockImplementation(async (_t: string, path: string) => (path === "/orders" ? { order: serverOrder } : { table: serverTable }))
    setOfflineStatus({ online: true })

    const r = await replayOfflineOps(T)
    expect(r).toEqual({ sent: 2, conflicts: 0, retryLater: false })
    // Cada envío lleva su opId y la hora real.
    for (const call of posApiMock.mock.calls) {
      expect(call[2].headers).toMatchObject({ "X-Pos-Op-Id": expect.any(String), "X-Pos-Occurred-At": expect.any(String) })
      expect(call[2].skipApproval).toBe(true)
    }
    expect(posApiMock.mock.calls[1][2]).toMatchObject({ method: "POST", idempotencyKey: "o3" })
    const saved = orders.get("o3") as Order
    expect(saved.pendingSync).toBeUndefined()
    expect(saved.items[0].lineId).toBe("L1")
    expect(saved.createdAt).toBeInstanceOf(Date)
    expect(tables.get("t5")).toMatchObject({ serverName: "Ana" })
    expect(getOfflineStatus()).toMatchObject({ pending: 0, conflicts: 0 })
  })
})
