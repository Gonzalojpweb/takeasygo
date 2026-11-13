// Etapa 5 (F2): compras — reglas puras.
import { describe, it, expect } from 'vitest'
import { canPoTransition, orderTotalCents, statusAfterReceipt, supplierMessage, supplierNameKey, whatsappLink } from '@/lib/inventory/purchasing-rules'

describe('purchasing-rules', () => {
  it('transiciones', () => {
    expect(canPoTransition('draft', 'send')).toBe(true)
    expect(canPoTransition('sent', 'update')).toBe(false)
    expect(canPoTransition('partial', 'receive')).toBe(true)
    expect(canPoTransition('partial', 'cancel')).toBe(false)
    expect(canPoTransition('received', 'receive')).toBe(false)
  })

  it('estado después de recibir y totales', () => {
    const lines = [
      { unitCostCents: 1000, allocations: [{ quantity: 6, received: 6 }, { quantity: 4, received: 0 }] },
      { unitCostCents: null, allocations: [{ quantity: 50, received: 50 }] },
    ]
    expect(statusAfterReceipt(lines)).toBe('partial')
    lines[0].allocations[1].received = 4
    expect(statusAfterReceipt(lines)).toBe('received')
    expect(orderTotalCents(lines)).toEqual({ totalCents: 10_000, unpricedLines: 1 })
  })

  it('nombre de proveedor sin acentos ni mayúsculas', () => {
    expect(supplierNameKey('  Distribuidora   PÉREZ ')).toBe('distribuidora perez')
  })

  it('texto del pedido con entrega por sede y link de WhatsApp', () => {
    const text = supplierMessage({
      businessName: 'La Esquina',
      number: 7,
      supplierContact: 'Marta',
      expectedAt: null,
      note: 'Antes de las 10',
      lines: [
        { name: 'Carne', unit: 'kg', allocations: [{ locationName: 'Centro', quantity: 6 }, { locationName: 'Norte', quantity: 4.5 }] },
        { name: 'Pan', unit: 'unit', allocations: [{ locationName: 'Centro', quantity: 50 }, { locationName: 'Norte', quantity: 0 }] },
      ],
    })
    expect(text).toContain('Hola Marta, te paso el pedido N.º 7 de La Esquina')
    expect(text).toContain('• Carne: 10,5 kg')
    expect(text).toContain('– Norte: 4,5 kg')
    expect(text).not.toContain('– Norte: 0')
    expect(text).toContain('Antes de las 10')
    expect(whatsappLink('+54 9 11 5555-1234', 'hola')).toBe('https://wa.me/5491155551234?text=hola')
    expect(whatsappLink('123', 'x')).toBeNull()
  })
})
