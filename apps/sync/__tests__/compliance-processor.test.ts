import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import './setup'

import {
  ComplianceConfigModel,
  ComplianceAlertModel,
  DEFAULT_SLA_RULES,
} from '@takeasygo/db'
import {
  processComplianceJob,
  calculateLevel,
  findMatchingRule,
  getElapsedMinutes,
  type ComplianceJobData,
  type ComplianceEmitter,
} from '../src/workers/compliance-processor'

const TENANT_ID = new mongoose.Types.ObjectId()
const LOCATION_ID = new mongoose.Types.ObjectId()

function minutesAgo(min: number): Date {
  return new Date(Date.now() - min * 60_000)
}

async function createOrder(overrides: Partial<Record<string, any>> = {}) {
  const db = mongoose.connection.db!
  const doc = {
    _id: new mongoose.Types.ObjectId(),
    tenantId: TENANT_ID,
    locationId: LOCATION_ID,
    status: 'pending',
    orderMode: 'takeaway',
    orderNumber: '1001',
    statusTimestamps: { createdAt: minutesAgo(6) },
    ...overrides,
  }
  await db.collection('orders').insertOne(doc as any)
  return doc
}

function jobFor(order: any, overrides: Partial<ComplianceJobData> = {}): ComplianceJobData {
  return {
    tenantId: TENANT_ID.toString(),
    locationId: LOCATION_ID.toString(),
    orderId: order._id.toString(),
    orderNumber: order.orderNumber ?? '1001',
    fromStatus: 'pending',
    toStatus: 'confirmed',
    orderMode: 'takeaway',
    level: 2,
    ...overrides,
  }
}

function makeEmitter() {
  const events: any[] = []
  const emit: ComplianceEmitter = async (e) => { events.push(e) }
  return { events, emit }
}

beforeEach(async () => {
  await ComplianceConfigModel.create({
    tenantId: TENANT_ID,
    locationId: null,
    slaRules: DEFAULT_SLA_RULES,
    enabled: true,
    pilotMode: false,
  })
})

// ── Salvaguarda 1: re-check de estado ─────────────────────────────────────────

describe('Re-check 1 — estado de la orden', () => {
  it('orden inexistente → skipped_not_found', async () => {
    const order = await createOrder()
    const ghost = { ...order, _id: new mongoose.Types.ObjectId() }
    const { emit } = makeEmitter()

    const r = await processComplianceJob(jobFor(ghost), emit)
    expect(r.status).toBe('skipped_not_found')
  })

  it('orden en estado terminal (delivered) → skipped_terminal, no crea alerta', async () => {
    const order = await createOrder({ status: 'delivered' })
    const { emit } = makeEmitter()

    const r = await processComplianceJob(jobFor(order), emit)
    expect(r.status).toBe('skipped_terminal')
    expect(await ComplianceAlertModel.countDocuments()).toBe(0)
  })

  it('orden avanzó de pending a confirmed (no terminal) → skipped_status_advanced, no crea alerta', async () => {
    const order = await createOrder({
      status: 'confirmed',
      statusTimestamps: { createdAt: minutesAgo(30), confirmedAt: minutesAgo(25) },
    })
    const { emit, events } = makeEmitter()

    const r = await processComplianceJob(jobFor(order), emit)
    expect(r.status).toBe('skipped_status_advanced')
    expect(r.currentStatus).toBe('confirmed')
    expect(await ComplianceAlertModel.countDocuments()).toBe(0)
    expect(events).toHaveLength(0)
  })

  it('orden sigue en fromStatus → continúa con la evaluación', async () => {
    const order = await createOrder({ statusTimestamps: { createdAt: minutesAgo(6) } })
    const { emit } = makeEmitter()

    const r = await processComplianceJob(jobFor(order), emit)
    expect(r.status).toBe('alert_created')
  })
})

// ── Salvaguarda 2: nivel real del SLA ─────────────────────────────────────────

describe('Re-check 2 — nivel real vs nivel del job', () => {
  it('elapsed < umbral del nivel → skipped_level_not_reached', async () => {
    // Job L2 (5 min) pero la orden tiene solo 4 min en pending
    const order = await createOrder({ statusTimestamps: { createdAt: minutesAgo(4) } })
    const { emit, events } = makeEmitter()

    const r = await processComplianceJob(jobFor(order, { level: 2 }), emit)
    expect(r.status).toBe('skipped_level_not_reached')
    expect(r.expectedLevel).toBe(2)
    expect(await ComplianceAlertModel.countDocuments()).toBe(0)
    expect(events).toHaveLength(0)
  })

  it('elapsed >= umbral → crea alerta con el nivel calculado', async () => {
    const order = await createOrder({ statusTimestamps: { createdAt: minutesAgo(6) } })
    const { emit, events } = makeEmitter()

    const r = await processComplianceJob(jobFor(order, { level: 2 }), emit)
    expect(r.status).toBe('alert_created')
    expect(r.level).toBe(2)

    const alerts = await ComplianceAlertModel.find()
    expect(alerts).toHaveLength(1)
    expect(alerts[0].level).toBe(2)
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('compliance:alert')
  })

  it('config deshabilitada → skipped_disabled', async () => {
    await ComplianceConfigModel.updateOne({ tenantId: TENANT_ID }, { enabled: false })
    const order = await createOrder()
    const { emit } = makeEmitter()

    const r = await processComplianceJob(jobFor(order), emit)
    expect(r.status).toBe('skipped_disabled')
    expect(await ComplianceAlertModel.countDocuments()).toBe(0)
  })

  it('pilotMode activo + job L3 → skipped_pilot_no_l3', async () => {
    await ComplianceConfigModel.updateOne({ tenantId: TENANT_ID }, { pilotMode: true })
    const order = await createOrder({ statusTimestamps: { createdAt: minutesAgo(11) } })
    const { emit } = makeEmitter()

    const r = await processComplianceJob(jobFor(order, { level: 3 }), emit)
    expect(r.status).toBe('skipped_pilot_no_l3')
    expect(await ComplianceAlertModel.countDocuments()).toBe(0)
  })
})

// ── Salvaguarda 3: dedup contra alerta existente ──────────────────────────────

describe('Re-check 3 — dedup de alertas', () => {
  it('ya existe alerta activa de nivel >= al del job → skipped_duplicate (sin emit)', async () => {
    const order = await createOrder({ statusTimestamps: { createdAt: minutesAgo(6) } })
    await ComplianceAlertModel.create({
      tenantId: TENANT_ID,
      locationId: LOCATION_ID,
      orderId: order._id,
      orderNumber: '1001',
      fromStatus: 'pending',
      toStatus: 'confirmed',
      level: 2,
      triggeredAt: new Date(),
    })
    const { emit, events } = makeEmitter()

    const r = await processComplianceJob(jobFor(order, { level: 2 }), emit)
    expect(r.status).toBe('skipped_duplicate')
    expect(r.existingLevel).toBe(2)
    expect(await ComplianceAlertModel.countDocuments()).toBe(1)
    expect(events).toHaveLength(0)
  })

  it('job L1 pero ya hay alerta L2 → skipped_duplicate (no degrada)', async () => {
    const order = await createOrder({ statusTimestamps: { createdAt: minutesAgo(4) } })
    await ComplianceAlertModel.create({
      tenantId: TENANT_ID,
      locationId: LOCATION_ID,
      orderId: order._id,
      orderNumber: '1001',
      fromStatus: 'pending',
      toStatus: 'confirmed',
      level: 2,
      triggeredAt: new Date(),
    })
    const { emit } = makeEmitter()

    const r = await processComplianceJob(jobFor(order, { level: 1 }), emit)
    expect(r.status).toBe('skipped_duplicate')
    expect(await ComplianceAlertModel.countDocuments()).toBe(1)
  })

  it('job L3 sobre alerta existente L2 → escala y emite compliance:escalated', async () => {
    const order = await createOrder({ statusTimestamps: { createdAt: minutesAgo(11) } })
    await ComplianceAlertModel.create({
      tenantId: TENANT_ID,
      locationId: LOCATION_ID,
      orderId: order._id,
      orderNumber: '1001',
      fromStatus: 'pending',
      toStatus: 'confirmed',
      level: 2,
      triggeredAt: new Date(),
    })
    const { emit, events } = makeEmitter()

    const r = await processComplianceJob(jobFor(order, { level: 3 }), emit)
    expect(r.status).toBe('escalated')
    expect(r.level).toBe(3)

    const alerts = await ComplianceAlertModel.find()
    expect(alerts).toHaveLength(1)
    expect(alerts[0].level).toBe(3)
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('compliance:escalated')
    expect(events[0].fromLevel).toBe(2)
  })

  it('dos jobs del mismo nivel en paralelo → solo una alerta (dedup)', async () => {
    const order = await createOrder({ statusTimestamps: { createdAt: minutesAgo(6) } })
    const { emit } = makeEmitter()

    // Simular carrera: ambos jobs pasan los re-checks de estado/nivel a la vez
    // Primero crea la alerta, el segundo debe dedupear.
    const r1 = await processComplianceJob(jobFor(order, { level: 2 }), emit)
    const r2 = await processComplianceJob(jobFor(order, { level: 2 }), emit)

    expect(r1.status).toBe('alert_created')
    expect(r2.status).toBe('skipped_duplicate')
    expect(await ComplianceAlertModel.countDocuments()).toBe(1)
  })
})

// ── Helpers puros ─────────────────────────────────────────────────────────────

describe('calculateLevel', () => {
  const rule = { level1Minutes: 3, level2Minutes: 5, level3Minutes: 10 }

  it('debajo de L1 → 0', () => expect(calculateLevel(2, rule)).toBe(0))
  it('>= L1 → 1', () => expect(calculateLevel(3, rule)).toBe(1))
  it('>= L2 → 2', () => expect(calculateLevel(5, rule)).toBe(2))
  it('>= L3 → 3', () => expect(calculateLevel(10, rule)).toBe(3))
})

describe('findMatchingRule', () => {
  it('prefiere regla del orderMode específico sobre "all"', () => {
    const rules = [
      { fromStatus: 'ready', toStatus: 'delivered', orderMode: 'all', level1Minutes: 1, level2Minutes: 2, level3Minutes: 3 },
      { fromStatus: 'ready', toStatus: 'delivered', orderMode: 'takeaway', level1Minutes: 10, level2Minutes: 20, level3Minutes: 30 },
    ]
    const r = findMatchingRule(rules, 'takeaway', 'ready', 'delivered')
    expect(r?.orderMode).toBe('takeaway')
  })

  it('fallback a DEFAULT_SLA_RULES si la config no tiene la regla', () => {
    const r = findMatchingRule([], 'takeaway', 'pending', 'confirmed')
    expect(r).toBeTruthy()
    expect(r?.toStatus).toBe('confirmed')
  })
})

describe('getElapsedMinutes', () => {
  it('mapea fromStatus al campo de timestamp correcto', () => {
    const ts = { createdAt: minutesAgo(6) }
    const elapsed = getElapsedMinutes(ts, 'pending')
    expect(elapsed).not.toBeNull()
    expect(elapsed!).toBeGreaterThanOrEqual(5.9)
    expect(elapsed!).toBeLessThanOrEqual(6.2)
  })

  it('sin timestamp → null', () => {
    expect(getElapsedMinutes(undefined, 'pending')).toBeNull()
    expect(getElapsedMinutes({}, 'pending')).toBeNull()
  })
})
