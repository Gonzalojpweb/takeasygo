// ============================================================================
// onboarding-register-guard.test.ts — Protección del alta de comercios
// ============================================================================
// POST /api/onboarding/register: campo trampa, token de formulario firmado
// (≥ 3 s, un solo uso), tope global y limpieza de altas abandonadas.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import './setup'

vi.hoisted(() => {
  process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-secret-onboarding-guard'
})

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/email', () => ({ sendOnboardingVerifyEmail: vi.fn().mockResolvedValue(undefined) }))
const headerStore = new Map<string, string>()
vi.mock('next/headers', () => ({ headers: async () => ({ get: (k: string) => headerStore.get(k.toLowerCase()) ?? null }) }))

import Tenant from '@/models/Tenant'
import User from '@/models/User'
import Location from '@/models/Location'
import { POST as register } from '@/app/api/onboarding/register/route'
import { issueFormToken, purgeAbandonedSignups, GLOBAL_SIGNUPS_PER_10_MIN } from '@/lib/onboarding-guard'
import { rateLimit } from '@/lib/rateLimit'

// setup.ts simula rateLimit (siempre deja pasar); acá se prueba el límite real.
const realRateLimit = await vi.importActual<typeof import('@/lib/rateLimit')>('@/lib/rateLimit')

let ipCounter = 0
beforeEach(async () => {
  // User.phone es único+sparse con default null: dos usuarios sin teléfono
  // chocan (E11000, pendiente conocido que requiere decisión). Este test mide
  // la protección del alta, así que se aísla quitando ese índice en la base de prueba.
  await User.collection.dropIndex('phone_1').catch(() => {})
  realRateLimit.__resetRateLimitForTests()
  vi.mocked(rateLimit).mockImplementation(realRateLimit.rateLimit)
  headerStore.clear()
  // IP distinta por test: el límite por IP (3 / 10 min) no interfiere.
  headerStore.set('x-real-ip', `10.0.0.${++ipCounter}`)
})

const oldToken = () => issueFormToken(Date.now() - 10_000)
const post = (body: Record<string, unknown>) =>
  register(new Request('http://localhost/api/onboarding/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
const valid = (n: number, extra: Record<string, unknown> = {}) => ({ name: `Café Prueba ${n}`, email: `dueno${n}@example.com`, formToken: oldToken(), ...extra })

describe('alta de comercios — protección', () => {
  it('alta normal desde /empezar con token válido', async () => {
    const res = await post(valid(1, { origen: 'menu-lumbre' }))
    expect(res.status).toBe(200)
    const t = await Tenant.findOne({ slug: 'cafe-prueba-1' }).lean() as any
    expect(t.onboarding.origen).toBe('menu-lumbre')
  })

  it('campo trampa completo → rechazo genérico y no crea nada', async () => {
    const res = await post(valid(2, { website: 'http://spam.example' }))
    expect(res.status).toBe(400)
    expect(await Tenant.countDocuments()).toBe(0)
  })

  it('sin token (script que le pega directo a la API) → rechazo', async () => {
    const { formToken: _omit, ...body } = valid(3)
    const res = await post(body)
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('form_token')
  })

  it('token falsificado o enviado demasiado rápido → rechazo', async () => {
    expect((await post(valid(4, { formToken: `${Date.now() - 10_000}.firmafalsa` }))).status).toBe(400)
    expect((await post(valid(5, { formToken: issueFormToken() }))).status).toBe(400) // < 3 s
    expect(await Tenant.countDocuments()).toBe(0)
  })

  it('el mismo token no sirve dos veces', async () => {
    const formToken = oldToken()
    expect((await post(valid(6, { formToken }))).status).toBe(200)
    headerStore.set('x-real-ip', '10.9.9.9')
    const second = await post(valid(7, { formToken }))
    expect(second.status).toBe(400)
    expect(await Tenant.countDocuments()).toBe(1)
  })

  it('tope global: muchas IPs distintas no pueden crear cuentas sin límite', async () => {
    let created = 0
    for (let i = 0; i < GLOBAL_SIGNUPS_PER_10_MIN + 3; i++) {
      headerStore.set('x-real-ip', `172.16.${i}.1`)
      const res = await post(valid(100 + i))
      if (res.status === 200) created++
      else expect(res.status).toBe(429)
    }
    expect(created).toBe(GLOBAL_SIGNUPS_PER_10_MIN)
  })
})

describe('limpieza de altas abandonadas', () => {
  it('borra borradores sin verificar de más de 7 días y respeta el resto', async () => {
    const old = new Date(Date.now() - 8 * 24 * 60 * 60_000)
    const mk = async (slug: string, opts: { verified?: boolean; status?: string; createdAt?: Date; withLocation?: boolean }) => {
      const t = await Tenant.create({ name: slug, slug, plan: 'trial', status: 'active', onboarding: { status: opts.status ?? 'draft', step: 1 } })
      await Tenant.collection.updateOne({ _id: t._id }, { $set: { createdAt: opts.createdAt ?? old } })
      await User.create({ name: slug, email: `${slug}@example.com`, role: 'admin', tenantId: t._id, emailVerified: opts.verified ? new Date() : null })
      if (opts.withLocation) await Location.create({ tenantId: t._id, slug: 'sede', name: 'Sede', address: 'X', isActive: true })
      return t
    }
    await mk('basura-vieja', {})
    await mk('verificado', { verified: true })
    await mk('reciente', { createdAt: new Date() })
    await mk('aprobado', { status: 'approved' })
    await mk('con-sede', { withLocation: true })

    expect(await purgeAbandonedSignups()).toBe(1)
    const slugs = (await Tenant.find().select('slug').lean() as any[]).map(t => t.slug).sort()
    expect(slugs).toEqual(['aprobado', 'con-sede', 'reciente', 'verificado'])
    expect(await User.exists({ email: 'basura-vieja@example.com' })).toBeNull()
  })
})
