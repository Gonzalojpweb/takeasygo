import { describe, it, expect, vi } from 'vitest'
import mongoose from 'mongoose'
import './setup'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

import { buildPrintPayload } from '@/lib/printing/buildPrintPayload'

/**
 * Piloto 06/11: qué imprime cada impresora al confirmar un pedido.
 *   · Pedido del POS (mozo o mostrador): solo comandas (cocina / barra),
 *     nunca el ticket de caja. El comprobante sale al cobrar, si se pide.
 *   · Pedido online: ticket de caja solo si la impresora tiene el documento
 *     «Ticket no fiscal» (o no tiene documentos declarados: usa los del rol).
 */

const tenantId = new mongoose.Types.ObjectId()
const locationId = new mongoose.Types.ObjectId()

function order() {
  return {
    _id: new mongoose.Types.ObjectId(),
    tenantId,
    locationId,
    orderNumber: 12,
    items: [
      { itemType: 'menuItem', name: 'Milanesa', quantity: 1, price: 1_000_000, subtotal: 1_000_000, printRole: 'kitchen' },
      { itemType: 'menuItem', name: 'Cerveza', quantity: 2, price: 400_000, subtotal: 800_000, printRole: 'bar' },
    ],
    total: 1_800_000,
    orderMode: 'dine-in',
    createdAt: new Date(),
  } as never
}

const kitchen = { _id: new mongoose.Types.ObjectId(), name: 'Cocina', roles: ['kitchen'] }
const bar = { _id: new mongoose.Types.ObjectId(), name: 'Barra', roles: ['bar'] }
const caja = { _id: new mongoose.Types.ObjectId(), name: 'Caja', roles: ['cashier'] }

describe('impresión al confirmar un pedido', () => {
  it('pedido del POS: comanda en cocina y en barra, sin ticket de caja', async () => {
    const jobs = await buildPrintPayload(order(), [kitchen, bar, caja] as never, { skipCashierTicket: true })
    expect(jobs.map((j) => j.role).sort()).toEqual(['bar', 'kitchen'])
  })

  it('pedido online: la caja imprime el ticket con los documentos del rol', async () => {
    const jobs = await buildPrintPayload(order(), [kitchen, bar, caja] as never)
    expect(jobs.map((j) => j.role).sort()).toEqual(['bar', 'cashier', 'kitchen'])
  })

  it('pedido online: una caja sin «Ticket no fiscal» en sus documentos no imprime', async () => {
    const cajaSinTicket = { ...caja, documents: ['precuenta', 'factura', 'reporte_caja'] }
    const jobs = await buildPrintPayload(order(), [kitchen, cajaSinTicket] as never)
    expect(jobs.map((j) => j.role)).toEqual(['kitchen'])
  })
})
