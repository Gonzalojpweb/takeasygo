import { describe, it, expect } from 'vitest'
import { encodeEscPosText, EscPosBuilder, buildOrderTicket, type CodepageName } from '@takeasygo/business/escpos'
import { encodeText } from '@/lib/printing/encoding'
import { TicketBuilder } from '@/lib/printing/escpos-builder'

/**
 * POS offline V2 — etapa 4 (12/11/2026). El POS arma sin internet las
 * comandas con el builder compartido (tablas propias, sin iconv). Tienen que
 * salir los MISMOS bytes que arma el server con iconv-lite.
 */

const SAMPLES = [
  'Milanesa napolitana con papas',
  'ÁÉÍÓÚ áéíóú ñÑ üÜ ¿¡ ºª',
  '“Comillas” ‘simples’ – guion — largo…',
  'Emoji 🍕 y € euro ¢ £ ¥',
  'Ç ç ß Ø ø ã Ã õ Õ',
  'Tab\tLF? ~ ^ `',
]

describe('codificación compartida = iconv', () => {
  for (const cp of ['cp437', 'cp850', 'cp858'] as CodepageName[]) {
    it(`${cp}: mismos bytes`, () => {
      for (const s of SAMPLES) expect([...encodeEscPosText(s, cp)]).toEqual([...encodeText(s, cp)])
      // Todo el rango latino y los cuadros, de a un carácter.
      for (let c = 0x20; c < 0x2600; c++) {
        const ch = String.fromCharCode(c)
        expect([...encodeEscPosText(ch, cp)], `U+${c.toString(16)}`).toEqual([...encodeText(ch, cp)])
      }
    })
  }
})

describe('comanda compartida = comanda del server', () => {
  it('el builder del POS y el del server dan el mismo ticket', () => {
    const order = {
      orderNumber: 'TGO-12', status: 'confirmed', total: 1_800_000, createdAt: '2026-11-12T23:10:00.000Z', posTableNumber: 5,
      heldCourses: ['principal'],
      items: [
        { name: 'Empanada de carne', basePrice: 150000, price: 150000, quantity: 3, subtotal: 450000, course: 'entrada' as const, printRole: 'kitchen', categoryName: 'Entradas' },
        { name: 'Ñoquis con salsa', basePrice: 900000, price: 900000, quantity: 1, subtotal: 900000, course: 'principal' as const, printRole: 'kitchen', notes: 'sin queso', customizations: [{ groupName: 'Modificadores', selectedOptions: [{ name: 'Extra salsa' }] }] },
        { name: 'Agua', basePrice: 450000, price: 450000, quantity: 1, subtotal: 450000, printRole: 'bar' },
      ],
    }
    const printer = { name: 'Cocina', paperWidth: 80, roles: ['kitchen'] }
    const shared = buildOrderTicket(order, printer, 'kitchen')!
    const server = buildOrderTicket(order, printer, 'kitchen', {}, (o) => new TicketBuilder(o))!
    expect(shared).toBeInstanceOf(EscPosBuilder)
    expect([...shared.toBytes()]).toEqual([...server.toBuffer()])
  })
})
