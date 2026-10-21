// ============================================================================
// scope-denials.test.ts — Bitácora y alerta de accesos denegados por sede
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import mongoose from 'mongoose'
import './setup'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  escapeHtml: (v: unknown) => String(v),
}))

import AuditLog from '@/models/AuditLog'
import User from '@/models/User'
import { sendEmail } from '@/lib/email'
import { auth } from '@/lib/auth'
import { clearFreshUserCache } from '@/lib/apiAuth'
import { guardRequestLocation } from '@/lib/location-scope'
import { DENIAL_THRESHOLD } from '@/lib/scope-denials'

const tenantId = new mongoose.Types.ObjectId()
const sedeA = new mongoose.Types.ObjectId()
const sedeB = new mongoose.Types.ObjectId()
let user: any

beforeEach(async () => {
  vi.clearAllMocks()
  clearFreshUserCache()
  user = await User.create({ name: 'M', email: 'm@deny.test', role: 'manager', tenantId, assignedLocations: [sedeA] })
  vi.mocked(auth).mockResolvedValue({
    user: { id: user._id.toString(), role: 'manager', tenantId: tenantId.toString(), assignedLocations: [sedeA.toString()] },
    expires: '',
  } as any)
})

const req = () => new NextRequest('http://localhost/api/t/menu/categories')

describe('accesos denegados por sede', () => {
  it('cada rechazo queda en la bitácora con la sede pedida', async () => {
    const res = await guardRequestLocation(req(), sedeB)
    expect(res?.status).toBe(404)
    const log = await AuditLog.findOne({ action: 'multisede.scope_denied' }).lean() as any
    expect(String(log.locationId)).toBe(String(sedeB))
    expect(log.details.route).toBe('/api/t/menu/categories')
  })

  it('un acceso permitido no deja registro', async () => {
    expect(await guardRequestLocation(req(), sedeA)).toBeNull()
    expect(await AuditLog.countDocuments({ action: 'multisede.scope_denied' })).toBe(0)
  })

  it(`${DENIAL_THRESHOLD} rechazos en la ventana disparan UNA alerta (throttle)`, async () => {
    for (let i = 0; i < DENIAL_THRESHOLD + 2; i++) await guardRequestLocation(req(), sedeB)
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })

  it('por debajo del umbral no alerta', async () => {
    for (let i = 0; i < DENIAL_THRESHOLD - 1; i++) await guardRequestLocation(req(), sedeB)
    expect(sendEmail).not.toHaveBeenCalled()
  })
})
