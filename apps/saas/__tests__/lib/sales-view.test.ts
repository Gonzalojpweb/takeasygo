import { describe, it, expect } from 'vitest'
import { describeSalesFilters, fiscalStateOf, matchesInvoice, parseSalesFilters } from '@/lib/metrics/salesView'
import { computeSalesCost } from '@/lib/metrics/salesCost'

/** Contexto Ventas (2026-10-25): filtros, estado fiscal y costo de lo vendido. */

describe('filtros de la vista de ventas', () => {
  it('lee los válidos e ignora los inválidos', () => {
    const f = parseSalesFilters(new URLSearchParams('channel=delivery&platform=rappi&status=voided&payment=posnet_credit&invoice=pending&mode=takeaway&hourFrom=20&hourTo=2&q=  mila '))
    expect(f).toEqual({ channel: 'delivery', platform: 'rappi', status: 'voided', payment: 'posnet_credit', invoice: 'pending', mode: 'takeaway', hourFrom: 20, hourTo: 2, q: 'mila' })
    const bad = parseSalesFilters(new URLSearchParams('channel=nope&platform=glovo&status=x&payment=bitcoin&invoice=y&mode=z&hourFrom=5&hourTo=5'))
    expect(bad).toMatchObject({ channel: 'all', platform: 'all', status: 'all', payment: 'all', invoice: 'all', mode: 'all', hourFrom: null, hourTo: null })
  })
  it('describe los filtros activos para el PDF / Excel', () => {
    const f = parseSalesFilters(new URLSearchParams('channel=app&mode=delivery&invoice=not_invoiced&hourFrom=12&hourTo=16'))
    expect(describeSalesFilters(f)).toBe('App TakeasyGO · Envío · Sin facturar · 12:00 a 16:00')
    expect(describeSalesFilters(parseSalesFilters(new URLSearchParams('')))).toBe('')
  })
})

describe('estado fiscal de una venta', () => {
  const inv = (status: string) => ({ kind: 'invoice', status, label: 'Factura B 00003-00000015' })
  it('facturada, pendiente, con nota de crédito o sin factura', () => {
    expect(fiscalStateOf([])).toEqual({ state: 'none', label: null })
    expect(fiscalStateOf([inv('authorized')]).state).toBe('invoiced')
    expect(fiscalStateOf([inv('retrying')]).state).toBe('pending')
    expect(fiscalStateOf([inv('authorized'), { kind: 'credit_note', status: 'authorized', label: 'NC' }]).state).toBe('credited')
  })
  it('«sin facturar» incluye las anuladas con nota de crédito', () => {
    expect(matchesInvoice('not_invoiced', 'none')).toBe(true)
    expect(matchesInvoice('not_invoiced', 'credited')).toBe(true)
    expect(matchesInvoice('not_invoiced', 'invoiced')).toBe(false)
    expect(matchesInvoice('pending', 'pending')).toBe(true)
    expect(matchesInvoice('all', 'pending')).toBe(true)
  })
})

describe('costo de lo vendido (inventario)', () => {
  const ev = (orderId: string, name: string, portions: number, consumption: { skuId: string; quantity: number }[], unmapped = false) =>
    ({ correlationId: orderId, payload: { name, portions, unmapped, consumption } })

  it('valoriza el consumo neto (las correcciones restan) por venta y por plato', () => {
    const cost = new Map([['carne', 800_000], ['pan', 100_000]])
    const r = computeSalesCost([
      ev('o1', 'Milanesa', 2, [{ skuId: 'carne', quantity: 0.5 }, { skuId: 'pan', quantity: 0.2 }]),
      ev('o1', 'Milanesa', -1, [{ skuId: 'carne', quantity: -0.25 }, { skuId: 'pan', quantity: -0.1 }]),
      ev('o2', 'Flan', 1, [], true),
    ], cost)
    expect(r.available).toBe(true)
    expect(r.cmvCents).toBe(210_000) // 0,25 kg × 8.000 + 0,1 × 1.000
    expect(r.byOrder.get('o1')).toBe(210_000)
    expect(r.byProduct.get('Milanesa')).toEqual({ portions: 1, costCents: 210_000 })
    expect(r.coverage).toEqual({ mappedPortions: 1, totalPortions: 2 })
    expect(r.unmappedProducts).toEqual([{ name: 'Flan', portions: 1 }])
  })

  it('sin eventos no hay inventario; insumos sin precio se avisan', () => {
    expect(computeSalesCost([], new Map()).available).toBe(false)
    const r = computeSalesCost([ev('o1', 'Pizza', 1, [{ skuId: 'queso', quantity: 0.2 }])], new Map())
    expect(r.cmvCents).toBe(0)
    expect(r.missingCostSkus).toBe(1)
  })
})
