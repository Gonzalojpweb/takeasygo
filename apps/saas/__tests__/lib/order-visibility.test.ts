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

describe('ventas del POS fuera del panel (19/11/2026)', () => {
  it('una venta del POS nunca aparece en el tablero, en ningún estado', async () => {
    const { isOrderVisibleInWorkspace } = await import('@/lib/order-visibility')
    expect(isOrderVisibleInWorkspace({ source: 'pos', status: 'confirmed', payment: { method: 'cash' } })).toBe(false)
    expect(isOrderVisibleInWorkspace({ source: 'pos', status: 'pending' })).toBe(false)
    expect(isOrderVisibleInWorkspace({ source: 'web', status: 'pending' })).toBe(true)
    expect(isOrderVisibleInWorkspace({ status: 'pending' })).toBe(true)
  })

  it('posChannelLabel: mesa, mostrador, plataforma; null para pedidos del SaaS', async () => {
    const { posChannelLabel } = await import('@/lib/order-visibility')
    expect(posChannelLabel({ source: 'pos', posTableNumber: 5, posTableId: 't' })).toBe('POS · Mesa 5')
    expect(posChannelLabel({ source: 'pos' })).toBe('POS · Mostrador')
    expect(posChannelLabel({ source: 'pos', channel: 'pedidosya' })).toBe('POS · PedidosYa')
    expect(posChannelLabel({ source: 'web', posTableNumber: 5 })).toBeNull()
    expect(posChannelLabel({})).toBeNull()
  })
})
