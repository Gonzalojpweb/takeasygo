// ============================================================================
// sso-sede.test.ts — "Ir al SaaS" desde el POS conserva y valida la sede
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/posJwt', () => ({
  verifyPosToken: vi.fn(),
}))
const redisStore = new Map<string, unknown>()
vi.mock('@upstash/redis', () => ({
  Redis: class {
    async get(k: string) { return redisStore.get(k) ?? null }
    async del(k: string) { redisStore.delete(k) }
    async set(k: string, v: unknown) { redisStore.set(k, v) }
  },
}))

import mongoose from 'mongoose'
import User from '@/models/User'
import { verifyPosToken } from '@/lib/posJwt'
import { GET as sso } from '@/app/api/auth/sso/route'

const tenantId = new mongoose.Types.ObjectId()
const sedeA = new mongoose.Types.ObjectId().toString()
const sedeB = new mongoose.Types.ObjectId().toString()

async function call(user: any, locationId?: string) {
  vi.mocked(verifyPosToken).mockResolvedValue({
    sub: user._id.toString(), tenantId: tenantId.toString(), role: 'manager', ...(locationId ? { locationId } : {}),
  } as any)
  redisStore.set('ssoToken:jti-1', '1')
  return sso(new NextRequest('http://localhost/api/auth/sso?token=t&jti=jti-1&callbackUrl=/'))
}

beforeEach(() => {
  redisStore.clear()
})

describe('SSO POS → SaaS y sede', () => {
  it('sede del POS dentro del alcance: redirige al callback con la sede', async () => {
    const user = await User.create({ name: 'M', email: 'm@sso.test', role: 'manager', tenantId, assignedLocations: [sedeA] })
    const res = await call(user, sedeA)
    const location = res.headers.get('location') ?? ''
    expect(location).toContain('/sso-callback')
    expect(location).toContain(`locationId=${sedeA}`)
  })

  it('sede del POS fuera del alcance del usuario → login con error', async () => {
    const user = await User.create({ name: 'M2', email: 'm2@sso.test', role: 'manager', tenantId, assignedLocations: [sedeA] })
    const res = await call(user, sedeB)
    expect(res.headers.get('location')).toContain('sso_forbidden_location')
  })

  it('usuario de tenant (sin sedes asignadas) entra con cualquier sede del POS', async () => {
    const user = await User.create({ name: 'A', email: 'a@sso.test', role: 'admin', tenantId, assignedLocations: [] })
    const res = await call(user, sedeB)
    expect(res.headers.get('location')).toContain('/sso-callback')
  })
})
