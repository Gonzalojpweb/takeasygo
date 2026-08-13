import { describe, it, expect } from 'vitest'
import { isOrderVisibleInWorkspace, filterVisibleOrders } from '@/lib/order-visibility'

describe('isOrderVisibleInWorkspace', () => {
  it('MP en awaiting_payment → OCULTO (pago online, espera webhook)', () => {
    expect(isOrderVisibleInWorkspace({ status: 'awaiting_payment', payment: { method: 'mercadopago' } })).toBe(false)
  })

  it('Kripton en awaiting_payment → OCULTO (pago online, espera webhook)', () => {
    expect(isOrderVisibleInWorkspace({ status: 'awaiting_payment', payment: { method: 'kripton' } })).toBe(false)
  })

  it('cualquier medio online en awaiting_payment → OCULTO', () => {
    expect(isOrderVisibleInWorkspace({ status: 'awaiting_payment', payment: { method: 'paypal' } })).toBe(false)
  })

  it('transferencia en awaiting_payment → VISIBLE (cajero la ve mientras espera comprobante)', () => {
    expect(isOrderVisibleInWorkspace({ status: 'awaiting_payment', payment: { method: 'transfer' } })).toBe(true)
  })

  it('transferencia en awaiting_confirmation → VISIBLE (accionable, suena una vez)', () => {
    expect(isOrderVisibleInWorkspace({ status: 'awaiting_confirmation', payment: { method: 'transfer' } })).toBe(true)
  })

  it('MP confirmado → VISIBLE (webhook lo pasó a confirmed)', () => {
    expect(isOrderVisibleInWorkspace({ status: 'confirmed', payment: { method: 'mercadopago' } })).toBe(true)
  })

  it('Kripton confirmado → VISIBLE', () => {
    expect(isOrderVisibleInWorkspace({ status: 'confirmed', payment: { method: 'kripton' } })).toBe(true)
  })

  it('transferencia confirmada → VISIBLE', () => {
    expect(isOrderVisibleInWorkspace({ status: 'confirmed', payment: { method: 'transfer' } })).toBe(true)
  })

  it('sin payment.method en awaiting_payment → OCULTO', () => {
    expect(isOrderVisibleInWorkspace({ status: 'awaiting_payment' })).toBe(false)
  })

  it('otros estados operativos → VISIBLE', () => {
    for (const s of ['pending', 'preparing', 'ready', 'en_ruta', 'delivered']) {
      expect(isOrderVisibleInWorkspace({ status: s })).toBe(true)
    }
  })
})

describe('filterVisibleOrders', () => {
  it('oculta solo pagos online en awaiting_payment; mantiene transferencias y el resto', () => {
    const orders = [
      { id: '1', status: 'awaiting_payment', payment: { method: 'mercadopago' } },
      { id: '2', status: 'awaiting_payment', payment: { method: 'transfer' } },
      { id: '3', status: 'awaiting_payment', payment: { method: 'kripton' } },
      { id: '4', status: 'confirmed', payment: { method: 'mercadopago' } },
      { id: '5', status: 'awaiting_confirmation', payment: { method: 'transfer' } },
    ]
    const visible = filterVisibleOrders(orders)
    expect(visible.map((o: any) => o.id)).toEqual(['2', '4', '5'])
  })
})
