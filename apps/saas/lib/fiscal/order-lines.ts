import mongoose from 'mongoose'
import Menu from '@/models/Menu'
import { resolveIvaRate, type FiscalLine, type IvaRatePct } from '@takeasygo/business'

// ============================================================================
// Líneas fiscales de una orden (Fase 5 de caja, 2026-10)
// ============================================================================
// Convierte una orden en líneas con su alícuota para el desglose de IVA:
//   · ítems: alícuota del producto → categoría → comercio (se buscan en la
//     carta de la sede de la orden por menuItemId);
//   · envío: alícuota general del comercio;
//   · descuentos: el total de la orden manda. Si los ítems + envío superan el
//     total, la diferencia es descuento (se reparte por alícuota); si quedan
//     por debajo (recargo), se agrega una línea «Recargo» a la general.
// Invariante: la suma de las líneas − descuento = total de la orden, siempre.
// ============================================================================

export interface OrderForFiscal {
  locationId: mongoose.Types.ObjectId | string
  total: number
  deliveryCost?: number | null
  items: { menuItemId?: mongoose.Types.ObjectId | string | null; name: string; quantity: number; subtotal: number }[]
}

export interface FiscalLines {
  lines: (FiscalLine & { description: string; quantity: number })[]
  discountCents: number
}

interface MenuLean {
  categories: {
    ivaRate?: number | null
    items: { _id: mongoose.Types.ObjectId; ivaRate?: number | null }[]
    subcategories?: { items: { _id: mongoose.Types.ObjectId; ivaRate?: number | null }[] }[]
  }[]
}

/** Mapa menuItemId → alícuota efectiva, para la carta de una sede. */
export async function ivaRatesForLocation(
  tenantId: mongoose.Types.ObjectId | string,
  locationId: mongoose.Types.ObjectId | string,
  defaultRate: number
): Promise<Map<string, IvaRatePct>> {
  const menu = await Menu.findOne({ tenantId, locationId })
    .select('categories.ivaRate categories.items._id categories.items.ivaRate categories.subcategories.items._id categories.subcategories.items.ivaRate')
    .lean<MenuLean>()
  const rates = new Map<string, IvaRatePct>()
  for (const category of menu?.categories ?? []) {
    const items = [...(category.items ?? []), ...(category.subcategories ?? []).flatMap((s) => s.items ?? [])]
    for (const item of items) rates.set(String(item._id), resolveIvaRate(item.ivaRate, category.ivaRate, defaultRate))
  }
  return rates
}

export function buildFiscalLines(order: OrderForFiscal, rates: Map<string, IvaRatePct>, defaultRate: number): FiscalLines {
  const fallback = resolveIvaRate(null, null, defaultRate)
  const lines: FiscalLines['lines'] = order.items
    .filter((i) => i.subtotal > 0)
    .map((i) => ({
      description: i.name.slice(0, 200),
      quantity: i.quantity,
      grossCents: i.subtotal,
      ivaRate: (i.menuItemId && rates.get(String(i.menuItemId))) || fallback,
    }))
  const delivery = order.deliveryCost ?? 0
  if (delivery > 0) lines.push({ description: 'Envío', quantity: 1, grossCents: delivery, ivaRate: fallback })

  const sum = lines.reduce((s, l) => s + l.grossCents, 0)
  if (sum < order.total) {
    lines.push({ description: 'Recargo', quantity: 1, grossCents: order.total - sum, ivaRate: fallback })
    return { lines, discountCents: 0 }
  }
  return { lines, discountCents: sum - order.total }
}
