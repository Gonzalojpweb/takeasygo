import { describe, it, expect } from 'vitest'
import { buildFiscalLines } from '@/lib/fiscal/order-lines'
import { arcaQrPayload, arcaQrUrl } from '@/lib/fiscal/qr'
import { libroIvaCsv, libroIvaTotals, monthRange } from '@/lib/fiscal/libro-iva'
import { escposQr, fiscalTicketLines } from '@/lib/fiscal/ticket'
import { CF_IDENTIFICATION_THRESHOLD_CENTS, resolveReceiver } from '@/lib/fiscal/issue'
import { computeIvaBreakdown } from '@takeasygo/business'
import type { IFiscalDocument } from '@/models/FiscalDocument'

/**
 * Fase 5 — piezas puras de la emisión.
 * Docs: ADMIN/FASE5_COMPROBANTES_NC_LIBRO_IVA.md
 */

const rates = new Map([['a', 10.5 as const]])

describe('líneas fiscales de una orden', () => {
  it('alícuota por producto, envío a la general y el total manda', () => {
    const { lines, discountCents } = buildFiscalLines(
      {
        locationId: 'x',
        total: 9_000,
        deliveryCost: 1_000,
        items: [
          { menuItemId: 'a', name: 'Agua', quantity: 2, subtotal: 4_000 },
          { menuItemId: 'b', name: 'Pizza', quantity: 1, subtotal: 6_000 },
        ],
      },
      rates,
      21
    )
    expect(lines.map((l) => [l.description, l.ivaRate, l.grossCents])).toEqual([
      ['Agua', 10.5, 4_000],
      ['Pizza', 21, 6_000],
      ['Envío', 21, 1_000],
    ])
    expect(discountCents).toBe(2_000)
    expect(computeIvaBreakdown(lines, discountCents).totalCents).toBe(9_000)
  })

  it('un recargo se agrega como línea y el total cierra', () => {
    const { lines, discountCents } = buildFiscalLines(
      { locationId: 'x', total: 10_500, items: [{ name: 'Pizza', quantity: 1, subtotal: 10_000 }] },
      rates,
      21
    )
    expect(lines.at(-1)).toMatchObject({ description: 'Recargo', grossCents: 500 })
    expect(discountCents).toBe(0)
  })
})

describe('receptor del comprobante', () => {
  it('consumidor final sin datos → doc 99; con DNI → 96; con CUIT de empresa → A', () => {
    expect(resolveReceiver('responsable_inscripto', {}, 1000)).toMatchObject({ letter: 'B', receiver: { docType: 99, docNumber: '0' } })
    expect(resolveReceiver('responsable_inscripto', { docNumber: '30.123.456' }, 1000).receiver).toMatchObject({ docType: 96 })
    expect(
      resolveReceiver('responsable_inscripto', { condition: 'monotributo', docNumber: '20-12345678-6' }, 1000)
    ).toMatchObject({ letter: 'A', receiver: { docType: 80, docNumber: '20123456786', condition: 'monotributo' } })
  })

  it('CUIT inválido o monto alto sin identificar → error explicado', () => {
    expect(() => resolveReceiver('responsable_inscripto', { condition: 'responsable_inscripto', docNumber: '123' }, 1000)).toThrow(/CUIT/)
    expect(() => resolveReceiver('responsable_inscripto', {}, CF_IDENTIFICATION_THRESHOLD_CENTS)).toThrow(/identificar/)
  })

  it('monotributista emite C a cualquiera', () => {
    expect(resolveReceiver('monotributo', { condition: 'responsable_inscripto', docNumber: '20123456786' }, 1000).letter).toBe('C')
  })
})

describe('QR de ARCA', () => {
  it('JSON versión 1 en base64 dentro de la URL oficial', () => {
    const input = {
      issuedAt: new Date('2026-10-24T02:00:00Z'),
      cuit: '20123456786',
      pointOfSale: 3,
      cbteTipo: 6,
      number: 42,
      totalCents: 1_210_050,
      docType: 99,
      docNumber: '0',
      cae: '76543210987654',
    }
    expect(arcaQrPayload(input)).toEqual({
      ver: 1,
      fecha: '2026-10-23',
      cuit: 20123456786,
      ptoVta: 3,
      tipoCmp: 6,
      nroCmp: 42,
      importe: 12100.5,
      moneda: 'PES',
      ctz: 1,
      tipoDocRec: 99,
      nroDocRec: 0,
      tipoCodAut: 'E',
      codAut: 76543210987654,
    })
    const url = arcaQrUrl(input)
    expect(url.startsWith('https://www.afip.gob.ar/fe/qr/?p=')).toBe(true)
    expect(JSON.parse(Buffer.from(url.split('p=')[1], 'base64').toString())).toMatchObject({ nroCmp: 42 })
  })
})

function doc(overrides: Partial<IFiscalDocument> = {}): IFiscalDocument {
  return {
    kind: 'invoice',
    letter: 'B',
    cbteTipo: 6,
    pointOfSale: 3,
    number: 42,
    environment: 'production',
    issuedAt: new Date('2026-10-23T18:00:00Z'),
    receiver: { condition: 'consumidor_final', docType: 99, docNumber: '0', name: '' },
    amounts: { totalCents: 1_210_000, netCents: 1_000_000, ivaCents: 210_000, exemptCents: 0 },
    ivaGroups: [{ ivaRate: 21, afipId: 5, baseCents: 1_000_000, amountCents: 210_000 }],
    lines: [{ description: 'Pizza', quantity: 2, totalCents: 1_210_000, ivaRate: 21 }],
    cae: '76543210987654',
    caeExpiresAt: new Date('2026-11-02T15:00:00Z'),
    qrUrl: 'https://www.afip.gob.ar/fe/qr/?p=x',
    associated: null,
    ...overrides,
  } as unknown as IFiscalDocument
}

describe('Libro IVA Ventas', () => {
  it('las notas de crédito restan y el CSV usa ; y coma decimal', () => {
    const docs = [doc(), doc({ kind: 'credit_note', letter: 'B', cbteTipo: 8, number: 7 })]
    expect(libroIvaTotals(docs)).toMatchObject({ documents: 2, totalCents: 0, ivaCents: 0 })
    const csv = libroIvaCsv([doc()])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    const [header, row] = csv.trim().split('\r\n')
    expect(header).toContain('Neto 21 %;IVA 21 %')
    expect(row).toContain('Factura B;006;00003;00000042')
    expect(row).toContain('10000,00;2100,00')
    expect(row).toContain('12100,00')
  })

  it('evita inyección de fórmulas en Excel', () => {
    const csv = libroIvaCsv([doc({ receiver: { condition: 'consumidor_final', docType: 99, docNumber: '0', name: '=HYPERLINK("x")' } })])
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
  })

  it('el mes se toma en hora argentina', () => {
    expect(monthRange('2026-10')).toEqual({ from: new Date('2026-10-01T03:00:00Z'), to: new Date('2026-11-01T03:00:00Z') })
    expect(monthRange('2026-13')).toBeNull()
  })
})

describe('ticket fiscal', () => {
  const issuer = {
    legalName: 'Keke SAS',
    cuit: '20123456786',
    fiscalAddress: 'Av. Siempreviva 742',
    grossIncomeNumber: '901-123456-7',
    activityStartDate: new Date('2020-01-01T00:00:00Z'),
    ivaCondition: 'responsable_inscripto' as const,
  }

  it('Factura B: datos del emisor, CAE e IVA contenido (Ley 27.743)', () => {
    const text = fiscalTicketLines(doc(), issuer, 48).join('\n')
    expect(text).toContain('CUIT 20-12345678-6')
    expect(text).toContain('FACTURA B  Cod. 006')
    expect(text).toContain('Nro 00003-00000042')
    expect(text).toContain('Ley 27.743')
    expect(text).toMatch(/IVA contenido \.+\$2\.100,00/)
    expect(text).toContain('CAE 76543210987654')
    expect(text).not.toContain('PRUEBA')
  })

  it('Factura A discrimina IVA; homologación se marca sin validez', () => {
    const text = fiscalTicketLines(doc({ letter: 'A', cbteTipo: 1, environment: 'homologation' }), issuer, 48).join('\n')
    expect(text).toMatch(/Neto gravado \.+\$10\.000,00/)
    expect(text).toMatch(/IVA 21% \.+\$2\.100,00/)
    expect(text).toContain('SIN VALIDEZ FISCAL')
  })

  it('nota de crédito indica el comprobante asociado', () => {
    const text = fiscalTicketLines(
      doc({ kind: 'credit_note', cbteTipo: 8, associated: { pointOfSale: 3, number: 41 } as never }),
      issuer,
      48
    ).join('\n')
    expect(text).toContain('NOTA DE CREDITO B')
    expect(text).toContain('Asociada a 00003-00000041')
  })

  it('QR ESC/POS: guarda el largo exacto del dato', () => {
    const qr = escposQr('abc')
    const store = qr.indexOf(Buffer.from([0x31, 0x50, 0x30]))
    expect(qr[store - 2]).toBe(6) // 3 bytes de dato + 3
    expect(qr.includes(Buffer.from('abc'))).toBe(true)
  })
})
