// ============================================================================
// Ítems de Mercado Pago (lib/payments/mp-items.ts)
// ============================================================================
// Bug 14/11/2026: los combos de Keke Larry llegaban al carrito y nunca se
// cobraban. Las líneas a $0 de los platos del combo viajaban a MP, que
// rechazaba la preferencia, y el pedido se cancelaba al pagar.
// ============================================================================

import { describe, it, expect } from 'vitest'
import { buildMpItems } from '@/lib/payments/mp-items'
import { buildOnlineComboLines } from '@/lib/combos/online-lines'

const BURGER = '64b0000000000000000000b1'
const CRISPY = '64b0000000000000000000b2'

function comboOrderLines() {
  return buildOnlineComboLines({
    combo: { _id: '64b0000000000000000000c1', name: 'DOS BESTIAS', isActive: true, visibility: 'both', minItems: 2, maxItems: 2, allowRepeat: false, itemPool: [BURGER, CRISPY], priceMode: 'fixed', fixedPrice: 1_700_000 },
    units: [{ menuItemId: BURGER }, { menuItemId: CRISPY }],
    quantity: 1,
    mode: 'takeaway',
    menuItemMap: new Map<string, any>([
      [BURGER, { _id: BURGER, name: 'Tyron', price: 1_000_000 }],
      [CRISPY, { _id: CRISPY, name: 'Crispy', price: 900_000 }],
    ]),
    timezone: 'America/Argentina/Buenos_Aires',
    resolveCustomizations: () => ({ resolved: [], extraPrice: 0 }),
  })
}

describe('buildMpItems', () => {
  it('un combo viaja como UNA línea con su precio; los platos a $0 no se mandan', () => {
    const lines = comboOrderLines()
    expect(lines.filter((l) => l.price === 0)).toHaveLength(2) // así se guarda el pedido
    const items = buildMpItems({ items: lines })
    expect(items).toEqual([{ id: expect.any(String), title: 'DOS BESTIAS', quantity: 1, unit_price: 1_700_000, currency_id: 'ARS' }])
    expect(items.every((i) => i.unit_price > 0)).toBe(true)
  })

  it('combo + plato suelto + premio del club: suma el total y ningún ítem en cero', () => {
    const items = buildMpItems({
      items: [
        ...comboOrderLines(),
        { menuItemId: BURGER, name: 'Tyron', quantity: 2, price: 1_000_000, subtotal: 2_000_000, itemType: 'menuItem' },
        { menuItemId: CRISPY, name: 'Premio: Crispy', quantity: 1, price: 0, subtotal: 0, itemType: 'reward' },
      ],
      orderMode: 'delivery',
      deliveryCost: 150_000,
    })
    expect(items.map((i) => i.title)).toEqual(['DOS BESTIAS', 'Tyron', 'Costo de envío'])
    expect(items.reduce((s, i) => s + i.unit_price * i.quantity, 0)).toBe(1_700_000 + 2_000_000 + 150_000)
  })

  it('descuento QR: no toca el combo (igual que al calcularlo en el pedido)', () => {
    const items = buildMpItems({
      items: [...comboOrderLines(), { menuItemId: BURGER, name: 'Tyron', quantity: 1, price: 1_000_000, subtotal: 1_000_000, itemType: 'menuItem' }],
      qrPromoApplied: true,
      discountAmount: 100_000,
    })
    expect(items.find((i) => i.title === 'DOS BESTIAS')!.unit_price).toBe(1_700_000)
    expect(items.find((i) => i.title === 'Tyron')!.unit_price).toBe(900_000)
  })
})
