import { describe, it, expect } from 'vitest'
import { itemModifiersForPos, orderDisplayForPos } from '@/lib/order-side-effects'

// Pedidos App (30/10/2026): lo que viaja al POS para atender el pedido.
describe('itemModifiersForPos', () => {
  it('variante y opciones (con subgrupos) como texto, a precio 0', () => {
    const mods = itemModifiersForPos({
      name: 'Kheburger', quantity: 1, price: 1800000, subtotal: 1800000,
      selectedVariant: { name: 'Doble' },
      customizations: [
        { groupName: 'Carne', selectedOptions: [{ name: 'Jugosa' }] },
        { groupName: 'Guarnición', selectedOptions: [{ name: 'Ensalada', subGroups: [{ groupName: 'Aderezo', selectedOptions: [{ name: 'Limón' }] }] }] },
      ],
    })
    expect(mods).toEqual([
      { name: 'Variante: Doble', price: 0 },
      { name: 'Carne: Jugosa', price: 0 },
      { name: 'Guarnición: Ensalada', price: 0 },
      { name: 'Aderezo: Limón', price: 0 },
    ])
  })

  it('sin opciones → vacío', () => {
    expect(itemModifiersForPos({ name: 'Agua', quantity: 1, price: 100, subtotal: 100 })).toEqual([])
  })
})

describe('orderDisplayForPos', () => {
  const customer = { name: 'Lucía Fernández', phone: '+5491158234410', email: 'x@y.z' }
  const deliveryAddress = { street: 'Av. Corrientes', number: '4521', apt: '3° B', city: 'CABA', coordinates: { lat: 0, lng: 0 } }

  it('delivery: número, cliente y dirección armada', () => {
    expect(orderDisplayForPos({ orderNumber: 'A-1043', customer, orderMode: 'delivery', deliveryAddress } as never)).toEqual({
      orderNumber: 'A-1043', customerName: 'Lucía Fernández', customerPhone: '+5491158234410', deliveryAddress: 'Av. Corrientes 4521, 3° B, CABA',
    })
  })

  it('para llevar: sin dirección; nunca el email', () => {
    const d = orderDisplayForPos({ orderNumber: 'A-1044', customer, orderMode: 'takeaway', deliveryAddress } as never)
    expect(d.deliveryAddress).toBeUndefined()
    expect(JSON.stringify(d)).not.toContain('@')
  })
})
