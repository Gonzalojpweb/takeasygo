import { describe, it, expect } from "vitest"
import type { Order } from "@takeasygo/types"
import { summarizeTableActivity, formatElapsed } from "../hooks/useTableActivity"
import { contextsForRole } from "../components/layout/contexts"
import { clampPanelWidth, PANEL_MIN } from "../components/layout/PanelResizer"
import { hasOpenDialog, isTypingBlocker } from "../hooks/useEscapeBack"

/**
 * ROS — la Mesa muestra "nombre, estado, tiempo o monto" (Counter v2 §4).
 * Como la Mesa no guarda apertura ni monto, se derivan de sus órdenes POS
 * abiertas (BDL: "Una Mesa contiene Pedidos").
 */

function order(partial: Partial<Order>): Order {
  return {
    id: crypto.randomUUID(),
    tenantId: "t",
    source: "pos",
    status: "confirmed",
    items: [],
    total: 0,
    menuVersion: 1,
    createdAt: new Date("2026-10-21T20:00:00Z"),
    updatedAt: new Date("2026-10-21T20:00:00Z"),
    ...partial,
  }
}

describe("summarizeTableActivity", () => {
  it("suma las rondas abiertas, toma la primera como apertura y separa lo cobrado", () => {
    const map = summarizeTableActivity([
      order({ tableId: "m1", total: 1000, createdAt: new Date("2026-10-21T20:10:00Z") }),
      order({ tableId: "m1", total: 500, createdAt: new Date("2026-10-21T20:00:00Z"), payments: [{ method: "cash", amount: 500 }] }),
      order({ tableId: "m2", total: 700 }),
    ])
    expect(map.get("m1")).toEqual({
      total: 1500,
      unpaid: 1000,
      openedAt: new Date("2026-10-21T20:00:00Z"),
      rounds: 2,
      // 30/10: sin hora de comanda informada, se usa la de creación.
      kitchenSince: new Date("2026-10-21T20:00:00Z"),
    })
    expect(map.get("m2")?.rounds).toBe(1)
  })

  it("en cocina: la comanda más vieja sin terminar; lo pendiente de mandar y lo listo no cuentan", () => {
    const map = summarizeTableActivity([
      order({ tableId: "m1", status: "pending", createdAt: new Date("2026-10-21T19:00:00Z") }),
      order({ tableId: "m1", status: "ready", createdAt: new Date("2026-10-21T19:10:00Z") }),
      order({ tableId: "m1", status: "preparing", createdAt: new Date("2026-10-21T19:20:00Z"), sentToKitchenAt: "2026-10-21T19:25:00Z" }),
      order({ tableId: "m1", status: "confirmed", createdAt: new Date("2026-10-21T19:40:00Z"), sentToKitchenAt: new Date("2026-10-21T19:41:00Z") }),
      order({ tableId: "m2", status: "pending" }),
    ])
    expect(map.get("m1")?.kitchenSince).toEqual(new Date("2026-10-21T19:25:00Z"))
    expect(map.get("m2")?.kitchenSince).toBeNull()
  })

  it("ignora órdenes cerradas, sin mesa o que no son del POS", () => {
    const map = summarizeTableActivity([
      order({ tableId: "m1", status: "delivered", total: 1 }),
      order({ tableId: "m1", status: "cancelled", total: 1 }),
      order({ total: 1 }),
      order({ tableId: "m1", source: "external", total: 1 }),
    ])
    expect(map.size).toBe(0)
  })
})

describe("formatElapsed", () => {
  it("minutos y horas", () => {
    const from = new Date("2026-10-21T20:00:00Z")
    expect(formatElapsed(from, from.getTime() + 35 * 60_000)).toBe("35 min")
    expect(formatElapsed(from, from.getTime() + 65 * 60_000)).toBe("1 h 05 min")
  })
})

describe("contextsForRole (Operational Roles Matrix)", () => {
  it("el cajero no ve Ventas (reportes); manager y admin sí", () => {
    expect(contextsForRole("cashier").map((c) => c.id)).not.toContain("ventas")
    expect(contextsForRole("manager").map((c) => c.id)).toContain("ventas")
    expect(contextsForRole("admin").map((c) => c.id)).toContain("ventas")
  })

  it("el mozo ve el Salón y su perfil (celular); nada de caja, ventas ni configuración", () => {
    // Fase 3 (29/10): «Usuario» es personal (mi PIN, mis datos), no una de
    // las funciones compartidas de admin/encargado/caja (business/surfaces).
    expect(contextsForRole("waiter").map((c) => c.id)).toEqual(["waiter", "usuario"])
  })

  it("Configuración es de admin y encargado", () => {
    expect(contextsForRole("manager").map((c) => c.id)).toContain("config")
    expect(contextsForRole("cashier").map((c) => c.id)).not.toContain("config")
  })

  it("rol desconocido cae al mínimo (cajero), nunca a todo", () => {
    expect(contextsForRole(undefined).map((c) => c.id)).not.toContain("ventas")
    expect(contextsForRole("superhacker").map((c) => c.id)).not.toContain("ventas")
  })
})

describe("Fase L — contexto Facturación", () => {
  it("caja, encargado y admin facturan desde el POS; el mozo no", () => {
    for (const role of ["cashier", "manager", "admin"]) {
      expect(contextsForRole(role).map((c) => c.id)).toContain("facturacion")
    }
    expect(contextsForRole("waiter").map((c) => c.id)).not.toContain("facturacion")
  })
})

describe("Panel de detalle con ancho regulable (obs. UX 25/10)", () => {
  it("el ancho queda entre el mínimo y el máximo disponible", () => {
    expect(clampPanelWidth(100)).toBe(PANEL_MIN)
    expect(clampPanelWidth(500, 600)).toBe(500)
    expect(clampPanelWidth(900, 600)).toBe(600)
    expect(clampPanelWidth(412.6, 600)).toBe(413)
    // Pantalla chica: el máximo nunca baja del mínimo.
    expect(clampPanelWidth(400, 200)).toBe(PANEL_MIN)
  })
})

describe("Esc = volver: protecciones (obs. UX 25/10)", () => {
  // Tests en node (sin DOM): elementos simulados con lo que mira la función.
  const el = (tagName: string, extra: Record<string, unknown> = {}) => ({ tagName, isContentEditable: false, ...extra }) as unknown as Element
  it("no navega si se está escribiendo; un input vacío o un botón no bloquean", () => {
    expect(isTypingBlocker(el("INPUT", { type: "text", value: "mila" }))).toBe(true)
    expect(isTypingBlocker(el("INPUT", { type: "text", value: "" }))).toBe(false)
    expect(isTypingBlocker(el("TEXTAREA"))).toBe(true)
    expect(isTypingBlocker(el("SELECT"))).toBe(true)
    expect(isTypingBlocker(el("INPUT", { type: "checkbox", value: "on" }))).toBe(false)
    expect(isTypingBlocker(el("DIV", { isContentEditable: true }))).toBe(true)
    expect(isTypingBlocker(el("BUTTON"))).toBe(false)
    expect(isTypingBlocker(null)).toBe(false)
  })
  it("con un diálogo abierto (PIN, comensales, buscar cliente) el Esc es del diálogo", () => {
    const root = (found: boolean) => ({ querySelector: (sel: string) => (found && sel.includes('role="dialog"') ? {} : null) }) as unknown as ParentNode
    expect(hasOpenDialog(root(false))).toBe(false)
    expect(hasOpenDialog(root(true))).toBe(true)
  })
})
