import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { GET as listOrders } from '@/app/api/[tenant]/orders/route'
import { GET as history } from '@/app/api/[tenant]/orders/history/route'
import { GET as recent } from '@/app/api/[tenant]/admin/dashboard/pedidos-recientes/route'
import { auth } from '@/lib/auth'

/**
 * 19/11/2026 — las ventas del POS (mesas, Mostrador/para llevar, deliverys de
 * plataformas operados en el POS) no aparecen en el panel de pedidos del
 * SaaS: se operan en el POS. En el historial se incluyen con un filtro y se
 * muestran por canal en lugar de «Consumidor final».
 */

const SLUG = 'panel-sin-pos'
let tenant: { _id: unknown }
let locationId: unknown

const params = () => ({ params: Promise.resolve({ tenant: SLUG }) })

beforeEach(async () => {
  tenant = await Tenant.create({ slug: SLUG, name: 'Panel', isActive: true, status: 'active', plan: 'full' })
  const loc = await Location.create({ tenantId: tenant._id, slug: 'sede', name: 'Sede', address: 'x', isActive: true })
  locationId = loc._id
  vi.mocked(auth).mockResolvedValue({
    user: { id: 'admin-1', role: 'admin', tenantId: String(tenant._id), assignedLocations: [], assignedTenants: [String(tenant._id)] },
    expires: '',
  } as never)

  const base = { tenantId: tenant._id, locationId, deletedAt: null, status: 'confirmed', total: 100, createdAt: new Date(), updatedAt: new Date() }
  await Order.collection.insertMany([
    { ...base, orderNumber: 'APP-1', orderMode: 'takeaway', customer: { name: 'Lucía', phone: '', email: '' } },
    { ...base, orderNumber: 'POS-MOSTRADOR', source: 'pos', posId: 'p1', orderMode: 'takeaway', customer: { name: 'Consumidor final', phone: '', email: '' } },
    { ...base, orderNumber: 'POS-MESA', source: 'pos', posId: 'p2', posTableId: 't1', posTableNumber: 5, customer: { name: 'Consumidor final', phone: '', email: '' } },
    { ...base, orderNumber: 'POS-RAPPI', source: 'pos', posId: 'p3', channel: 'rappi', customer: { name: 'Consumidor final', phone: '', email: '' } },
  ])
})

describe('panel de pedidos del SaaS', () => {
  it('lista solo los pedidos del SaaS (también los para llevar), nunca ventas del POS', async () => {
    const res = await listOrders(new NextRequest(`http://localhost/api/${SLUG}/orders`), params())
    expect(res.status).toBe(200)
    const { orders } = await res.json()
    expect(orders.map((o: { orderNumber: string }) => o.orderNumber)).toEqual(['APP-1'])
  })
})

describe('historial', () => {
  it('por defecto sin ventas del POS', async () => {
    const res = await history(new NextRequest(`http://localhost/api/${SLUG}/orders/history`), params())
    const body = await res.json()
    expect(body.orders.map((o: { orderNumber: string }) => o.orderNumber)).toEqual(['APP-1'])
    expect(body.total).toBe(1)
  })

  it('con «Incluir ventas del POS»: todas, cada venta del POS por su canal', async () => {
    const res = await history(new NextRequest(`http://localhost/api/${SLUG}/orders/history?includePos=1`), params())
    const body = await res.json()
    const byNumber = Object.fromEntries(body.orders.map((o: { orderNumber: string; channelLabel: string | null }) => [o.orderNumber, o.channelLabel]))
    expect(byNumber).toEqual({
      'APP-1': null,
      'POS-MOSTRADOR': 'POS · Mostrador',
      'POS-MESA': 'POS · Mesa 5',
      'POS-RAPPI': 'POS · Rappi',
    })
  })
})

describe('dashboard — pedidos recientes', () => {
  it('muestra el canal en vez de «Consumidor final» y mantiene el nombre del cliente online', async () => {
    const res = await recent(new NextRequest(`http://localhost/api/${SLUG}/admin/dashboard/pedidos-recientes`), params())
    expect(res.status).toBe(200)
    const orders = (await res.json()) as { orderNumber: string; customer: { name: string } }[]
    const names = Object.fromEntries(orders.map((o) => [o.orderNumber, o.customer.name]))
    expect(names['APP-1']).toBe('Lucía')
    expect(names['POS-MESA']).toBe('POS · Mesa 5')
    expect(Object.values(names)).not.toContain('Consumidor final')
  })
})
