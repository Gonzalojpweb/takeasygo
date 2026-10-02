import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Printer from '@/models/Printer'
import Order from '@/models/Order'
import type { NextRequest } from 'next/server'

/**
 * Reimpresión de tickets desde el historial del admin.
 *
 * POST /orders/[orderId]/reprint:
 *   - Selección de impresora + tipo de ticket (printerId + role) → 1 solo job.
 *   - Compatibilidad: sin body → todas las impresoras activas (panel Kanban).
 *   - Cualquier estado del pedido (entregado, cancelado, etc.).
 *   - Todos los jobs generados quedan marcados isReprint: true.
 *
 * GET /print-jobs (agente >= 2.0.0):
 *   - Los jobs isReprint se entregan sin importar el estado del pedido.
 *   - Los jobs isReprint saltan el gate T-lead de pedidos programados.
 *   - Los jobs normales mantienen el gate de estados intacto.
 */

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

import { POST as reprintPOST } from '@/app/api/[tenant]/orders/[orderId]/reprint/route'
import { GET as printJobsGET } from '@/app/api/[tenant]/print-jobs/route'

const TENANT_SLUG = 'test-tenant'
const LEAD_MINUTES = 45

function reprintParams(orderId: string) {
  return { params: Promise.resolve({ tenant: TENANT_SLUG, orderId }) }
}

const agentParams = { params: Promise.resolve({ tenant: TENANT_SLUG }) }

function agentRequest(locationId: string): NextRequest {
  const url = `http://localhost:3000/api/${TENANT_SLUG}/print-jobs?locationId=${locationId}`
  return {
    nextUrl: new URL(url),
    headers: new Headers({ 'x-agent-version': '2.0.0' }),
  } as unknown as NextRequest
}

function reprintRequest(body?: object): NextRequest {
  const url = `http://localhost:3000/api/${TENANT_SLUG}/orders/some-id/reprint`
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }) as unknown as NextRequest
}

function makePrintJob(
  printerId: mongoose.Types.ObjectId,
  opts: { status?: string; isReprint?: boolean; role?: string; printerName?: string } = {}
) {
  return {
    printerId,
    printerName: opts.printerName ?? 'Test Printer',
    role: opts.role ?? 'kitchen',
    payload: 'BASE64_TICKET',
    status: opts.status ?? 'pending',
    attempts: 0,
    lastError: null,
    printedAt: null,
    ...(opts.isReprint ? { isReprint: true } : {}),
  }
}

function kitchenItem() {
  return {
    itemType: 'menuItem',
    name: 'Hamburguesa',
    categoryName: 'Platos',
    basePrice: 5000,
    price: 5000,
    quantity: 1,
    subtotal: 5000,
    printRole: 'kitchen',
    customizations: [],
  }
}

function barItem() {
  return {
    itemType: 'menuItem',
    name: 'Cerveza',
    categoryName: 'Bebidas',
    basePrice: 3000,
    price: 3000,
    quantity: 2,
    subtotal: 6000,
    printRole: 'bar',
    customizations: [],
  }
}

let tenantId: mongoose.Types.ObjectId
let locationId: mongoose.Types.ObjectId
let otherLocationId: mongoose.Types.ObjectId
let kitchenPrinterId: mongoose.Types.ObjectId
let barPrinterId: mongoose.Types.ObjectId
let otherLocationPrinterId: mongoose.Types.ObjectId
let inactivePrinterId: mongoose.Types.ObjectId
let seq = 0

async function createOrder(overrides: object = {}) {
  seq += 1
  return Order.create({
    tenantId,
    locationId,
    orderNumber: `RPR-${seq}`,
    status: 'delivered',
    orderMode: 'takeaway',
    items: [kitchenItem(), barItem()],
    subtotal: 11000,
    total: 11000,
    customer: { name: 'Cliente Test' },
    printed: true,
    printJobs: [],
    ...overrides,
  })
}

beforeEach(async () => {
  seq = 0

  const tenant = await Tenant.create({ name: 'Test Tenant', slug: TENANT_SLUG, plan: 'full' })
  tenantId = tenant._id

  const location = await Location.create({
    tenantId,
    name: 'Sede Central',
    slug: 'sede-central',
    address: 'Av. Test 123',
    isActive: true,
    scheduledOrdersConfig: { enabled: true, printBeforePickupMinutes: LEAD_MINUTES },
  })
  locationId = location._id

  const otherLocation = await Location.create({
    tenantId,
    name: 'Sede Sucursal',
    slug: 'sede-sucursal',
    address: 'Av. Otra 456',
    isActive: true,
  })
  otherLocationId = otherLocation._id

  const kitchenPrinter = await Printer.create({
    tenantId,
    locationId,
    uid: 'printer-kitchen',
    name: 'Impresora Cocina',
    ip: '192.168.1.50',
    isActive: true,
    roles: ['kitchen'],
  })
  kitchenPrinterId = kitchenPrinter._id

  const barPrinter = await Printer.create({
    tenantId,
    locationId,
    uid: 'printer-bar',
    name: 'Impresora Barra',
    ip: '192.168.1.51',
    isActive: true,
    roles: ['bar'],
  })
  barPrinterId = barPrinter._id

  const inactivePrinter = await Printer.create({
    tenantId,
    locationId,
    uid: 'printer-inactive',
    name: 'Impresora Vieja',
    ip: '192.168.1.52',
    isActive: false,
    roles: ['cashier'],
  })
  inactivePrinterId = inactivePrinter._id

  const otherLocationPrinter = await Printer.create({
    tenantId,
    locationId: otherLocationId,
    uid: 'printer-other-loc',
    name: 'Impresora Otra Sede',
    ip: '192.168.1.60',
    isActive: true,
    roles: ['kitchen'],
  })
  otherLocationPrinterId = otherLocationPrinter._id
})

function deliveredOrderIds(body: { jobs?: { orderId?: unknown }[] }): string[] {
  return [...new Set((body.jobs ?? []).map(j => String(j.orderId)))]
}

// ============================================================================
// POST /orders/[orderId]/reprint — selección de impresora + tipo de ticket
// ============================================================================
describe('POST reprint — reimpresión selectiva (historial del admin)', () => {
  it('genera UN solo job para la impresora y tipo de ticket elegidos', async () => {
    const order = await createOrder({ status: 'delivered' })

    const res = await reprintPOST(
      reprintRequest({ printerId: barPrinterId.toString(), role: 'bar' }),
      reprintParams(order._id.toString())
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.jobs).toBe(1)
    expect(body.printerName).toBe('Impresora Barra')
    expect(body.role).toBe('bar')

    const updated = await Order.findById(order._id)
    expect(updated!.printJobs).toHaveLength(1)
    const job = updated!.printJobs[0]
    expect(job.role).toBe('bar')
    expect(job.printerId.toString()).toBe(barPrinterId.toString())
    expect(job.status).toBe('pending')
    expect(job.isReprint).toBe(true)
    expect(job.payload).not.toBe('')
    expect(updated!.printed).toBe(false)
  })

  it('agrega el job nuevo sin pisar la impresión automática pendiente', async () => {
    const order = await createOrder({
      printed: false,
      printJobs: [makePrintJob(kitchenPrinterId, { role: 'kitchen' })],
    })

    const res = await reprintPOST(
      reprintRequest({ printerId: barPrinterId.toString(), role: 'bar' }),
      reprintParams(order._id.toString())
    )
    expect(res.status).toBe(200)

    const updated = await Order.findById(order._id)
    expect(updated!.printJobs).toHaveLength(2)
    // El job original queda intacto (sin isReprint)
    expect(updated!.printJobs[0].role).toBe('kitchen')
    expect(updated!.printJobs[0].isReprint).toBeFalsy()
    // El nuevo queda marcado como reimpresión
    expect(updated!.printJobs[1].role).toBe('bar')
    expect(updated!.printJobs[1].isReprint).toBe(true)
  })

  it('permite reimprimir en cualquier estado (entregado, cancelado, esperando confirmación)', async () => {
    for (const status of ['delivered', 'cancelled', 'awaiting_confirmation', 'ready']) {
      const order = await createOrder({ status })

      const res = await reprintPOST(
        reprintRequest({ printerId: kitchenPrinterId.toString(), role: 'kitchen' }),
        reprintParams(order._id.toString())
      )

      expect(res.status, `status=${status}`).toBe(200)
      const updated = await Order.findById(order._id)
      expect(updated!.printJobs, `status=${status}`).toHaveLength(1)
      expect(updated!.printJobs[0].isReprint).toBe(true)
    }
  })

  it('rechaza un rol que la impresora no tiene habilitado', async () => {
    const order = await createOrder()

    const res = await reprintPOST(
      reprintRequest({ printerId: barPrinterId.toString(), role: 'kitchen' }),
      reprintParams(order._id.toString())
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toContain('Impresora Barra')
    expect((await Order.findById(order._id))!.printJobs).toHaveLength(0)
  })

  it('rechaza una impresora de otra sede', async () => {
    const order = await createOrder()

    const res = await reprintPOST(
      reprintRequest({ printerId: otherLocationPrinterId.toString(), role: 'kitchen' }),
      reprintParams(order._id.toString())
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/impresora/i)
    expect((await Order.findById(order._id))!.printJobs).toHaveLength(0)
  })

  it('rechaza una impresora inactiva', async () => {
    const order = await createOrder()

    const res = await reprintPOST(
      reprintRequest({ printerId: inactivePrinterId.toString(), role: 'cashier' }),
      reprintParams(order._id.toString())
    )

    expect(res.status).toBe(400)
    expect((await Order.findById(order._id))!.printJobs).toHaveLength(0)
  })

  it('rechaza printerId sin role (tipo de ticket obligatorio)', async () => {
    const order = await createOrder()

    const res = await reprintPOST(
      reprintRequest({ printerId: kitchenPrinterId.toString() }),
      reprintParams(order._id.toString())
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toContain('role')
  })

  it('rechaza con mensaje claro cuando el pedido no tiene ítems para ese tipo de ticket', async () => {
    // Pedido solo con ítems de cocina → imprimir en Barra no tiene ítems
    const order = await createOrder({ items: [kitchenItem()] })

    const res = await reprintPOST(
      reprintRequest({ printerId: barPrinterId.toString(), role: 'bar' }),
      reprintParams(order._id.toString())
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toContain('Barra')
    expect((await Order.findById(order._id))!.printJobs).toHaveLength(0)
  })
})

// ============================================================================
// POST /orders/[orderId]/reprint — compatibilidad con el panel del Kanban
// ============================================================================
describe('POST reprint — comportamiento general (panel lateral del Kanban)', () => {
  it('sin body regenera jobs para TODAS las impresoras activas de la sede', async () => {
    const order = await createOrder({ status: 'confirmed', printed: true })

    const res = await reprintPOST(reprintRequest(), reprintParams(order._id.toString()))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)

    const updated = await Order.findById(order._id)
    // Impresora Cocina (kitchen) + Impresora Barra (bar). NO la inactiva ni la de otra sede.
    expect(updated!.printJobs).toHaveLength(2)
    const roles = updated!.printJobs.map(j => j.role).sort()
    expect(roles).toEqual(['bar', 'kitchen'])
    const printerIds = updated!.printJobs.map(j => j.printerId.toString())
    expect(printerIds).toContain(kitchenPrinterId.toString())
    expect(printerIds).toContain(barPrinterId.toString())
    expect(printerIds).not.toContain(inactivePrinterId.toString())
    expect(printerIds).not.toContain(otherLocationPrinterId.toString())
    // Todos marcados como reimpresión para que el agente los entregue siempre
    expect(updated!.printJobs.every(j => j.isReprint === true)).toBe(true)
    expect(updated!.printed).toBe(false)
  })

  it('funciona también con pedidos en cualquier estado', async () => {
    const order = await createOrder({ status: 'delivered' })

    const res = await reprintPOST(reprintRequest(), reprintParams(order._id.toString()))

    expect(res.status).toBe(200)
    expect((await Order.findById(order._id))!.printJobs).toHaveLength(2)
  })
})

// ============================================================================
// GET /print-jobs — entrega de reimpresiones al agente
// ============================================================================
describe('GET print-jobs — entrega de jobs de reimpresión', () => {
  it('entrega jobs isReprint en pedidos fuera de los estados activos', async () => {
    const orders = []
    for (const status of ['delivered', 'cancelled', 'awaiting_confirmation']) {
      orders.push(
        await createOrder({
          status,
          printed: false,
          printJobs: [makePrintJob(kitchenPrinterId, { role: 'kitchen', isReprint: true })],
        })
      )
    }

    const res = await printJobsGET(agentRequest(locationId.toString()), agentParams)
    const body = await res.json()

    expect(res.status).toBe(200)
    const delivered = deliveredOrderIds(body)
    for (const order of orders) {
      expect(delivered, `status=${order.status}`).toContain(order._id.toString())
    }
    expect(body.jobs).toHaveLength(3)
    expect(body.jobs[0].payload).toBe('BASE64_TICKET')
    expect(body.jobs[0].printerName).toBe('Test Printer')
  })

  it('NO entrega jobs normales (sin isReprint) en pedidos fuera de los estados activos', async () => {
    const order = await createOrder({
      status: 'delivered',
      printed: false,
      printJobs: [makePrintJob(kitchenPrinterId, { role: 'kitchen' })],
    })

    const res = await printJobsGET(agentRequest(locationId.toString()), agentParams)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(deliveredOrderIds(body)).not.toContain(order._id.toString())
    expect(body.jobs).toHaveLength(0)
  })

  it('la reimpresión salta el gate T-lead de pedidos programados', async () => {
    // Retiro a 60 min con lead 45 → el gate automático NO entregaría todavía
    const reprintScheduled = await createOrder({
      status: 'confirmed',
      orderTiming: 'scheduled',
      scheduledPickupAt: new Date(Date.now() + 60 * 60_000),
      printed: false,
      printJobs: [makePrintJob(kitchenPrinterId, { role: 'kitchen', isReprint: true })],
    })
    const autoScheduled = await createOrder({
      status: 'confirmed',
      orderTiming: 'scheduled',
      scheduledPickupAt: new Date(Date.now() + 60 * 60_000),
      printed: false,
      printJobs: [makePrintJob(kitchenPrinterId, { role: 'kitchen' })],
    })

    const res = await printJobsGET(agentRequest(locationId.toString()), agentParams)
    const body = await res.json()

    expect(res.status).toBe(200)
    const delivered = deliveredOrderIds(body)
    expect(delivered).toContain(reprintScheduled._id.toString())
    expect(delivered).not.toContain(autoScheduled._id.toString())
  })

  it('sigue entregando normalmente el flujo automático de pedidos confirmados', async () => {
    const confirmed = await createOrder({
      status: 'confirmed',
      orderTiming: 'immediate',
      printed: false,
      printJobs: [makePrintJob(kitchenPrinterId, { role: 'kitchen' })],
    })

    const res = await printJobsGET(agentRequest(locationId.toString()), agentParams)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(deliveredOrderIds(body)).toContain(confirmed._id.toString())
  })

  it('no entrega jobs de reimpresión cuando ya se imprimieron (status success)', async () => {
    await createOrder({
      status: 'delivered',
      printed: true,
      printJobs: [
        makePrintJob(kitchenPrinterId, { role: 'kitchen', isReprint: true, status: 'success' }),
      ],
    })

    const res = await printJobsGET(agentRequest(locationId.toString()), agentParams)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.jobs).toHaveLength(0)
  })
})
