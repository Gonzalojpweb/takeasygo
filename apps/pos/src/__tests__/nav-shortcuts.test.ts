import { describe, it, expect } from "vitest"
import { contextsForRole } from "../components/layout/contexts"
import { MOBILE_SHORTCUTS, TABLET_SHORTCUTS, splitNav } from "../components/layout/navShortcuts"

// Obs. UX 30/10: en celular y tablet, atajos + «Más».
describe("splitNav", () => {
  it("admin en celular: 5 atajos por prioridad, el resto en «Más»", () => {
    const { shortcuts, overflow } = splitNav(contextsForRole("admin"), MOBILE_SHORTCUTS)
    expect(shortcuts.map((c) => c.id)).toEqual(["counter", "resumen", "waiter", "caja", "ventas"])
    expect(overflow.map((c) => c.id)).toEqual(["flota", "facturacion", "config", "clientes", "usuario"])
  })

  it("admin en tablet: 6 atajos", () => {
    const { shortcuts } = splitNav(contextsForRole("admin"), TABLET_SHORTCUTS)
    expect(shortcuts).toHaveLength(6)
    expect(shortcuts.map((c) => c.id)).toContain("flota")
  })

  it("cajero: sin Ventas ni Configuración, los atajos siguen siendo los más usados", () => {
    const { shortcuts, overflow } = splitNav(contextsForRole("cashier"), MOBILE_SHORTCUTS)
    expect(shortcuts.map((c) => c.id)).toEqual(["counter", "resumen", "waiter", "flota", "caja"])
    expect(overflow.map((c) => c.id)).toEqual(["facturacion", "clientes", "usuario"])
  })

  it("mozo (2 contextos): no hace falta «Más»", () => {
    const { shortcuts, overflow } = splitNav(contextsForRole("waiter"), MOBILE_SHORTCUTS)
    expect(shortcuts.map((c) => c.id)).toEqual(["waiter", "usuario"])
    expect(overflow).toEqual([])
  })

  it("si sobra uno solo, se muestra en vez de «Más»", () => {
    const six = contextsForRole("admin").slice(0, 6)
    expect(splitNav(six, MOBILE_SHORTCUTS).overflow).toEqual([])
  })
})
