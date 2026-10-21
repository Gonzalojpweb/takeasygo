import { describe, it, expect, beforeEach } from "vitest"
import { applyPosLocation, LocationSwitchBlockedError, type LocationSwitchDb } from "../services/location-switch"

/**
 * Cambio de sede del POS: limpia las cachés de la sede anterior y nunca
 * descarta eventos offline sin sincronizar.
 */

type Row = { tenantId: string; status?: string }

function table(rows: Row[]) {
  return {
    rows,
    where: () => ({
      equals: (tenantId: string) => ({
        delete: async () => {
          const before = rows.length
          for (let i = rows.length - 1; i >= 0; i--) if (rows[i].tenantId === tenantId) rows.splice(i, 1)
          return before - rows.length
        },
        toArray: async () => rows.filter(r => r.tenantId === tenantId),
      }),
    }),
  }
}

let config: Record<string, { locationId?: string }>
let tables: Record<string, ReturnType<typeof table>>
let menu: Record<string, unknown>
let db: LocationSwitchDb

beforeEach(() => {
  config = { T1: { locationId: "SEDE-A" } }
  tables = {
    diningTable: table([{ tenantId: "T1" }, { tenantId: "T2" }]),
    orders: table([{ tenantId: "T1" }]),
    commands: table([{ tenantId: "T1" }]),
    cashRegister: table([{ tenantId: "T1" }]),
    pendingMovements: table([{ tenantId: "T1" }]),
    pendingStatusUpdates: table([{ tenantId: "T1" }]),
    pendingEvents: table([{ tenantId: "T1", status: "synced" }]),
  }
  menu = { T1: { products: [] } }
  db = {
    tenantConfig: {
      get: async (id: string) => config[id],
      update: async (id: string, changes: { locationId?: string }) => {
        config[id] = { ...config[id], ...changes }
        return 1
      },
    },
    pendingEvents: tables.pendingEvents as unknown as LocationSwitchDb["pendingEvents"],
    diningTable: tables.diningTable,
    orders: tables.orders,
    commands: tables.commands,
    cashRegister: tables.cashRegister,
    pendingMovements: tables.pendingMovements,
    pendingStatusUpdates: tables.pendingStatusUpdates,
    menuSnapshot: { delete: async (id: string) => { delete menu[id] } },
  } as unknown as LocationSwitchDb
})

describe("applyPosLocation", () => {
  it("misma sede: no limpia nada", async () => {
    expect(await applyPosLocation(db, "T1", "SEDE-A")).toBe(false)
    expect(tables.orders.rows).toHaveLength(1)
  })

  it("cambio de sede: limpia las cachés del tenant y guarda la sede nueva", async () => {
    expect(await applyPosLocation(db, "T1", "SEDE-B")).toBe(true)
    for (const name of ["diningTable", "orders", "commands", "cashRegister", "pendingMovements", "pendingStatusUpdates"]) {
      expect(tables[name].rows.filter(r => r.tenantId === "T1"), name).toHaveLength(0)
    }
    expect(tables.diningTable.rows).toHaveLength(1) // otro tenant intacto
    expect(menu.T1).toBeUndefined()
    expect(config.T1.locationId).toBe("SEDE-B")
  })

  it("con ventas offline sin sincronizar bloquea el cambio y no borra nada", async () => {
    tables.pendingEvents.rows.push({ tenantId: "T1", status: "pending" })
    await expect(applyPosLocation(db, "T1", "SEDE-B")).rejects.toBeInstanceOf(LocationSwitchBlockedError)
    expect(tables.orders.rows).toHaveLength(1)
    expect(config.T1.locationId).toBe("SEDE-A")
  })

  it("primera sede (sin sede previa): solo la guarda", async () => {
    config.T1 = {}
    expect(await applyPosLocation(db, "T1", "SEDE-A")).toBe(false)
    expect(tables.orders.rows).toHaveLength(1)
    expect(config.T1.locationId).toBe("SEDE-A")
  })
})
