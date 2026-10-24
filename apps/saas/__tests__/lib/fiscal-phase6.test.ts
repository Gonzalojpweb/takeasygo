import { describe, it, expect, vi } from 'vitest'
import { ALICUOTA_LINE_LENGTH, CBTE_LINE_LENGTH, alicuotaLines, cbteLine, libroIvaDigitalFiles } from '@/lib/fiscal/libro-iva-digital'
import { caeaPeriodFor, nextCaeaPeriod } from '@/lib/fiscal/arca/wsfe'
import { pointIntentStatus } from '@/lib/mp-point'
import type { IFiscalDocument } from '@/models/FiscalDocument'

/**
 * Fase 6 — Libro IVA Digital, períodos CAEA y verificación de Point.
 * Docs: ADMIN/FASE6_ONLINE_POINT_CAEA_LIBRO_DIGITAL.md
 */

function doc(overrides: Partial<IFiscalDocument> = {}): IFiscalDocument {
  return {
    kind: 'invoice',
    letter: 'B',
    cbteTipo: 6,
    pointOfSale: 3,
    number: 42,
    issuedAt: new Date('2026-10-23T18:00:00Z'),
    receiver: { condition: 'consumidor_final', docType: 99, docNumber: '0', name: '' },
    amounts: { totalCents: 1_210_000, netCents: 1_000_000, ivaCents: 210_000, exemptCents: 0 },
    ivaGroups: [{ ivaRate: 21, afipId: 5, baseCents: 1_000_000, amountCents: 210_000 }],
    ...overrides,
  } as unknown as IFiscalDocument
}

describe('Libro IVA Digital (ventas)', () => {
  it('comprobante: 266 caracteres con cada campo en su posición', () => {
    const line = cbteLine(doc())
    expect(line).toHaveLength(CBTE_LINE_LENGTH)
    expect(line.slice(0, 8)).toBe('20261023')
    expect(line.slice(8, 11)).toBe('006')
    expect(line.slice(11, 16)).toBe('00003')
    expect(line.slice(16, 36)).toBe('00000000000000000042')
    expect(line.slice(56, 58)).toBe('99')
    expect(line.slice(78, 108)).toBe('CONSUMIDOR FINAL'.padEnd(30))
    expect(line.slice(108, 123)).toBe('000000001210000')
    expect(line.slice(228, 231)).toBe('PES')
    expect(line.slice(231, 241)).toBe('0001000000')
    expect(line.slice(241, 242)).toBe('1')
    expect(line.slice(242, 243)).toBe('0')
  })

  it('alícuota: 62 caracteres con neto, id e impuesto', () => {
    const [line] = alicuotaLines(doc())
    expect(line).toHaveLength(ALICUOTA_LINE_LENGTH)
    expect(line).toBe('006' + '00003' + '42'.padStart(20, '0') + '000000001000000' + '0005' + '000000000210000')
  })

  it('Factura C no informa alícuotas; nombres sin acentos y en mayúsculas', () => {
    const c = doc({ letter: 'C', cbteTipo: 11, ivaGroups: [], receiver: { condition: 'responsable_inscripto', docType: 80, docNumber: '20123456786', name: 'Peña & Cía' } as never })
    expect(alicuotaLines(c)).toHaveLength(0)
    const line = cbteLine(c)
    expect(line.slice(241, 242)).toBe('0')
    expect(line.slice(78, 108).trim()).toBe('PENA & CIA')
  })

  it('archivos con CRLF y en orden de fecha y número', () => {
    const files = libroIvaDigitalFiles([doc({ number: 43, issuedAt: new Date('2026-10-24T18:00:00Z') }), doc()])
    const lines = files.comprobantes.split('\r\n').filter(Boolean)
    expect(lines.map((l) => l.slice(16, 36))).toEqual(['42'.padStart(20, '0'), '43'.padStart(20, '0')])
    expect(files.alicuotas.endsWith('\r\n')).toBe(true)
  })
})

describe('períodos CAEA', () => {
  it('quincenas en hora argentina', () => {
    expect(caeaPeriodFor(new Date('2026-10-15T12:00:00Z'))).toEqual({ period: '202610', order: 1 })
    expect(caeaPeriodFor(new Date('2026-10-16T12:00:00Z'))).toEqual({ period: '202610', order: 2 })
    expect(caeaPeriodFor(new Date('2026-11-01T02:00:00Z'))).toEqual({ period: '202610', order: 2 }) // 31/10 23 h AR
    expect(nextCaeaPeriod(new Date('2026-12-20T12:00:00Z'))).toEqual({ period: '202701', order: 1 })
    expect(nextCaeaPeriod(new Date('2026-12-05T12:00:00Z'))).toEqual({ period: '202612', order: 2 })
  })
})

describe('MercadoPago Point: solo se aprueba con el pago verificado', () => {
  const respond = (intent: unknown, payment?: unknown) =>
    vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('/v1/payments/') ? payment : intent), { status: 200 }))

  it('pago aprobado por el mismo monto', async () => {
    const f = respond({ state: 'FINISHED', payment: { id: 123 } }, { status: 'approved', transaction_amount: 1500 })
    expect(await pointIntentStatus('T', 'i1', 150_000, f)).toMatchObject({ state: 'approved', paymentId: '123' })
  })

  it('monto distinto, rechazado, en espera o cancelado', async () => {
    expect((await pointIntentStatus('T', 'i', 150_000, respond({ state: 'FINISHED', payment: { id: 1 } }, { status: 'approved', transaction_amount: 10 }))).state).toBe('error')
    expect((await pointIntentStatus('T', 'i', 150_000, respond({ state: 'FINISHED', payment: { id: 1 } }, { status: 'rejected', status_detail: 'cc_rejected_insufficient_amount' }))).state).toBe('rejected')
    expect((await pointIntentStatus('T', 'i', 150_000, respond({ state: 'ON_TERMINAL' }))).state).toBe('waiting')
    expect((await pointIntentStatus('T', 'i', 150_000, respond({ state: 'CANCELED' }))).state).toBe('canceled')
  })
})
