import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import mongoose from 'mongoose'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Printer from '@/models/Printer'
import Order from '@/models/Order'
import type { NextRequest } from 'next/server'

/**
 * Fase 1 — Gate T-lead de impresión para pedidos programados.
 *
 * Sede de prueba con printBeforePickupMinutes = 45 (custom, no el default 30).
 * Pedido programado para 1 hora desde ahora:
 *   - ANTES del T-lead (45 min antes del retiro): el print job NO se entrega
 *     al agente aunque exista y esté pending.
 *   - DESPUÉS del T-lead: el mismo job sí se entrega.
 *   - Pedido inmediato: siempre se entrega.
 */

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

import { GET } from '@/app/api/[tenant]/print-jobs/route'

const TENANT_SLUG = 'test-tenant'
const LEAD_MINUTES = 45
const PICKUP_IN_60_MIN = 60 // retiro a 1h → T-lead a 15 min de T0

const params = { params: Promise.resolve({ tenant: TENANT_SLUG }) }

function agentRequest(locationId: string): NextRequest {
  const url = `http://localhost:3000/api/${TENANT_SLUG}/print-jobs?locationId=${locationId}`
  return {
    nextUrl: new URL(url),
    headers: new Headers({ 'x-agent-version': '2.0.0' }),
  } as unknown as NextRequest
}

function makePrintJob(printerId: mongoose.Types.ObjectId, status = 'pending') {
  return {
    printerId,
    printerName: 'Test Printer',
    role: 'kitchen',
    payload: 'BASE64_TICKET',
    status,
    attempts: 0,
    lastError: null,
    printedAt: null,
  }
}

let tenantId: mongoose.Types.ObjectId
let locationId: mongoose.Types.ObjectId
let printerId: mongoose.Types.ObjectId

async function createScheduledOrder(pickupAt: Date, orderNumber: string) {
  return Order.create({
    tenantId,
    locationId,
    orderNumber,
    status: 'confirmed',
    orderMode: 'takeaway',
    items: [],
    subtotal: 1000,
    total: 1000,
    customer: { name: 'Cliente Test' },
    printed: false,
    printJobs: [makePrintJob(printerId)],
    orderTiming: 'scheduled',
    scheduledPickupAt: pickupAt,
    scheduledStatus: 'pending_schedule',
  })
}

// setup.ts borra TODAS las colecciones en cada afterEach: sede, tenant e
// impresora se recrean por test (mismo patrón que pos-guards.test.ts).
beforeEach(async () => {
  const tenant = await Tenant.create({ name: 'Test Tenant', slug: TENANT_SLUG, plan: 'full' })
  tenantId = tenant._id

  const location = await Location.create({
    tenantId,
    name: 'Sede T-lead',
    slug: 'sede-tlead',
    address: 'Av. Test 123',
    isActive: true,
    scheduledOrdersConfig: {
      enabled: true,
      printBeforePickupMinutes: LEAD_MINUTES,
    },
  })
  locationId = location._id

  const printer = await Printer.create({
    tenantId,
    locationId,
    uid: 'printer-uid-1',
    name: 'Test Printer',
    ip: '192.168.1.50',
    isActive: true,
    roles: ['kitchen'],
  })
  printerId = printer._id

  // Falsificar SOLO Date: los timers reales de mongoose/memory-server siguen vivos.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-01T12:00:00.000Z') })
})

afterEach(() => {
  vi.useRealTimers()
})

function jobOrderNumbers(body: { jobs?: { orderId?: unknown }[] }): string[] {
  return [...new Set((body.jobs ?? []).map(j => String(j.orderId)))].sort()
}

describe('print-jobs GET — gate de impresión T-lead (sede con lead custom = 45 min)', () => {
  it('ANTES del T-lead: no entrega el job del pedido programado, ni el de inmediato', async () => {
    // T0 = 12:00. Retiro 13:00 → T-lead = 12:15. Todavía NO llegó.
    const scheduled = await createScheduledOrder(
      new Date(Date.now() + PICKUP_IN_60_MIN * 60_000),
      'SCH-ANTES'
    )
    const immediate = await Order.create({
      tenantId,
      locationId,
      orderNumber: 'IMM-1',
      status: 'confirmed',
      orderMode: 'takeaway',
      items: [],
      subtotal: 1000,
      total: 1000,
      customer: { name: 'Cliente Inmediato' },
      printed: false,
      printJobs: [makePrintJob(printerId)],
      orderTiming: 'immediate',
    })

    const res = await GET(agentRequest(locationId.toString()), params)
    const body = await res.json()

    expect(res.status).toBe(200)
    const delivered = jobOrderNumbers(body)
    expect(delivered).toContain(immediate._id.toString())
    expect(delivered).not.toContain(scheduled._id.toString())
    expect(body.jobs.length).toBe(1)
  })

  it('DESPUÉS del T-lead: el mismo job programado SÍ se entrega (simulando el paso del tiempo)', async () => {
    // Mismo escenario: retiro 13:00, T-lead 12:15.
    const scheduled = await createScheduledOrder(
      new Date(Date.now() + PICKUP_IN_60_MIN * 60_000),
      'SCH-DESPUES'
    )

    // 12:00 → no entregado
    let res = await GET(agentRequest(locationId.toString()), params)
    let body = await res.json()
    expect(jobOrderNumbers(body)).not.toContain(scheduled._id.toString())

    // Avanzo a 12:16 (pasó el T-lead de 12:15) — solo el reloj Date, timers reales.
    vi.setSystemTime(new Date('2026-10-01T12:16:00.000Z'))

    res = await GET(agentRequest(locationId.toString()), params)
    body = await res.json()
    expect(jobOrderNumbers(body)).toContain(scheduled._id.toString())
  })

  it('Lead custom de la sede se respeta (45, no el default 30): 13:00−45=12:15, no 12:30', async () => {
    // Retiro 13:00. Con lead 30 el T-lead sería 12:30; con lead 45 es 12:15.
    // A las 12:20: lead 45 → YA entregado; lead 30 → todavía no.
    const scheduled = await createScheduledOrder(
      new Date(Date.now() + PICKUP_IN_60_MIN * 60_000),
      'SCH-LEAD'
    )

    vi.setSystemTime(new Date('2026-10-01T12:20:00.000Z'))

    const res = await GET(agentRequest(locationId.toString()), params)
    const body = await res.json()
    expect(jobOrderNumbers(body)).toContain(scheduled._id.toString())
  })

  it('Confirmación tardía: retiro ya vencido imprime inmediato (T-lead en el pasado)', async () => {
    const late = await createScheduledOrder(
      new Date(Date.now() - 10 * 60_000), // retiro hace 10 min
      'SCH-TARDIA'
    )

    const res = await GET(agentRequest(locationId.toString()), params)
    const body = await res.json()
    expect(jobOrderNumbers(body)).toContain(late._id.toString())
  })

  it('Pedido cancelado nunca se entrega aunque el T-lead haya pasado', async () => {
    const cancelled = await Order.create({
      tenantId,
      locationId,
      orderNumber: 'SCH-CANCEL',
      status: 'cancelled',
      orderMode: 'takeaway',
      items: [],
      subtotal: 1000,
      total: 1000,
      customer: { name: 'Cliente Cancelado' },
      printed: false,
      printJobs: [makePrintJob(printerId)],
      orderTiming: 'scheduled',
      scheduledPickupAt: new Date(Date.now() - 60 * 60_000),
      scheduledStatus: 'pending_schedule',
    })

    const res = await GET(agentRequest(locationId.toString()), params)
    const body = await res.json()
    expect(jobOrderNumbers(body)).not.toContain(cancelled._id.toString())
  })
})
