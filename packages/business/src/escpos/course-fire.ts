import { EscPosBuilder, type TicketBuilderOptions } from "./builder"
import type { CodepageName } from "./encoding"
import { DEFAULT_TICKET_TIMEZONE } from "./order-ticket"

// ============================================================================
// «MARCHA PRINCIPAL» — ticket corto de la marcha del mozo
// ============================================================================
// La cocina ya tiene los platos (salieron en la comanda con «EN ESPERA»). La
// marcha no los repite: aviso grande, mesa, orden, cuántos platos marchan y
// quién marchó. Compartido server ↔ POS (etapa 4 del POS offline).
// ============================================================================

const FIRE_LABEL: Record<string, string> = { entrada: "ENTRADA", principal: "PRINCIPAL", postre: "POSTRE" }

export interface FirePrinter {
  _id?: unknown
  name: string
  paperWidth?: number
  codepage?: CodepageName
  roles?: string[]
}

export interface FireOrder {
  orderNumber: string
  posTableNumber?: number | null
  items: { itemType?: string; course?: string | null; printRole?: string | null; quantity: number }[]
}

export function buildCourseFireTicket<B extends EscPosBuilder = EscPosBuilder>(
  args: {
    course: string
    order: FireOrder
    printer: FirePrinter
    plates: number
    firedBy?: string | null
    at: Date
    timezone?: string
  },
  createBuilder: (opts: TicketBuilderOptions) => B = (opts) => new EscPosBuilder(opts) as B
): B {
  const { course, order, printer, plates, firedBy, at } = args
  const t = createBuilder({
    paperWidth: printer.paperWidth === 58 ? 384 : 576,
    fontSize: "large",
    codepage: printer.codepage,
  })
  t.ruleDouble()
  t.text("MARCHA", { bold: true, size: "triple", align: "center" })
  t.text(FIRE_LABEL[course] ?? course.toUpperCase(), { bold: true, size: "triple", align: "center" })
  t.ruleDouble()
  if (typeof order.posTableNumber === "number") {
    t.text(`MESA ${order.posTableNumber}`, { bold: true, size: "triple", align: "center" })
  }
  t.text(`Orden ${order.orderNumber}`, { align: "center", size: "normal" })
  t.text(`${plates} plato${plates === 1 ? "" : "s"} en espera`, { align: "center", bold: true })
  const time = at.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: args.timezone || DEFAULT_TICKET_TIMEZONE })
  t.text(`${time} hs${firedBy ? ` - ${firedBy}` : ""}`, { align: "center", size: "normal" })
  t.cut()
  return t
}

/** Platos de ese tiempo que le tocan a la estación (cocina / barra). */
export function firePlatesFor(order: FireOrder, course: string, role: string): number {
  return order.items
    .filter((i) => i.itemType !== "combo" && i.course === course)
    .filter((i) => (role === "kitchen" ? !i.printRole || i.printRole === "kitchen" || i.printRole === "both" : i.printRole === "bar" || i.printRole === "both"))
    .reduce((s, i) => s + i.quantity, 0)
}
