import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import User from '@/models/User'
import Order from '@/models/Order'
import FiscalDocument from '@/models/FiscalDocument'
import PosOfflineDevice from '@/models/PosOfflineDevice'
import PosDiscountEvent from '@/models/PosDiscountEvent'
import PosDiscountPolicy from '@/models/PosDiscountPolicy'
import { signJwt } from '@takeasygo/business/jwt'
import { posPinLookup } from '@takeasygo/business/pos-pin'
import { DEFAULT_DISCOUNT_POLICY, type DiscountPolicy } from '@takeasygo/business'
import { __resetPosJwtKeyCacheForTests } from '@/lib/posJwt'
import { auth } from '@/lib/auth'
import { saveDiscountPolicy } from '@/lib/pos-online/discountPolicy'
import { discountSummaryForRegister } from '@/lib/cash/z-discounts'

import { POST as createOrder } from '@/app/api/[tenant]/pos/orders/route'
import { POST as discount, DELETE as removeDiscount } from '@/app/api/[tenant]/pos/orders/[id]/discounts/route'
import { POST as pay } from '@/app/api/[tenant]/pos/orders/[id]/payments/route'
import { GET as posPolicy } from '@/app/api/[tenant]/pos/config/discounts/route'
import { GET as adminPolicyGet, PUT as adminPolicyPut } from '@/app/api/[tenant]/pos-discounts/policy/route'
import { GET as exportCsv } from '@/app/api/[tenant]/pos-discounts/export/route'

/**
 * Política de descuentos por comercio (14/11/2026): autonomía y topes por rol,
 * PIN de quien cubra el descuento, evaluación sobre la cuenta completa,
 * importe final, órdenes facturadas, operaciones sin internet con cambio de
 * política, registro para el reporte y resumen del Z.
 */

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
const SLUG = 'politica-desc'
const PIZZA = '64b0000000000000000000c1'
const EMPANADA = '64b0000000000000000000c2'
const DEVICE = 'device-caja-0002'
const PEPPER = 'pepper-de-test-de-al-menos-16'
const MANAGER_PIN = '482913'
const ADMIN_PIN = '739104'

let tenantId: string
let locationId: string
let managerId: string
let adminId: string
let cashierId: string

type Role = 'cashier' | 'manager' | 'admin' | 'waiter'

function req(url: string, body: unknown, opts: { role?: Role; sub?: string; headers?: Record<string, string>; method?: string } = {}): NextRequest {
  const role = opts.role ?? 'cashier'
  const sub = opts.sub ?? (role === 'manager' ? managerId : role === 'admin' ? adminId : cashierId)
  const token = signJwt({ sub, tenantId, role, deviceType: 'hub' }, PRIVATE_PEM)
  return new Request(url, {
    method: opts.method ?? 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'x-location-id': locationId, ...(opts.headers ?? {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as unknown as NextRequest
}
const base = `http://localhost:3000/api/${SLUG}/pos/orders`
const p = (id?: string) => ({ params: Promise.resolve(id ? { tenant: SLUG, id } : { tenant: SLUG }) }) as never
const offline = (occurredAt: Date, approver?: string) => ({
  'x-pos-op-id': crypto.randomUUID(),
  'x-pos-occurred-at': occurredAt.toISOString(),
  'x-pos-device-id': DEVICE,
  ...(approver ? { 'x-pos-offline-approver': approver } : {}),
})

async function user(role: string, name: string, pin?: string) {
  return String(
    (
      await User.create({
        name,
        email: `${name}-${Math.random().toString(36).slice(2)}@test.com`,
        password: 'x-secret-123',
        phone: `+54${Math.floor(Math.random() * 1e10)}`,
        role,
        tenantId,
        isActive: true,
        ...(pin ? { pin: await bcrypt.hash(pin, 4), posPinLookup: posPinLookup(PEPPER, tenantId, pin) } : {}),
      })
    )._id
  )
}

function policy(patch: { cashier?: Partial<DiscountPolicy['roles']['cashier']>; manager?: Partial<DiscountPolicy['roles']['manager']>; admin?: Partial<DiscountPolicy['roles']['admin']>; allowedReasons?: DiscountPolicy['allowedReasons']; requireNoteFor?: DiscountPolicy['requireNoteFor'] }): DiscountPolicy {
  const d = DEFAULT_DISCOUNT_POLICY
  return {
    roles: {
      cashier: { ...d.roles.cashier, ...patch.cashier },
      manager: { ...d.roles.manager, ...patch.manager },
      admin: { ...d.roles.admin, ...patch.admin },
    },
    allowedReasons: patch.allowedReasons ?? [...d.allowedReasons],
    requireNoteFor: patch.requireNoteFor ?? [...d.requireNoteFor],
  }
}

async function setPolicy(p: DiscountPolicy) {
  const current = await PosDiscountPolicy.findOne({ tenantId }).lean<{ version: number }>()
  return saveDiscountPolicy(tenantId, p, current?.version ?? 0, adminId)
}

beforeAll(() => {
  process.env.POS_JWT_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }) as string
  process.env.POS_PIN_PEPPER = PEPPER
  __resetPosJwtKeyCacheForTests()
})
afterAll(() => {
  delete process.env.POS_PIN_PEPPER
})

beforeEach(async () => {
  ;(auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)
  tenantId = (await Tenant.create({ name: 'Política', slug: SLUG, plan: 'full', features: { posEnabled: true } }))._id.toString()
  locationId = (await Location.create({ tenantId, name: 'Centro', slug: 'centro', address: 'Calle 1', isActive: true }))._id.toString()
  await Menu.create({
    tenantId,
    locationId,
    isActive: true,
    categories: [{ name: 'Cocina', sortOrder: 0, items: [{ _id: PIZZA, name: 'Pizza', price: 10000 }, { _id: EMPANADA, name: 'Empanada', price: 25000 }] }],
  })
  await PosOfflineDevice.create({ tenantId, locationId, deviceId: DEVICE, name: 'Caja', role: 'primary' })
  managerId = await user('manager', 'ana', MANAGER_PIN)
  adminId = await user('admin', 'dueno', ADMIN_PIN)
  cashierId = await user('cashier', 'luis')
})

/** Orden de $350 = 35000 centavos (pizza $100 + empanada $250). */
async function newOrder() {
  const posId = crypto.randomUUID()
  const res = await createOrder(
    req(base, {
      id: posId,
      items: [
        { productId: PIZZA, name: 'Pizza', quantity: 1, unitPrice: 10000, total: 10000 },
        { productId: EMPANADA, name: 'Empanada', quantity: 1, unitPrice: 25000, total: 25000 },
      ],
    }),
    p()
  )
  expect(res.status).toBe(201)
  return posId
}
const orderOf = (posId: string) => Order.findOne({ tenantId, posId }).lean<{ _id: mongoose.Types.ObjectId; total: number; items: { _id: mongoose.Types.ObjectId; name: string; basePrice: number; posDiscount?: { amountCents: number; approvedBy: string | null } | null }[] }>()
const disc = (posId: string, body: Record<string, unknown>, opts: Parameters<typeof req>[2] = {}) => discount(req(`${base}/${posId}/discounts`, body, opts), p(posId))
const errorOf = async (res: Response) => ((await res.json()) as { error: { code: string; message: string } }).error

describe('compatibilidad: sin política guardada rige la regla de la Fase D', () => {
  it('cajero → PIN; encargado → directo; mozo → no', async () => {
    const posId = await newOrder()
    const noPin = await disc(posId, { kind: 'percent', value: 10, reason: 'courtesy' })
    expect(noPin.status).toBe(403)
    expect((await errorOf(noPin)).code).toBe('approval_required')
    expect((await disc(posId, { kind: 'percent', value: 10, reason: 'courtesy' }, { role: 'waiter' })).status).toBe(403)
    expect((await disc(posId, { kind: 'percent', value: 10, reason: 'courtesy' }, { role: 'manager' })).status).toBe(200)
    expect((await orderOf(posId))!.total).toBe(31500)
  })

  it('el POS lee la política (versión 0 = de fábrica); el mozo no', async () => {
    const res = await posPolicy(req(`http://localhost:3000/api/${SLUG}/pos/config/discounts`, undefined, { method: 'GET' }), p())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ version: 0, policy: { roles: { cashier: { autonomyPercent: 0 } } } })
    const waiter = await posPolicy(req(`http://localhost:3000/api/${SLUG}/pos/config/discounts`, undefined, { method: 'GET', role: 'waiter' }), p())
    expect(waiter.status).toBe(403)
  })
})

describe('autonomía y topes por rol', () => {
  it('cajero con autonomía del 10 %: hasta ahí solo; más arriba PIN del encargado; registro con quién autorizó', async () => {
    await setPolicy(policy({ cashier: { autonomyPercent: 10, maxPercent: 30 } }))
    const posId = await newOrder()
    expect((await disc(posId, { kind: 'percent', value: 10, reason: 'courtesy' })).status).toBe(200)
    const own = await PosDiscountEvent.findOne({ tenantId, orderPosId: posId }).lean<{ approvalMode: string; approvedByUserId: string | null; byUserId: string; byName: string }>()
    expect(own).toMatchObject({ approvalMode: 'self', approvedByUserId: null, byUserId: cashierId, byName: 'luis' })

    const over = await disc(posId, { kind: 'percent', value: 20, reason: 'courtesy' })
    expect(over.status).toBe(403)
    const err = await errorOf(over)
    expect(err.code).toBe('approval_required')
    expect(err.message).toContain('20 %')

    const ok = await disc(posId, { kind: 'percent', value: 20, reason: 'courtesy' }, { headers: { 'x-manager-pin': MANAGER_PIN } })
    expect(ok.status).toBe(200)
    expect((await orderOf(posId))!.total).toBe(28000)
    const ev = await PosDiscountEvent.findOne({ tenantId, orderPosId: posId }).sort({ createdAt: -1 }).lean<{ approvalMode: string; approvedByUserId: string; approverName: string; totalBeforeCents: number; totalAfterCents: number; discountDeltaCents: number }>()
    expect(ev).toMatchObject({ approvalMode: 'pin', approvedByUserId: managerId, approverName: 'ana', totalBeforeCents: 31500, totalAfterCents: 28000, discountDeltaCents: 3500 })
  })

  it('por encima del máximo del rol no se aplica ni con PIN', async () => {
    await setPolicy(policy({ cashier: { autonomyPercent: 10, maxPercent: 30 } }))
    const posId = await newOrder()
    const res = await disc(posId, { kind: 'percent', value: 50, reason: 'courtesy' }, { headers: { 'x-manager-pin': MANAGER_PIN } })
    expect(res.status).toBe(403)
    expect((await errorOf(res)).code).toBe('forbidden')
    expect((await orderOf(posId))!.total).toBe(35000)
  })

  it('el tope por monto también cuenta (autonomía $100, máximo $200 sobre una cuenta de $350)', async () => {
    await setPolicy(policy({ cashier: { autonomyPercent: 100, autonomyCents: 10000, maxPercent: 100, maxCents: 20000 } }))
    const posId = await newOrder()
    expect((await disc(posId, { kind: 'amount', value: 10000, reason: 'courtesy' })).status).toBe(200)
    expect((await errorOf(await disc(posId, { kind: 'amount', value: 15000, reason: 'courtesy' }))).code).toBe('approval_required')
    expect((await errorOf(await disc(posId, { kind: 'amount', value: 25000, reason: 'courtesy' }))).code).toBe('forbidden')
  })

  it('partir el descuento en varios platos no esquiva el límite (se mide la cuenta)', async () => {
    await setPolicy(policy({ cashier: { autonomyPercent: 100, autonomyCents: 5000, maxPercent: 100, maxCents: null } }))
    const posId = await newOrder()
    const [pizza, empanada] = (await orderOf(posId))!.items
    // $40 en la pizza: dentro de los $50.
    expect((await disc(posId, { kind: 'amount', value: 4000, reason: 'courtesy', lineId: String(pizza._id) })).status).toBe(200)
    // Otros $40 en la empanada: la cuenta llega a $80 → PIN.
    const second = await disc(posId, { kind: 'amount', value: 4000, reason: 'courtesy', lineId: String(empanada._id) })
    expect((await errorOf(second)).code).toBe('approval_required')
  })

  it('un encargado con límite necesita a un administrador (no a otro encargado ni a sí mismo)', async () => {
    await setPolicy(policy({ manager: { autonomyPercent: 15, maxPercent: 100 } }))
    const posId = await newOrder()
    const own = await disc(posId, { kind: 'percent', value: 20, reason: 'courtesy' }, { role: 'manager' })
    expect((await errorOf(own)).code).toBe('approval_required')
    const selfPin = await disc(posId, { kind: 'percent', value: 20, reason: 'courtesy' }, { role: 'manager', headers: { 'x-manager-pin': MANAGER_PIN } })
    expect((await errorOf(selfPin)).code).toBe('approval_invalid')
    const adminPin = await disc(posId, { kind: 'percent', value: 20, reason: 'courtesy' }, { role: 'manager', headers: { 'x-manager-pin': ADMIN_PIN } })
    expect(adminPin.status).toBe(200)
  })

  it('el PIN de un encargado que no cubre el descuento se rechaza con el mismo mensaje que un PIN incorrecto', async () => {
    await setPolicy(policy({ cashier: { autonomyPercent: 5 }, manager: { autonomyPercent: 10 } }))
    const posId = await newOrder()
    const managerPin = await disc(posId, { kind: 'percent', value: 20, reason: 'courtesy' }, { headers: { 'x-manager-pin': MANAGER_PIN } })
    const wrongPin = await disc(posId, { kind: 'percent', value: 20, reason: 'courtesy' }, { headers: { 'x-manager-pin': '999999' } })
    const a = await errorOf(managerPin)
    const b = await errorOf(wrongPin)
    expect(a.code).toBe('approval_invalid')
    expect(a.message).toBe(b.message)
    expect((await disc(posId, { kind: 'percent', value: 20, reason: 'courtesy' }, { headers: { 'x-manager-pin': ADMIN_PIN } })).status).toBe(200)
  })

  it('cajero sin permiso de descontar: no puede ni con PIN', async () => {
    await setPolicy(policy({ cashier: { enabled: false } }))
    const posId = await newOrder()
    const res = await disc(posId, { kind: 'percent', value: 5, reason: 'courtesy' }, { headers: { 'x-manager-pin': MANAGER_PIN } })
    expect((await errorOf(res)).code).toBe('forbidden')
  })

  it('bajar un descuento no pide PIN; quitarlo queda registrado', async () => {
    const posId = await newOrder()
    expect((await disc(posId, { kind: 'percent', value: 30, reason: 'courtesy' }, { role: 'manager' })).status).toBe(200)
    expect((await disc(posId, { kind: 'percent', value: 10, reason: 'courtesy' })).status).toBe(200)
    expect((await orderOf(posId))!.total).toBe(31500)
    const del = await removeDiscount(req(`${base}/${posId}/discounts`, undefined, { method: 'DELETE' }), p(posId))
    expect(del.status).toBe(200)
    expect((await orderOf(posId))!.total).toBe(35000)
    const removed = await PosDiscountEvent.findOne({ tenantId, orderPosId: posId, action: 'remove' }).lean<{ discountDeltaCents: number; approvalMode: string }>()
    expect(removed).toMatchObject({ discountDeltaCents: -3500, approvalMode: 'none' })
  })
})

describe('motivos', () => {
  it('motivos nuevos aceptados; deshabilitado → 403; observación obligatoria según la política', async () => {
    await setPolicy(policy({ allowedReasons: ['courtesy', 'agreement', 'incident', 'other'], requireNoteFor: ['agreement'] }))
    const posId = await newOrder()
    expect((await errorOf(await disc(posId, { kind: 'percent', value: 10, reason: 'staff' }, { role: 'manager' }))).code).toBe('forbidden')
    const noNote = await disc(posId, { kind: 'percent', value: 10, reason: 'agreement' }, { role: 'manager' })
    expect((await errorOf(noNote)).message).toContain('observación')
    expect((await disc(posId, { kind: 'percent', value: 10, reason: 'agreement', note: 'Convenio empresa X' }, { role: 'manager' })).status).toBe(200)
    expect((await disc(posId, { kind: 'percent', value: 10, reason: 'incident' }, { role: 'manager' })).status).toBe(200)
  })
})

describe('importe final', () => {
  it('cuenta de $350 → cobrar $280: descuento $70 y registro del importe pedido', async () => {
    const posId = await newOrder()
    const res = await disc(posId, { kind: 'amount', value: 7000, reason: 'agreement', finalCents: 28000 }, { role: 'manager' })
    expect(res.status).toBe(200)
    expect((await orderOf(posId))!.total).toBe(28000)
    const ev = await PosDiscountEvent.findOne({ tenantId, orderPosId: posId }).lean<{ requestedFinalCents: number; grossCents: number; totalAfterCents: number }>()
    expect(ev).toMatchObject({ requestedFinalCents: 28000, grossCents: 35000, totalAfterCents: 28000 })
  })

  it('si el total que quedaría no coincide (la cuenta cambió) → 409 y no se toca nada', async () => {
    const posId = await newOrder()
    const res = await disc(posId, { kind: 'amount', value: 7000, reason: 'agreement', finalCents: 29000 }, { role: 'manager' })
    expect(res.status).toBe(409)
    expect((await orderOf(posId))!.total).toBe(35000)
  })

  it('importe final solo como monto y no por plato', async () => {
    const posId = await newOrder()
    expect((await disc(posId, { kind: 'percent', value: 20, reason: 'agreement', finalCents: 28000 }, { role: 'manager' })).status).toBe(400)
    const [pizza] = (await orderOf(posId))!.items
    expect((await disc(posId, { kind: 'amount', value: 2000, reason: 'agreement', finalCents: 8000, lineId: String(pizza._id) }, { role: 'manager' })).status).toBe(400)
  })

  it('descuento del 100 %: la cuenta queda en $0 y se cierra con una parte de $0 (sin factura)', async () => {
    const posId = await newOrder()
    expect((await disc(posId, { kind: 'amount', value: 35000, reason: 'staff', finalCents: 0 }, { role: 'manager' })).status).toBe(200)
    expect((await orderOf(posId))!.total).toBe(0)
    // Dos partes, o una parte que no es efectivo: no.
    const two = await pay(req(`${base}/${posId}/payments`, { payments: [{ id: 'z1', method: 'cash', amount: 0 }, { id: 'z2', method: 'cash', amount: 0 }] }), p(posId))
    expect(two.status).toBe(400)
    const card = await pay(req(`${base}/${posId}/payments`, { payments: [{ id: 'z3', method: 'posnet_debit', amount: 0 }] }), p(posId))
    expect(card.status).toBe(400)
    const ok = await pay(req(`${base}/${posId}/payments`, { payments: [{ id: `zero:${posId}`, method: 'cash', amount: 0 }] }), p(posId))
    expect(ok.status).toBe(201)
    expect((await ok.json()).fiscalObligation).toBe('skipped')
    // Ya cobrada: no se puede volver a descontar.
    expect((await disc(posId, { kind: 'percent', value: 10, reason: 'courtesy' }, { role: 'manager' })).status).toBe(409)
  })

  it('una parte de $0 sobre una cuenta con importe se rechaza', async () => {
    const posId = await newOrder()
    const res = await pay(req(`${base}/${posId}/payments`, { payments: [{ id: 'z1', method: 'cash', amount: 0 }] }), p(posId))
    expect(res.status).toBe(400)
  })
})

describe('integridad', () => {
  it('con factura emitida no se puede cambiar el importe', async () => {
    const posId = await newOrder()
    const order = (await orderOf(posId))!
    await FiscalDocument.collection.insertOne({ tenantId: new mongoose.Types.ObjectId(tenantId), locationId: new mongoose.Types.ObjectId(locationId), orderId: order._id, kind: 'invoice', status: 'authorized', createdAt: new Date() })
    const res = await disc(posId, { kind: 'percent', value: 10, reason: 'courtesy' }, { role: 'manager' })
    expect(res.status).toBe(409)
    expect((await errorOf(res)).message).toContain('factura')
  })

  it('pagada online (MP aprobado) no se descuenta; efectivo «approved» de nacimiento sí', async () => {
    const posId = await newOrder()
    await Order.updateOne({ tenantId, posId }, { $set: { 'payment.status': 'approved', 'payment.method': 'mercadopago' } })
    expect((await disc(posId, { kind: 'percent', value: 10, reason: 'courtesy' }, { role: 'manager' })).status).toBe(409)
  })

  it('repetir el mismo descuento no lo duplica ni deja otro registro', async () => {
    const posId = await newOrder()
    expect((await disc(posId, { kind: 'percent', value: 10, reason: 'courtesy' }, { role: 'manager' })).status).toBe(200)
    expect((await disc(posId, { kind: 'percent', value: 10, reason: 'courtesy' }, { role: 'manager' })).status).toBe(200)
    expect((await orderOf(posId))!.total).toBe(31500)
    expect(await PosDiscountEvent.countDocuments({ tenantId, orderPosId: posId })).toBe(1)
  })
})

describe('sin internet y cambios de política', () => {
  it('lo hecho sin internet bajo la política de ese momento se acepta aunque después se endureció', async () => {
    // v1: cajero hasta 20 % solo. Rige desde hace una hora.
    await setPolicy(policy({ cashier: { autonomyPercent: 20 } }))
    await PosDiscountPolicy.updateOne({ tenantId }, { $set: { 'history.0.validFrom': new Date(Date.now() - 3600_000) } })
    // v2 (ahora): cajero siempre con PIN.
    await setPolicy(policy({ cashier: { autonomyPercent: 0 } }))

    const posId = await newOrder()
    // Online, con la política vigente: PIN.
    expect((await errorOf(await disc(posId, { kind: 'percent', value: 20, reason: 'courtesy' }))).code).toBe('approval_required')
    // Sin internet, hace 10 minutos (regía v1): pasa sin PIN y queda marcado.
    const res = await disc(posId, { kind: 'percent', value: 20, reason: 'courtesy' }, { headers: offline(new Date(Date.now() - 600_000)) })
    expect(res.status).toBe(200)
    const ev = await PosDiscountEvent.findOne({ tenantId, orderPosId: posId }).lean<{ offline: boolean; policyVersion: number; approvalMode: string }>()
    expect(ev).toMatchObject({ offline: true, policyVersion: 1, approvalMode: 'self' })
  })

  it('sin internet: el encargado que no cubre el monto no sirve como aprobador; el admin sí', async () => {
    await setPolicy(policy({ manager: { autonomyPercent: 10 } }))
    // Regía desde antes de la operación sin internet (si no, valdría la de fábrica).
    await PosDiscountPolicy.updateOne({ tenantId }, { $set: { 'history.0.validFrom': new Date(Date.now() - 3600_000) } })
    const posId = await newOrder()
    const viaManager = await disc(posId, { kind: 'percent', value: 25, reason: 'courtesy' }, { headers: offline(new Date(Date.now() - 60_000), managerId) })
    expect((await errorOf(viaManager)).code).toBe('approval_invalid')
    const viaAdmin = await disc(posId, { kind: 'percent', value: 25, reason: 'courtesy' }, { headers: offline(new Date(Date.now() - 60_000), adminId) })
    expect(viaAdmin.status).toBe(200)
    const ev = await PosDiscountEvent.findOne({ tenantId, orderPosId: posId }).lean<{ approvalMode: string; approvedByUserId: string }>()
    expect(ev).toMatchObject({ approvalMode: 'offline_pin', approvedByUserId: adminId })
  })
})

describe('sin internet: aprobador bajo la política de ese momento', () => {
  it('la encargada autorizó cuando su límite lo cubría; después se bajó su límite: igual se acepta', async () => {
    const posId = await newOrder()
    // La política más dura se guarda DESPUÉS de la operación (hecha hace 1 minuto).
    await setPolicy(policy({ manager: { autonomyPercent: 10 } }))
    const res = await disc(posId, { kind: 'percent', value: 25, reason: 'courtesy' }, { headers: offline(new Date(Date.now() - 60_000), managerId) })
    expect(res.status).toBe(200)
    const ev = await PosDiscountEvent.findOne({ tenantId, orderPosId: posId }).lean<{ policyVersion: number; approvedByUserId: string }>()
    expect(ev).toMatchObject({ policyVersion: 0, approvedByUserId: managerId })
    // Online, con la política vigente, esa misma encargada ya no alcanza.
    const online = await disc(await newOrder(), { kind: 'percent', value: 25, reason: 'courtesy' }, { headers: { 'x-manager-pin': MANAGER_PIN } })
    expect((await errorOf(online)).code).toBe('approval_invalid')
  })
})

describe('Z: descuentos del turno por motivo', () => {
  it('suma las ventas de la caja (sin propinas ni anuladas) agrupadas por motivo', async () => {
    const a = await newOrder()
    const b = await newOrder()
    const c = await newOrder()
    await disc(a, { kind: 'percent', value: 10, reason: 'courtesy' }, { role: 'manager' })
    await disc(b, { kind: 'amount', value: 5000, reason: 'agreement', note: 'x' }, { role: 'manager' })
    await disc(c, { kind: 'percent', value: 50, reason: 'courtesy' }, { role: 'manager' })
    await Order.updateOne({ tenantId, posId: c }, { $set: { voided: { at: new Date(), reason: 'load_error' } } })
    const z = await discountSummaryForRegister({
      tenantId,
      locationId,
      movements: [
        { type: 'sale', relatedOrderId: a },
        { type: 'sale', relatedOrderId: `${b}#0` },
        { type: 'sale', relatedOrderId: `${b}#1` },
        { type: 'income', relatedOrderId: `${a}:tip` },
        { type: 'sale', relatedOrderId: c },
      ],
    })
    expect(z).toMatchObject({ totalCents: 8500, orderCount: 2, grossCents: 70000 })
    expect(z!.byReason).toEqual([
      { reason: 'agreement', label: 'Acuerdo comercial', cents: 5000, count: 1 },
      { reason: 'courtesy', label: 'Cortesía de la casa', cents: 3500, count: 1 },
    ])
  })
})

describe('panel admin: política y exportación', () => {
  const adminReq = (path: string, method: string, body?: unknown) =>
    new NextRequest(`http://localhost/api/${SLUG}/${path}`, { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const session = (role: string, id: string) =>
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id, role, tenantId, tenantSlug: SLUG, assignedLocations: [] }, expires: '' })
  const params = { params: Promise.resolve({ tenant: SLUG }) }

  it('encargado ve pero no edita; admin guarda con control de versión; inválido → 400', async () => {
    session('manager', managerId)
    const view = await adminPolicyGet(adminReq('pos-discounts/policy', 'GET'), params)
    expect(view.status).toBe(200)
    expect(await view.json()).toMatchObject({ version: 0, canEdit: false })
    const denied = await adminPolicyPut(adminReq('pos-discounts/policy', 'PUT', { expectedVersion: 0, policy: policy({}) }), params)
    expect(denied.status).toBe(403)

    session('admin', adminId)
    const bad = await adminPolicyPut(adminReq('pos-discounts/policy', 'PUT', { expectedVersion: 0, policy: policy({ cashier: { autonomyPercent: 50, maxPercent: 20 } }) }), params)
    expect(bad.status).toBe(400)
    const ok = await adminPolicyPut(adminReq('pos-discounts/policy', 'PUT', { expectedVersion: 0, policy: policy({ cashier: { autonomyPercent: 10 } }) }), params)
    expect(ok.status).toBe(200)
    expect(await ok.json()).toMatchObject({ version: 1 })
    const stale = await adminPolicyPut(adminReq('pos-discounts/policy', 'PUT', { expectedVersion: 0, policy: policy({ cashier: { autonomyPercent: 5 } }) }), params)
    expect(stale.status).toBe(409)
  })

  it('cajero no accede al panel de descuentos', async () => {
    session('cashier', cashierId)
    expect((await adminPolicyGet(adminReq('pos-discounts/policy', 'GET'), params)).status).toBe(403)
    expect((await exportCsv(adminReq('pos-discounts/export', 'GET'), params)).status).toBe(403)
  })

  it('CSV con importes, motivo y observación; celdas peligrosas neutralizadas', async () => {
    const posId = await newOrder()
    const applied = await disc(posId, { kind: 'amount', value: 7000, reason: 'other', note: '=HYPERLINK("http://x")', finalCents: 28000 }, { role: 'manager' })
    expect(applied.status).toBe(200)
    session('admin', adminId)
    const res = await exportCsv(adminReq('pos-discounts/export', 'GET'), params)
    expect(res.status).toBe(200)
    const csv = await res.text()
    expect(csv).toContain('350,00;350,00;70,00;280,00;280,00;Otro')
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`)
    expect(csv).toContain('ana')
  })
})
