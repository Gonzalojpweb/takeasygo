// ============================================================================
// connectivity.test.ts — pausa automática sin conexión (28/11/2026)
// ============================================================================

import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'
import mongoose from 'mongoose'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))
const sendEmail = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/email', async (orig) => ({ ...(await orig<typeof import('@/lib/email')>()), sendEmail: (...a: unknown[]) => sendEmail(...a) }))

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Order from '@/models/Order'
import User from '@/models/User'
import { connectivityState, recordHeartbeat, storeNoticeForOrder, clampMinutes } from '@/lib/connectivity'

const PRE_HASHED = '$2b$12$' + 'a'.repeat(53)
const min = (n: number) => new Date(Date.now() - n * 60_000)
let tenantId: mongoose.Types.ObjectId
let locationId: mongoose.Types.ObjectId

beforeAll(() => { process.env.ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64') })

beforeEach(async () => {
  sendEmail.mockClear()
  tenantId = (await Tenant.create({ slug: 'conexion', name: 'Conexión', plan: 'full', isActive: true, status: 'active' }))._id
  locationId = (await Location.create({ tenantId, name: 'Centro', slug: 'centro', address: 'Calle 1', isActive: true }))._id
  await User.create({ name: 'Dueña', email: 'duena@t.test', password: PRE_HASHED, phone: '+5491100000009', role: 'admin', tenantId, isActive: true })
})

describe('estado', () => {
  it('apagada no pausa nunca; prendida pausa sin señal; vale la señal más reciente (panel/POS o Sync)', () => {
    expect(connectivityState({}).paused).toBe(false)
    expect(connectivityState({ connectivity: { autoPause: false, lastSeenAt: min(60) } }).paused).toBe(false)
    expect(connectivityState({ connectivity: { autoPause: true, minutes: 3, lastSeenAt: null } }).paused).toBe(true)
    expect(connectivityState({ connectivity: { autoPause: true, minutes: 3, lastSeenAt: min(5) } }).paused).toBe(true)
    expect(connectivityState({ connectivity: { autoPause: true, minutes: 3, lastSeenAt: min(1) } })).toMatchObject({ paused: false, online: true })
    expect(connectivityState({ connectivity: { autoPause: true, minutes: 3, lastSeenAt: min(10) }, pos: { lastSeenAt: min(1) } }).paused).toBe(false)
    expect(clampMinutes(0)).toBe(2)
    expect(clampMinutes(99)).toBe(30)
  })

  it('la señal se guarda solo en sedes del mismo comercio y no se reescribe más de una vez cada 30 s', async () => {
    const other = await Tenant.create({ slug: 'otro', name: 'Otro', plan: 'full', isActive: true, status: 'active' })
    const foreign = await Location.create({ tenantId: other._id, name: 'Ajena', slug: 'ajena', address: 'X', isActive: true })
    expect(await recordHeartbeat(String(tenantId), [String(locationId), String(foreign._id)], 'pos')).toBe(1)
    expect((await Location.findById(foreign._id).lean() as any).connectivity?.lastSeenAt ?? null).toBeNull()
    expect(await recordHeartbeat(String(tenantId), [String(locationId)], 'panel')).toBe(0)
    expect((await Location.findById(locationId).lean() as any).connectivity.lastSeenSource).toBe('pos')
  })
})

describe('pedidos sin atender', () => {
  const order = async (patch: Record<string, unknown> = {}) => Order.create({
    tenantId, locationId, orderNumber: `ORD-${Math.random().toString(36).slice(2, 8)}`, status: 'confirmed', orderMode: 'takeaway', items: [], subtotal: 1000, total: 1000,
    customer: { name: 'Cliente' }, payment: { method: 'cash', status: 'pending' }, statusTimestamps: { confirmedAt: min(10) }, ...patch,
  })

  it('recién entrado o ya en preparación: nada; esperando: aviso al cliente sin email', async () => {
    expect(await storeNoticeForOrder((await order({ statusTimestamps: { confirmedAt: min(2) } })).toObject() as any)).toBeNull()
    expect(await storeNoticeForOrder((await order({ status: 'preparing', statusTimestamps: { confirmedAt: min(20), preparingAt: min(15) } })).toObject() as any)).toBeNull()
    expect(await storeNoticeForOrder((await order({ orderTiming: 'scheduled' })).toObject() as any)).toBeNull()
    const waiting = await storeNoticeForOrder((await order()).toObject() as any)
    expect(waiting).toMatchObject({ kind: 'waiting' })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('con pausa automática y sin señal: local sin conexión + un solo email a los administradores', async () => {
    await Location.updateOne({ _id: locationId }, { $set: { 'connectivity.autoPause': true, 'connectivity.lastSeenAt': min(12) } })
    const o = await order()
    expect(await storeNoticeForOrder(o.toObject() as any)).toMatchObject({ kind: 'store_offline' })
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(sendEmail.mock.calls[0][0]).toBe('duena@t.test')
    const again = (await Order.findById(o._id).lean()) as any
    expect(again.unattendedAlertAt).toBeTruthy()
    expect(await storeNoticeForOrder(again)).toMatchObject({ kind: 'store_offline' })
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })
})
