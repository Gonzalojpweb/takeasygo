// ============================================================================
// network-admin.test.ts — administración de la red de beneficios (etapa 3)
// ============================================================================
// Incorporar y aprobar comercios, relaciones en ambos sentidos, acuerdos
// versionados sin retroactividad, campañas, suspensión de recepción que no
// toca el SaaS, auditoría y acceso solo de SuperAdmin con MFA.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

import Tenant from '@/models/Tenant'
import User from '@/models/User'
import NetworkMember from '@/models/NetworkMember'
import NetworkAgreement from '@/models/NetworkAgreement'
import { auth } from '@/lib/auth'
import { resolveAgreement, emitBlockReason } from '@/lib/network/rules'
import { SUPERADMIN_DB_FIELDS, superAdminSession } from '../fixtures/superadmin-session'
import { GET as overviewGet } from '@/app/api/superadmin/network/route'
import { POST as memberPost } from '@/app/api/superadmin/network/members/route'
import { PATCH as memberPatch } from '@/app/api/superadmin/network/members/[tenantId]/route'
import { POST as relationPost } from '@/app/api/superadmin/network/relations/route'
import { PATCH as relationPatch } from '@/app/api/superadmin/network/relations/[relationId]/route'
import { POST as agreementPost } from '@/app/api/superadmin/network/agreements/route'
import { DELETE as agreementDelete } from '@/app/api/superadmin/network/agreements/[agreementId]/route'
import { POST as campaignPost } from '@/app/api/superadmin/network/campaigns/route'
import { PUT as campaignPut } from '@/app/api/superadmin/network/campaigns/[campaignId]/route'

let keke: any
let helado: any

const req = (method: string, path: string, body?: unknown) =>
  new NextRequest(`http://localhost/api/superadmin/network/${path}`, {
    method, headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
const json = async (res: Response) => ({ status: res.status, body: await res.json() })

async function signIn() {
  const sa = await User.create({ name: 'SA', email: `sa-${Math.random().toString(36).slice(2, 8)}@t.test`, password: 'x'.repeat(20), phone: `+54911${Math.floor(Math.random() * 1e8)}`, tenantId: null, ...SUPERADMIN_DB_FIELDS })
  vi.mocked(auth).mockResolvedValue(superAdminSession(String(sa._id)) as any)
}

async function joinAndApprove(t: any) {
  expect((await memberPost(req('POST', 'members', { tenantId: String(t._id) }))).status).toBe(201)
  expect((await memberPatch(req('PATCH', `members/${t._id}`, { action: 'approve' }), { params: Promise.resolve({ tenantId: String(t._id) }) })).status).toBe(200)
}

beforeEach(async () => {
  vi.clearAllMocks()
  keke = await Tenant.create({ slug: 'keke', name: 'Keke & Larry', isActive: true, status: 'active', plan: 'full' })
  helado = await Tenant.create({ slug: 'helado', name: 'Heladería', isActive: true, status: 'active', plan: 'full', vertical: 'heladeria_panaderia' })
  await signIn()
})

describe('acceso', () => {
  it('sin SuperAdmin con MFA: 403 en todo', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'x', role: 'superadmin' }, expires: '' } as any)
    expect((await overviewGet(req('GET', ''))).status).toBe(403)
    expect((await memberPost(req('POST', 'members', { tenantId: String(keke._id) }))).status).toBe(403)
    vi.mocked(auth).mockResolvedValue({ user: { id: 'a', role: 'admin', tenantId: String(keke._id) }, expires: '' } as any)
    expect((await agreementPost(req('POST', 'agreements', {}))).status).toBe(403)
    expect(await NetworkMember.countDocuments()).toBe(0)
  })
})

describe('comercios y relaciones', () => {
  it('incorporar queda pendiente hasta aprobar; no se duplica', async () => {
    const add = await json(await memberPost(req('POST', 'members', { tenantId: String(keke._id), canEmit: true, canReceive: false })))
    expect(add.status).toBe(201)
    expect(add.body.member.status).toBe('pending')
    expect((await memberPost(req('POST', 'members', { tenantId: String(keke._id) }))).status).toBe(409)
    const ok = await json(await memberPatch(req('PATCH', `members/${keke._id}`, { action: 'approve' }), { params: Promise.resolve({ tenantId: String(keke._id) }) }))
    expect(ok.body.member.status).toBe('active')
    expect(ok.body.member.history.map((h: any) => h.action)).toEqual(['added', 'approve'])
  })

  it('relaciones en ambos sentidos, independientes; sin miembros no hay relación', async () => {
    expect((await relationPost(req('POST', 'relations', { emitterTenantId: String(keke._id), receiverTenantId: String(helado._id) }))).status).toBe(409)
    await joinAndApprove(keke)
    await joinAndApprove(helado)
    const kh = await json(await relationPost(req('POST', 'relations', { emitterTenantId: String(keke._id), receiverTenantId: String(helado._id) })))
    expect(kh.status).toBe(201)
    expect((await relationPost(req('POST', 'relations', { emitterTenantId: String(keke._id), receiverTenantId: String(helado._id) }))).status).toBe(409)
    expect((await relationPost(req('POST', 'relations', { emitterTenantId: String(keke._id), receiverTenantId: String(keke._id) }))).status).toBe(400)
    // La inversa es otra relación (reciprocidad opcional).
    expect((await relationPost(req('POST', 'relations', { emitterTenantId: String(helado._id), receiverTenantId: String(keke._id) }))).status).toBe(201)
    // Pausar una dirección no pausa la otra.
    await relationPatch(req('PATCH', `relations/${kh.body.relation._id}`, { status: 'paused' }), { params: Promise.resolve({ relationId: kh.body.relation._id }) })
    const ov = (await json(await overviewGet(req('GET', '')))).body
    const statuses = Object.fromEntries(ov.relations.map((r: any) => [`${r.emitterTenantId}>${r.receiverTenantId}`, r.status]))
    expect(statuses[`${keke._id}>${helado._id}`]).toBe('paused')
    expect(statuses[`${helado._id}>${keke._id}`]).toBe('active')
  })

  it('suspender la recepción corta beneficios nuevos pero no toca el comercio (SaaS)', async () => {
    await joinAndApprove(keke)
    await joinAndApprove(helado)
    await relationPost(req('POST', 'relations', { emitterTenantId: String(keke._id), receiverTenantId: String(helado._id) }))
    const r = await json(await memberPatch(req('PATCH', `members/${helado._id}`, { action: 'suspend_receiving', reason: 'debt', note: 'Deuda de comisiones de 3 semanas' }), { params: Promise.resolve({ tenantId: String(helado._id) }) }))
    expect(r.status).toBe(200)
    const [emitter, receiver] = await Promise.all([NetworkMember.findOne({ tenantId: keke._id }).lean(), NetworkMember.findOne({ tenantId: helado._id }).lean()])
    expect(emitBlockReason({ emitterTenantId: keke._id, receiverTenantId: helado._id, emitter: emitter as any, receiver: receiver as any, relation: { emitterTenantId: keke._id, receiverTenantId: helado._id, status: 'active' } })).toBe('receiver_suspended')
    const t = await Tenant.findById(helado._id).lean() as any
    expect(t.status).toBe('active')
    expect(t.isActive).toBe(true)
    // Sin motivo no se suspende.
    expect((await memberPatch(req('PATCH', `members/${keke._id}`, { action: 'suspend_receiving', reason: 'debt', note: '' }), { params: Promise.resolve({ tenantId: String(keke._id) }) })).status).toBe(400)
  })
})

describe('acuerdos comerciales', () => {
  it('lo define el superadmin; una versión nueva cierra la anterior sin pisarla', async () => {
    await joinAndApprove(helado)
    const v1 = await json(await agreementPost(req('POST', 'agreements', { receiverTenantId: String(helado._id), commissionPercent: 5, debtThresholdCents: 5_000_000 })))
    expect(v1.status).toBe(201)
    expect(v1.body.agreement).toMatchObject({ version: 1, commissionPercent: 5, status: 'active', commissionBase: 'discounted_total' })

    const v2 = await json(await agreementPost(req('POST', 'agreements', { receiverTenantId: String(helado._id), commissionPercent: 8, commissionBase: 'purchase_total', capPerOperationCents: 300_000, debtThresholdCents: 3_000_000 })))
    expect(v2.body.agreement).toMatchObject({ version: 2, commissionPercent: 8, previousId: v1.body.agreement._id })
    const old = await NetworkAgreement.findById(v1.body.agreement._id).lean() as any
    expect(old.status).toBe('superseded')
    expect(old.commissionPercent).toBe(5) // la versión vieja no se modifica
    expect(new Date(old.validTo).getTime()).toBe(new Date(v2.body.agreement.validFrom).getTime())

    // Una operación de antes del cambio sigue con 5 %.
    const all = await NetworkAgreement.find({ receiverTenantId: helado._id }).lean() as any[]
    expect(resolveAgreement(all, { at: new Date(new Date(v2.body.agreement.validFrom).getTime() - 1) })?.commissionPercent).toBe(5)
    expect(resolveAgreement(all, { at: new Date() })?.commissionPercent).toBe(8)

    const end = await agreementDelete(req('DELETE', `agreements/${v2.body.agreement._id}`), { params: Promise.resolve({ agreementId: v2.body.agreement._id }) })
    expect(end.status).toBe(200)
    expect(await NetworkAgreement.countDocuments({ receiverTenantId: helado._id })).toBe(2) // nada se borra
  })

  it('valida porcentaje y umbral; exige que el comercio esté en la red', async () => {
    expect((await agreementPost(req('POST', 'agreements', { receiverTenantId: String(helado._id), commissionPercent: 5, debtThresholdCents: 0 }))).status).toBe(409)
    await joinAndApprove(helado)
    expect((await agreementPost(req('POST', 'agreements', { receiverTenantId: String(helado._id), commissionPercent: 150, debtThresholdCents: 0 }))).status).toBe(400)
    expect((await agreementPost(req('POST', 'agreements', { receiverTenantId: String(helado._id), commissionPercent: 5 }))).status).toBe(400)
    expect((await agreementPost(req('POST', 'agreements', { receiverTenantId: String(helado._id), commissionPercent: 5, debtThresholdCents: 10.5 }))).status).toBe(400)
  })
})

describe('campañas', () => {
  it('se registran para un receptor; los emisores elegidos deben tener relación', async () => {
    await joinAndApprove(keke)
    await joinAndApprove(helado)
    const base = { receiverTenantId: String(helado._id), title: '15% en helados', benefit: { type: 'percent', value: 15, maxDiscountCents: 200_000 }, minPurchaseCents: 500_000, validFrom: '2026-12-01T03:00:00.000Z' }
    expect((await campaignPost(req('POST', 'campaigns', { ...base, allowedEmitterTenantIds: [String(keke._id)] }))).status).toBe(400)
    await relationPost(req('POST', 'relations', { emitterTenantId: String(keke._id), receiverTenantId: String(helado._id) }))
    const c = await json(await campaignPost(req('POST', 'campaigns', { ...base, allowedEmitterTenantIds: [String(keke._id)] })))
    expect(c.status).toBe(201)
    expect(c.body.campaign.status).toBe('draft')

    const upd = await json(await campaignPut(req('PUT', `campaigns/${c.body.campaign._id}`, { ...base, receiverTenantId: String(keke._id), status: 'active' }), { params: Promise.resolve({ campaignId: c.body.campaign._id }) }))
    expect(upd.status).toBe(200)
    expect(upd.body.campaign.status).toBe('active')
    expect(String(upd.body.campaign.receiverTenantId)).toBe(String(helado._id)) // el receptor no cambia

    expect((await campaignPost(req('POST', 'campaigns', { ...base, benefit: { type: 'percent', value: 120 } }))).status).toBe(400)
  })
})
