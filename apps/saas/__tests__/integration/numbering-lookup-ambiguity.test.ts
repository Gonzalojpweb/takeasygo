// ============================================================================
// numbering-lookup-ambiguity.test.ts — Lookups por número sin ambigüedad
// ============================================================================
// Verifica que con numeración por sede (PREFIX-NNNN), todas las búsquedas
// por orderNumber son inequívocas gracias al tenantId en el filtro:
//
//   1. Dos tenants con sede "Recoleta" generan el mismo PREFIX-NNNN,
//      pero cada lookup incluye tenantId → nunca colisionan.
//   2. Dos sedes del mismo tenant generan PREFIXes distintos → inequívoco.
//   3. Legacy (SLUG-AAMMDD-NNNN) y per-location (PREFIX-NNNN) coexisten
//      sin ambigüedad bajo el índice (tenantId, orderNumber).
//
// Ejecutar: npx vitest run __tests__/integration/numbering-lookup-ambiguity.test.ts
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import './setup'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

import Order from '@/models/Order'
import Reservation from '@/models/Reservation'
import { nextPerLocationNumber } from '@/lib/perLocationNumber'

const baseAddr = { street: 'Calle', streetNumber: '1', city: 'CABA', number: '1', coordinates: { lat: -34.6, lng: -58.4 } }

function orderData(tenantId: mongoose.Types.ObjectId, locationId: mongoose.Types.ObjectId, orderNumber: string, name: string, phone: string, phoneHash: string, total: number) {
  return {
    tenantId, locationId, orderNumber,
    status: 'confirmed', mode: 'delivery', orderMode: 'delivery',
    customer: { name, phone, phoneHash },
    items: [], subtotal: total, total, paymentMethod: 'cash',
    deliveryAddress: { ...baseAddr, streetNumber: '1' },
    scheduledPickupAt: null, scheduledStatus: null,
  }
}

let tenantA: mongoose.Types.ObjectId
let tenantB: mongoose.Types.ObjectId
let recoletaId: mongoose.Types.ObjectId
let saavedraId: mongoose.Types.ObjectId

beforeEach(async () => {
  tenantA = new mongoose.Types.ObjectId()
  tenantB = new mongoose.Types.ObjectId()
  recoletaId = new mongoose.Types.ObjectId()
  saavedraId = new mongoose.Types.ObjectId()
  // mongodb-memory-server no auto-crea índices del schema
  await Order.createIndexes()
  await Reservation.createIndexes()
})

describe('Ambigüedad de lookups por orderNumber', () => {
  it('dos tenants con misma sede nombre: mismo número, lookups separados por tenantId', async () => {
    // Simular: ambos tenants generan REC-0001 para su "Recoleta"
    const numA = await nextPerLocationNumber({ tenantId: tenantA, locationId: recoletaId, type: 'order', location: { name: 'Recoleta' } })
    const numB = await nextPerLocationNumber({ tenantId: tenantB, locationId: recoletaId, type: 'order', location: { name: 'Recoleta' } })

    // Mismo número (ambos REC-0001)
    expect(numA).toBe('REC-0001')
    expect(numB).toBe('REC-0001')

    // Crear órdenes reales en DB con ese número
    await Order.create(orderData(tenantA, recoletaId, numA, 'Cliente A', '111', 'hashA', 100))
    await Order.create(orderData(tenantB, recoletaId, numB, 'Cliente B', '222', 'hashB', 200))

    // Lookup como lo hacen las páginas públicas: { orderNumber, tenantId }
    const foundA = await Order.findOne({ orderNumber: 'REC-0001', tenantId: tenantA }).lean()
    const foundB = await Order.findOne({ orderNumber: 'REC-0001', tenantId: tenantB }).lean()

    // Cada lookup encuentra SOLO la orden de su tenant
    expect(foundA).not.toBeNull()
    expect(foundB).not.toBeNull()
    expect(String(foundA!.tenantId)).toBe(String(tenantA))
    expect(String(foundB!.tenantId)).toBe(String(tenantB))
    expect(String(foundA!._id)).not.toBe(String(foundB!._id))
  })

  it('dos sedes del mismo tenant: PREFIXes distintos, lookup inequívoco', async () => {
    const numRec = await nextPerLocationNumber({ tenantId: tenantA, locationId: recoletaId, type: 'order', location: { name: 'Recoleta' } })
    const numSaa = await nextPerLocationNumber({ tenantId: tenantA, locationId: saavedraId, type: 'order', location: { name: 'Saavedra' } })

    // Prefijos distintos
    expect(numRec).toBe('REC-0001')
    expect(numSaa).toBe('SAA-0001')
    expect(numRec).not.toBe(numSaa)

    await Order.create(orderData(tenantA, recoletaId, numRec, 'Cliente Recoleta', '333', 'hashR', 100))
    await Order.create(orderData(tenantA, saavedraId, numSaa, 'Cliente Saavedra', '444', 'hashS', 200))

    // Lookup por tenant + número: encuentra exactamente una
    const foundRec = await Order.findOne({ orderNumber: numRec, tenantId: tenantA }).lean()
    const foundSaa = await Order.findOne({ orderNumber: numSaa, tenantId: tenantA }).lean()

    expect(foundRec).not.toBeNull()
    expect(foundSaa).not.toBeNull()
    expect(String(foundRec!.locationId)).toBe(String(recoletaId))
    expect(String(foundSaa!.locationId)).toBe(String(saavedraId))
  })

  it('legacy y per-location coexisten sin ambigüedad', async () => {
    // Orden legacy (formato viejo SLUG-AAMMDD-NNNN)
    const legacyNumber = 'CHOP-261014-0001'
    await Order.create(orderData(tenantA, recoletaId, legacyNumber, 'Legacy', '555', 'hashL', 100))

    // Orden per-location (PREFIX-NNNN)
    const perLocNumber = await nextPerLocationNumber({ tenantId: tenantA, locationId: recoletaId, type: 'order', location: { name: 'Recoleta' } })
    await Order.create(orderData(tenantA, recoletaId, perLocNumber, 'PerLoc', '666', 'hashP', 200))

    // Ambos lookups son inequívocos
    const foundLegacy = await Order.findOne({ orderNumber: legacyNumber, tenantId: tenantA }).lean()
    const foundPerLoc = await Order.findOne({ orderNumber: perLocNumber, tenantId: tenantA }).lean()

    expect(foundLegacy).not.toBeNull()
    expect(foundPerLoc).not.toBeNull()
    expect(String(foundLegacy!._id)).not.toBe(String(foundPerLoc!._id))
  })

  it('índice único (tenantId, orderNumber) previene duplicados cross-sede del mismo tenant', async () => {
    // Primera orden en Recoleta
    const num1 = await nextPerLocationNumber({ tenantId: tenantA, locationId: recoletaId, type: 'order', location: { name: 'Recoleta' } })
    await Order.create(orderData(tenantA, recoletaId, num1, 'Primera', '777', 'hash1', 100))

    // Intentar crear otra orden con el MISMO número en el mismo tenant → debe fallar
    await expect(Order.create(orderData(tenantA, saavedraId, num1, 'Duplicada', '888', 'hash2', 200))).rejects.toThrow()
  })
})

describe('Ambigüedad de lookups por reservationNumber', () => {
  it('dos tenants con misma sede: mismo número, reservas separadas', async () => {
    const numA = await nextPerLocationNumber({ tenantId: tenantA, locationId: recoletaId, type: 'reservation', location: { name: 'Recoleta' } })
    const numB = await nextPerLocationNumber({ tenantId: tenantB, locationId: recoletaId, type: 'reservation', location: { name: 'Recoleta' } })

    expect(numA).toBe('REC-R0001')
    expect(numB).toBe('REC-R0001')

    await Reservation.create({
      tenantId: tenantA, locationId: recoletaId, reservationNumber: numA,
      date: '2026-10-20', time: '20:00', partySize: 2,
      name: 'Ana', phone: '111', notes: '',
    })
    await Reservation.create({
      tenantId: tenantB, locationId: recoletaId, reservationNumber: numB,
      date: '2026-10-21', time: '21:00', partySize: 4,
      name: 'Beto', phone: '222', notes: '',
    })

    // Lookup como lo haría una página pública: { reservationNumber, tenantId }
    const foundA = await Reservation.findOne({ reservationNumber: 'REC-R0001', tenantId: tenantA }).lean()
    const foundB = await Reservation.findOne({ reservationNumber: 'REC-R0001', tenantId: tenantB }).lean()

    expect(foundA).not.toBeNull()
    expect(foundB).not.toBeNull()
    expect(String(foundA!.tenantId)).toBe(String(tenantA))
    expect(String(foundB!.tenantId)).toBe(String(tenantB))
    expect(foundA!.name).toBe('Ana')
    expect(foundB!.name).toBe('Beto')
  })

  it('índice único (tenantId, locationId, reservationNumber) previene duplicados', async () => {
    const num = await nextPerLocationNumber({ tenantId: tenantA, locationId: recoletaId, type: 'reservation', location: { name: 'Recoleta' } })
    await Reservation.create({
      tenantId: tenantA, locationId: recoletaId, reservationNumber: num,
      date: '2026-10-20', time: '20:00', partySize: 2,
      name: 'Primera', phone: '333', notes: '',
    })

    // Misma sede, mismo número, mismo tenant → debe fallar
    await expect(Reservation.create({
      tenantId: tenantA, locationId: recoletaId, reservationNumber: num,
      date: '2026-10-21', time: '21:00', partySize: 3,
      name: 'Duplicada', phone: '444', notes: '',
    })).rejects.toThrow()
  })
})
