import { EscPosBuilder, type TicketBuilderOptions } from "./builder"
import { DEFAULT_TICKET_TIMEZONE } from "./order-ticket"
import type { FireOrder, FirePrinter } from "./course-fire"

// ============================================================================
// «ANULADA» — aviso corto a cocina/barra cuando se anula una mesa (19/11/2026)
// ============================================================================
// La comanda ya salió: si la mesa se anula, la estación tiene que enterarse
// para no seguir preparando. Aviso grande, mesa, orden y los platos que le
// tocaban a esa estación (para identificar qué frenar), motivo y quién.
// ============================================================================

export interface VoidTicketItem {
  itemType?: string
  printRole?: string | null
  quantity: number
  name: string
}

/** Platos de la ronda que le tocan a la estación (cocina / barra). */
export function voidItemsFor(items: VoidTicketItem[], role: string): VoidTicketItem[] {
  return items
    .filter((i) => i.itemType !== "combo")
    .filter((i) => (role === "kitchen" ? !i.printRole || i.printRole === "kitchen" || i.printRole === "both" : i.printRole === "bar" || i.printRole === "both"))
}

export function buildOrderVoidTicket<B extends EscPosBuilder = EscPosBuilder>(
  args: {
    order: Pick<FireOrder, "orderNumber" | "posTableNumber">
    items: VoidTicketItem[]
    printer: FirePrinter
    reasonLabel: string
    by?: string | null
    at: Date
    timezone?: string
  },
  createBuilder: (opts: TicketBuilderOptions) => B = (opts) => new EscPosBuilder(opts) as B
): B {
  const { order, items, printer, reasonLabel, by, at } = args
  const t = createBuilder({
    paperWidth: printer.paperWidth === 58 ? 384 : 576,
    fontSize: "large",
    codepage: printer.codepage,
  })
  t.ruleDouble()
  t.text("ANULADA", { bold: true, size: "triple", align: "center" })
  t.text("NO PREPARAR", { bold: true, align: "center" })
  t.ruleDouble()
  if (typeof order.posTableNumber === "number") {
    t.text(`MESA ${order.posTableNumber}`, { bold: true, size: "triple", align: "center" })
  }
  t.text(`Orden ${order.orderNumber}`, { align: "center", size: "normal" })
  t.rule()
  for (const item of items) t.text(`${item.quantity}x ${item.name.toUpperCase()}`, { bold: true })
  t.rule()
  t.text(`Motivo: ${reasonLabel}`, { size: "normal" })
  const time = at.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: args.timezone || DEFAULT_TICKET_TIMEZONE })
  t.text(`${time} hs${by ? ` - ${by}` : ""}`, { align: "center", size: "normal" })
  t.cut()
  return t
}
