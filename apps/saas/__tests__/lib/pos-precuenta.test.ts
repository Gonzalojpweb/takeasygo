import { describe, it, expect } from 'vitest'
import { precuentaLines } from '@/lib/pos-online/precuenta'

/** Fase E (2026-10): precuenta de la mesa — contenido del ticket. */
const base = {
  locationName: 'Local Centro',
  tableNumber: 4,
  guests: 2,
  at: new Date('2026-10-24T23:30:00Z'),
  columns: 32,
}

describe('precuentaLines', () => {
  it('lista platos, descuentos, total, por persona y aclara que no es factura', () => {
    const lines = precuentaLines({
      ...base,
      items: [
        { name: 'Milanesa', quantity: 2, subtotal: 16200, discountCents: 1800 },
        { name: 'Agua', quantity: 1, subtotal: 2000, discountCents: 0 },
      ],
    })
    const text = lines.map((l) => l.text).join('\n')
    expect(text).toContain('PRECUENTA')
    expect(text).toContain('Mesa 4 - 2 comensales')
    expect(text).toMatch(/2x Milanesa\s+\$180,00/)
    expect(text).toMatch(/Descuento\s+-\$18,00/)
    expect(text).toMatch(/TOTAL\s+\$182,00/)
    expect(text).toMatch(/Por persona \(2\)\s+\$91,00/)
    expect(text).toContain('NO VALIDO COMO FACTURA')
    expect(lines.every((l) => l.text.length <= 32)).toBe(true)
  })

  it('sin descuentos no imprime subtotal ni descuentos; 1 comensal sin «por persona»', () => {
    const text = precuentaLines({ ...base, guests: 1, items: [{ name: 'Café', quantity: 1, subtotal: 1500, discountCents: 0 }] })
      .map((l) => l.text)
      .join('\n')
    expect(text).not.toContain('Descuentos')
    expect(text).not.toContain('Por persona')
  })
})
