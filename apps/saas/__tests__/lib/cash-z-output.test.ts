import { describe, it, expect } from 'vitest'
import iconv from 'iconv-lite'
import type { ZReport } from '@takeasygo/types'
import { buildZTicketBuffer, zTicketLines } from '@/lib/cash/z-ticket'
import { isShareTokenValid, zSharePath } from '@/lib/cash/z-share'
import { summarizeCashiers } from '@/lib/cash/cashier-summary'

/**
 * Fase 2 de caja (2026-10) — el Z para llevarse.
 * Docs: ADMIN/FASE2_Z_PARA_LLEVARSE.md
 */

function z(overrides: Partial<ZReport> = {}): ZReport {
  return {
    registerId: 'r1',
    tenantId: 't1',
    closedAt: new Date('2026-10-23T23:30:00Z'),
    closedBy: 'Ana Pérez',
    initialAmount: 1_000_000,
    finalAmount: 4_195_000,
    expectedAmount: 4_200_000,
    difference: -5_000,
    byChannel: {
      counter: { sales: 3_500_000, income: 0, expenses: 0, refunds: 0, movementCount: 4 },
      takeasygo: { sales: 0, income: 0, expenses: 0, refunds: 0, movementCount: 0 },
    },
    byPaymentMethod: { cash: 3_250_000, posnet_debit: 250_000 } as ZReport['byPaymentMethod'],
    totalMovements: 5,
    incomeTotal: 3_500_000,
    expenseTotal: 50_000,
    salesTotal: 3_500_000,
    refundTotal: 0,
    byCategory: { suppliers: 50_000 },
    voidCount: 0,
    closingCount: { bills: [{ value: 2_000_000, count: 2 }, { value: 100_000, count: 1 }], coins: 95_000, total: 4_195_000 },
    generatedAt: new Date('2026-10-23T23:30:00Z'),
    ...overrides,
  }
}

const ctx = { tenantName: 'Keke', locationName: 'Centro', openedAt: new Date('2026-10-23T12:00:00Z'), columns: 32 }

describe('ticket térmico del Z', () => {
  it('muestra el resultado, el conteo por billete, los medios de pago y los egresos', () => {
    const text = zTicketLines(z(), ctx).map((l) => l.text).join('\n')
    expect(text).toContain('CIERRE DE CAJA (Z)')
    expect(text).toContain('FALTANTE $50,00')
    expect(text).toMatch(/\$20\.000 x 2/)
    expect(text).toContain('Efectivo')
    expect(text).toContain('Debito')
    expect(text).toContain('Proveedores')
    expect(text).toContain('Firma del responsable')
  })

  it('ninguna línea supera el ancho del papel', () => {
    for (const columns of [32, 48]) {
      for (const line of zTicketLines(z(), { ...ctx, columns })) {
        if (!line.large) expect(line.text.length).toBeLessThanOrEqual(columns)
      }
    }
  })

  it('marca la reimpresión y genera un buffer ESC/POS con corte', () => {
    const b64 = buildZTicketBuffer(z({ difference: 0 }), { ...ctx, reprint: true })
    const raw = Buffer.from(b64, 'base64')
    expect(raw.subarray(0, 2)).toEqual(Buffer.from([0x1b, 0x40]))
    expect(raw.subarray(-3)).toEqual(Buffer.from([0x1d, 0x56, 0x01]))
    const decoded = iconv.decode(raw, 'cp858')
    expect(decoded).toContain('REIMPRESION')
    expect(decoded).toContain('CAJA EXACTA')
  })

  it('un Z viejo (sin conteo ni categorías) también se imprime', () => {
    const old = z({ closingCount: undefined, byCategory: undefined, voidCount: undefined })
    expect(() => buildZTicketBuffer(old, ctx)).not.toThrow()
  })
})

describe('link compartible', () => {
  it('vence a los 30 días del cierre', () => {
    const closed = new Date('2026-10-01T00:00:00Z')
    expect(isShareTokenValid(closed, new Date('2026-10-30T00:00:00Z'))).toBe(true)
    expect(isShareTokenValid(closed, new Date('2026-11-01T00:00:00Z'))).toBe(false)
    expect(isShareTokenValid(null)).toBe(false)
  })

  it('la ruta queda bajo el comercio', () => {
    expect(zSharePath('keke', 'abc')).toBe('/keke/cierre/abc')
  })
})

describe('faltantes por quien cerró', () => {
  it('agrupa por usuario y ordena por faltante', () => {
    const { cashiers, totals } = summarizeCashiers([
      { closedBy: 'Ana', closedByUserId: 'u1', difference: -5_000 },
      { closedBy: 'Ana', closedByUserId: 'u1', difference: -2_000 },
      { closedBy: 'Beto', closedByUserId: 'u2', difference: 1_000 },
      { closedBy: 'Operador', difference: 0 },
    ])
    expect(cashiers[0]).toMatchObject({ name: 'Ana', closes: 2, shortCloses: 2, shortTotal: 7_000 })
    expect(totals).toEqual({ closes: 4, shortCloses: 2, shortTotal: 7_000, overTotal: 1_000 })
  })
})
