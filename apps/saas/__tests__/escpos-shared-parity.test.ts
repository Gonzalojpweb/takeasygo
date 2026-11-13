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

/**
 * Etapa 5: el ticket fiscal, el QR y la precuenta también se comparten. Se
 * rearma el buffer con el código anterior del server (iconv cp858) sobre las
 * mismas líneas y tiene que dar los mismos bytes.
 */
import iconv from 'iconv-lite'
import { buildFiscalTicketBytes, fiscalTicketLines, escposQrBytes, linesToEscPosBytes, precuentaLines, arcaQrUrl } from '@takeasygo/business/escpos'

const legacyEnc = (t: string) => iconv.encode(t.replace(/[^\u0000-ÿ€]/g, ''), 'cp858')

describe('ticket fiscal y precuenta compartidos = server anterior', () => {
  const doc = {
    kind: 'invoice' as const, letter: 'B', cbteTipo: 6, pointOfSale: 90, number: 7, issuedAt: '2026-11-12T23:30:00.000Z',
    receiver: { name: 'José Núñez', condition: 'consumidor_final' as const, docType: 96, docNumber: '30111222' },
    lines: [{ quantity: 2, description: 'Ñoquis «caseros» – 500 g', totalCents: 1_800_000 }, { quantity: 1, description: 'Café ☕', totalCents: 250_000 }],
    amounts: { netCents: 1_694_215, ivaCents: 355_785, exemptCents: 0, totalCents: 2_050_000 },
    ivaGroups: [{ ivaRate: 21, amountCents: 355_785 }],
    authMode: 'caea', cae: '31234567890123', caeExpiresAt: '2026-11-15T00:00:00.000Z', environment: 'homologation',
    qrUrl: arcaQrUrl({ issuedAt: new Date('2026-11-12T23:30:00Z'), cuit: '30712345674', pointOfSale: 90, cbteTipo: 6, number: 7, totalCents: 2_050_000, docType: 96, docNumber: '30111222', cae: '31234567890123', authType: 'A' }),
  }
  const issuer = { legalName: 'Qué Cachapa S.R.L.', cuit: '30712345674', fiscalAddress: 'Av. Gaona 1344', grossIncomeNumber: '901-1', activityStartDate: '2020-03-01T00:00:00.000Z', ivaCondition: 'responsable_inscripto' as const }

  it('factura: mismos bytes que el buffer anterior', () => {
    const lines = fiscalTicketLines(doc, issuer, 32, { sale: { orderNumber: 'SR-AB12', tableNumber: 5, payments: [{ method: 'cash', amountCents: 2_100_000 }] } })
    const chunks: Buffer[] = [Buffer.from([0x1b, 0x40]), Buffer.from([0x1b, 0x74, 43]), Buffer.from([0x1b, 0x61, 0x01]), Buffer.from([0x1b, 0x45, 0x01])]
    const headerEnd = lines.indexOf('-'.repeat(32))
    lines.forEach((text, i) => {
      if (i === headerEnd) chunks.push(Buffer.from([0x1b, 0x45, 0x00]), Buffer.from([0x1b, 0x61, 0x00]))
      const isType = text.startsWith('FACTURA') || text.startsWith('NOTA DE CREDITO')
      if (isType) chunks.push(Buffer.from([0x1b, 0x61, 0x01]), Buffer.from([0x1d, 0x21, 0x11]), Buffer.from([0x1b, 0x45, 0x01]))
      chunks.push(legacyEnc(`${text}\n`))
      if (isType) chunks.push(Buffer.from([0x1d, 0x21, 0x00]), Buffer.from([0x1b, 0x45, 0x00]), Buffer.from([0x1b, 0x61, 0x00]))
    })
    chunks.push(Buffer.from([0x1b, 0x61, 0x01]), legacyEnc('\n'), Buffer.from(escposQrBytes(doc.qrUrl)), legacyEnc('\n'), legacyEnc('\n\n'), Buffer.from([0x1d, 0x56, 0x01]))
    const shared = buildFiscalTicketBytes(doc, issuer, 32, { sale: { orderNumber: 'SR-AB12', tableNumber: 5, payments: [{ method: 'cash', amountCents: 2_100_000 }] } })
    expect([...shared]).toEqual([...Buffer.concat(chunks)])
    expect(lines).toContain('CAEA 31234567890123')
    expect(JSON.parse(Buffer.from(doc.qrUrl.split('?p=')[1], 'base64').toString())).toMatchObject({ tipoCodAut: 'A', codAut: 31234567890123 })
  })

  it('precuenta: mismos bytes que escPosFromLines anterior', () => {
    const lines = precuentaLines({ locationName: 'Qué Cachapa', tableNumber: 5, guests: 3, items: [{ name: 'Arepa reina', quantity: 2, subtotal: 900_000, discountCents: 100_000 }], at: new Date('2026-11-12T23:30:00Z'), columns: 48 })
    const chunks: Buffer[] = [Buffer.from([0x1b, 0x40]), Buffer.from([0x1b, 0x74, 43]), Buffer.from([0x1b, 0x33, 36])]
    for (const line of lines) {
      chunks.push(line.center ? Buffer.from([0x1b, 0x61, 0x01]) : Buffer.from([0x1b, 0x61, 0x00]))
      if (line.large) chunks.push(Buffer.from([0x1d, 0x21, 0x11]))
      if (line.bold) chunks.push(Buffer.from([0x1b, 0x45, 0x01]))
      chunks.push(legacyEnc(`${line.text}\n`))
      if (line.bold) chunks.push(Buffer.from([0x1b, 0x45, 0x00]))
      if (line.large) chunks.push(Buffer.from([0x1d, 0x21, 0x00]))
    }
    chunks.push(legacyEnc('\n\n'), Buffer.from([0x1d, 0x56, 0x01]))
    expect([...linesToEscPosBytes(lines)]).toEqual([...Buffer.concat(chunks)])
  })
})
