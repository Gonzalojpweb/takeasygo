import { describe, it, expect } from 'vitest'
import {
  cbteTipo,
  computeIvaBreakdown,
  formatCuit,
  invoiceLetterFor,
  isValidCuit,
  isValidPointOfSale,
  resolveIvaRate,
} from '@takeasygo/business'

/**
 * Fase 3 — reglas fiscales puras (packages/business/src/fiscal.ts).
 * Supuestos a validar con el contador: ADMIN/FASE3_DATOS_FISCALES_E_IVA.md.
 */

describe('desglose de IVA (precios con IVA incluido)', () => {
  it('21 %: neto + IVA = total al centavo', () => {
    const b = computeIvaBreakdown([{ grossCents: 1_210_000, ivaRate: 21 }])
    expect(b).toMatchObject({ netCents: 1_000_000, ivaCents: 210_000, exemptCents: 0, totalCents: 1_210_000 })
  })

  it('redondea por grupo y nunca pierde un centavo', () => {
    for (const gross of [1, 99, 1_000, 3_333, 12_345, 99_999, 1_234_567]) {
      const b = computeIvaBreakdown([{ grossCents: gross, ivaRate: 21 }, { grossCents: gross + 7, ivaRate: 10.5 }])
      expect(b.netCents + b.ivaCents + b.exemptCents).toBe(b.totalCents)
      expect(b.totalCents).toBe(gross * 2 + 7)
    }
  })

  it('agrupa por alícuota y separa lo exento', () => {
    const b = computeIvaBreakdown([
      { grossCents: 605_000, ivaRate: 21 },
      { grossCents: 605_000, ivaRate: 21 },
      { grossCents: 110_500, ivaRate: 10.5 },
      { grossCents: 50_000, ivaRate: 0 },
    ])
    expect(b.groups.map((g) => [g.ivaRate, g.afipId, g.grossCents, g.netCents, g.ivaCents])).toEqual([
      [21, 5, 1_210_000, 1_000_000, 210_000],
      [10.5, 4, 110_500, 100_000, 10_500],
      [0, 3, 50_000, 50_000, 0],
    ])
    expect(b).toMatchObject({ netCents: 1_100_000, ivaCents: 220_500, exemptCents: 50_000, totalCents: 1_370_500 })
  })

  it('el descuento se reparte en proporción y suma exacto', () => {
    const b = computeIvaBreakdown(
      [
        { grossCents: 1_000_000, ivaRate: 21 },
        { grossCents: 333_333, ivaRate: 10.5 },
      ],
      100_001
    )
    expect(b.totalCents).toBe(1_333_333 - 100_001)
    expect(b.netCents + b.ivaCents).toBe(b.totalCents)
  })

  it('monotributo: sin IVA, todo como neto (Factura C)', () => {
    const b = computeIvaBreakdown([{ grossCents: 1_210_000, ivaRate: 21 }], 0, 'monotributo')
    expect(b).toEqual({ groups: [], netCents: 1_210_000, ivaCents: 0, exemptCents: 0, totalCents: 1_210_000 })
  })

  it('rechaza montos no enteros, alícuotas desconocidas o descuentos mayores al total', () => {
    expect(() => computeIvaBreakdown([{ grossCents: 10.5, ivaRate: 21 }])).toThrow()
    expect(() => computeIvaBreakdown([{ grossCents: 100, ivaRate: 19 as never }])).toThrow()
    expect(() => computeIvaBreakdown([{ grossCents: 100, ivaRate: 21 }], 101)).toThrow()
  })
})

describe('tipo de comprobante', () => {
  it('RI → A a RI y monotributo, B a consumidor final; monotributo → C', () => {
    expect(invoiceLetterFor('responsable_inscripto', 'responsable_inscripto')).toBe('A')
    expect(invoiceLetterFor('responsable_inscripto', 'monotributo')).toBe('A')
    expect(invoiceLetterFor('responsable_inscripto', 'consumidor_final')).toBe('B')
    expect(invoiceLetterFor('responsable_inscripto', 'exento')).toBe('B')
    expect(invoiceLetterFor('monotributo', 'responsable_inscripto')).toBe('C')
  })

  it('códigos de ARCA de factura y nota de crédito', () => {
    expect([cbteTipo('A', 'invoice'), cbteTipo('B', 'invoice'), cbteTipo('C', 'invoice')]).toEqual([1, 6, 11])
    expect([cbteTipo('A', 'credit_note'), cbteTipo('B', 'credit_note'), cbteTipo('C', 'credit_note')]).toEqual([3, 8, 13])
  })
})

describe('alícuota y datos del emisor', () => {
  it('producto → categoría → comercio → 21 %', () => {
    expect(resolveIvaRate(10.5, 21, 21)).toBe(10.5)
    expect(resolveIvaRate(null, 10.5, 21)).toBe(10.5)
    expect(resolveIvaRate(undefined, undefined, 27)).toBe(27)
    expect(resolveIvaRate(undefined, 19, undefined)).toBe(21)
  })

  it('valida CUIT con dígito verificador y punto de venta', () => {
    expect(isValidCuit('20-12345678-6')).toBe(true)
    expect(isValidCuit('20123456780')).toBe(false)
    expect(isValidCuit('123')).toBe(false)
    expect(formatCuit('20123456786')).toBe('20-12345678-6')
    expect(isValidPointOfSale(3)).toBe(true)
    expect(isValidPointOfSale(0)).toBe(false)
    expect(isValidPointOfSale(100_000)).toBe(false)
  })
})
