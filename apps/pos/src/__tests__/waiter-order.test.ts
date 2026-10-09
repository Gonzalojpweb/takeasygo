import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Order, OrderItem } from "@takeasygo/types"
import {
  sendWaiterOrderToKitchen,
  WAITER_SERVER_ID,
  type WaiterKitchenDeps,
} from "../services/waiter-order"

const TABLE = "mesa-uuid-1"
const ORDER_ID = "order-uuid-1"

const items: OrderItem[] = [
  { productId: "p1", name: "Café", quantity: 2, unitPrice: 1000, total: 2000 },
]

function makeDeps(overrides: Partial<WaiterKitchenDeps> = {}): WaiterKitchenDeps {
  return {
    createOrder: vi.fn(async () => ({ id: ORDER_ID }) as unknown as Order),
    readTable: vi.fn(async () => ({ status: "free" })),
    occupyTable: vi.fn(async () => undefined),
    bindTableOrder: vi.fn(async () => undefined),
    confirmOrder: vi.fn(async () => undefined),
    sendToKitchen: vi.fn(async () => ({ id: ORDER_ID })),
    ...overrides,
  }
}

let deps: WaiterKitchenDeps

beforeEach(() => {
  deps = makeDeps()
})

describe("sendWaiterOrderToKitchen — camino feliz", () => {
  it("mesa libre: create → occupy(waiter) → confirm → send, en ese orden", async () => {
    const order = await sendWaiterOrderToKitchen(deps, { tableId: TABLE, items })

    expect(order.id).toBe(ORDER_ID)
    expect(deps.createOrder).toHaveBeenCalledWith(TABLE, items)
    expect(deps.occupyTable).toHaveBeenCalledWith(TABLE, WAITER_SERVER_ID, ORDER_ID)
    expect(deps.bindTableOrder).not.toHaveBeenCalled()
    expect(deps.confirmOrder).toHaveBeenCalledWith(ORDER_ID)
    expect(deps.sendToKitchen).toHaveBeenCalledWith(ORDER_ID)

    const calls = [
      deps.createOrder,
      deps.occupyTable,
      deps.confirmOrder,
      deps.sendToKitchen,
    ].map((fn) => (fn as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0])
    expect([...calls].sort((a, b) => a - b)).toEqual(calls)
  })

  it("mesa occupied sin orden vigente: bind en vez de occupy", async () => {
    deps.readTable = vi.fn(async () => ({ status: "occupied" }))

    await sendWaiterOrderToKitchen(deps, { tableId: TABLE, items })

    expect(deps.bindTableOrder).toHaveBeenCalledWith(TABLE, WAITER_SERVER_ID, ORDER_ID)
    expect(deps.occupyTable).not.toHaveBeenCalled()
    expect(deps.confirmOrder).toHaveBeenCalledWith(ORDER_ID)
    expect(deps.sendToKitchen).toHaveBeenCalledWith(ORDER_ID)
  })

  it("mesa occupied con OTRA orden: no toca la mesa, igual confirma y envía", async () => {
    deps.readTable = vi.fn(async () => ({
      status: "occupied",
      currentOrderId: "otra-orden",
    }))

    await sendWaiterOrderToKitchen(deps, { tableId: TABLE, items })

    expect(deps.occupyTable).not.toHaveBeenCalled()
    expect(deps.bindTableOrder).not.toHaveBeenCalled()
    expect(deps.confirmOrder).toHaveBeenCalledWith(ORDER_ID)
    expect(deps.sendToKitchen).toHaveBeenCalledWith(ORDER_ID)
  })

  it("tabla inexistente en readTable: no ocupa ni vincula, el flujo sigue", async () => {
    deps.readTable = vi.fn(async () => undefined)

    await sendWaiterOrderToKitchen(deps, { tableId: TABLE, items })

    expect(deps.occupyTable).not.toHaveBeenCalled()
    expect(deps.bindTableOrder).not.toHaveBeenCalled()
    expect(deps.sendToKitchen).toHaveBeenCalledWith(ORDER_ID)
  })
})

describe("sendWaiterOrderToKitchen — negativos", () => {
  it("sin tableId: lanza y NUNCA crea la orden", async () => {
    await expect(
      sendWaiterOrderToKitchen(deps, { tableId: "", items })
    ).rejects.toThrow("[waiter] tableId is required")
    expect(deps.createOrder).not.toHaveBeenCalled()
  })

  it("sin items: lanza y NUNCA crea la orden", async () => {
    await expect(
      sendWaiterOrderToKitchen(deps, { tableId: TABLE, items: [] })
    ).rejects.toThrow("[waiter] items are required")
    expect(deps.createOrder).not.toHaveBeenCalled()
  })

  it("createOrder falla: propaga y no confirma ni envía a cocina", async () => {
    deps.createOrder = vi.fn(async () => {
      throw new Error("server 500")
    })

    await expect(
      sendWaiterOrderToKitchen(deps, { tableId: TABLE, items })
    ).rejects.toThrow("server 500")
    expect(deps.confirmOrder).not.toHaveBeenCalled()
    expect(deps.sendToKitchen).not.toHaveBeenCalled()
  })

  it("confirmOrder falla: la comanda NUNCA se crea sin confirmar", async () => {
    deps.confirmOrder = vi.fn(async () => {
      throw new Error("offline")
    })

    await expect(
      sendWaiterOrderToKitchen(deps, { tableId: TABLE, items })
    ).rejects.toThrow("offline")
    expect(deps.sendToKitchen).not.toHaveBeenCalled()
  })

  it("sendToKitchen falla: el error llega al caller (no se traga)", async () => {
    deps.sendToKitchen = vi.fn(async () => {
      throw new Error("dexie constraint")
    })

    await expect(
      sendWaiterOrderToKitchen(deps, { tableId: TABLE, items })
    ).rejects.toThrow("dexie constraint")
  })
})
