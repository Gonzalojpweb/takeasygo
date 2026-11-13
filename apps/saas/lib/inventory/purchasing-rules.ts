// ============================================================================
// purchasing-rules.ts — Compras (F2): reglas puras, sin DB
// ============================================================================

export type PoStatus = 'draft' | 'sent' | 'partial' | 'received' | 'cancelled'
export type PoAction = 'update' | 'send' | 'receive' | 'close' | 'cancel'

interface AllocationLike { quantity: number; received: number }
interface LineLike { unitCostCents: number | null; allocations: AllocationLike[] }

const FROM: Record<PoAction, PoStatus[]> = {
  update: ['draft'],
  send: ['draft'],
  receive: ['sent', 'partial'],
  close: ['partial'],
  cancel: ['draft', 'sent'],
}

export function canPoTransition(status: PoStatus, action: PoAction): boolean {
  return FROM[action].includes(status)
}

/** Después de una recepción: todo llegó → recibida; algo llegó → parcial. */
export function statusAfterReceipt(lines: LineLike[]): 'partial' | 'received' {
  const all = lines.every((l) => l.allocations.every((a) => a.received >= a.quantity - 1e-9))
  return all ? 'received' : 'partial'
}

export const round3 = (n: number) => Math.round(n * 1000) / 1000

export function lineQuantity(l: LineLike): { ordered: number; received: number } {
  return {
    ordered: round3(l.allocations.reduce((s, a) => s + a.quantity, 0)),
    received: round3(l.allocations.reduce((s, a) => s + a.received, 0)),
  }
}

/** Total esperado de la orden (centavos); las líneas sin precio no suman. */
export function orderTotalCents(lines: LineLike[]): { totalCents: number; unpricedLines: number } {
  let total = 0
  let unpriced = 0
  for (const l of lines) {
    if (l.unitCostCents === null) { unpriced++; continue }
    total += lineQuantity(l).ordered * l.unitCostCents
  }
  return { totalCents: Math.round(total), unpricedLines: unpriced }
}

/** Clave para que «Distribuidora Pérez» y «distribuidora  perez» sean el mismo proveedor. */
export function supplierNameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const UNIT_TEXT: Record<string, string> = { kg: 'kg', g: 'g', l: 'l', ml: 'ml', unit: 'u.' }
const fmtQty = (n: number, unit: string) => `${n.toLocaleString('es-AR', { maximumFractionDigits: 3 })} ${UNIT_TEXT[unit] ?? unit}`

/**
 * Texto del pedido para mandar por WhatsApp o copiar. Sin precios (el
 * proveedor cotiza); con la entrega por sede si hay más de una.
 */
export function supplierMessage(input: {
  businessName: string
  number: number
  supplierContact: string | null
  expectedAt: Date | null
  note: string | null
  lines: Array<{ name: string; unit: string; allocations: Array<{ locationName: string; quantity: number }> }>
}): string {
  const sedes = new Set(input.lines.flatMap((l) => l.allocations.filter((a) => a.quantity > 0).map((a) => a.locationName)))
  const out: string[] = []
  out.push(`Hola${input.supplierContact ? ` ${input.supplierContact}` : ''}, te paso el pedido N.º ${input.number} de ${input.businessName}:`)
  out.push('')
  for (const l of input.lines) {
    const total = l.allocations.reduce((s, a) => s + a.quantity, 0)
    if (total <= 0) continue
    out.push(`• ${l.name}: ${fmtQty(total, l.unit)}`)
    if (sedes.size > 1) for (const a of l.allocations) if (a.quantity > 0) out.push(`   – ${a.locationName}: ${fmtQty(a.quantity, l.unit)}`)
  }
  if (input.expectedAt) {
    out.push('')
    out.push(`Para el ${input.expectedAt.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Argentina/Buenos_Aires' })}.`)
  }
  if (input.note) {
    out.push('')
    out.push(input.note)
  }
  out.push('')
  out.push('¡Gracias!')
  return out.join('\n')
}

/** Link de WhatsApp con el texto (solo dígitos del teléfono). null si no hay teléfono. */
export function whatsappLink(phone: string | null, text: string): string | null {
  const digits = String(phone ?? '').replace(/\D/g, '')
  if (digits.length < 8) return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}
