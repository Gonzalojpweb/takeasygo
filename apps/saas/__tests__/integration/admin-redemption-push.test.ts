import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import mongoose from 'mongoose'
import './setup-replset'

import Tenant from '@/models/Tenant'
import LoyaltyMember from '@/models/LoyaltyMember'
import StoreItem from '@/models/StoreItem'
import StoreRedemption from '@/models/StoreRedemption'
import { hashPhone } from '@/lib/crypto'
import { sendAdminRedemptionPushNotification } from '@/lib/push'
import { verifyMemberToken } from '@/lib/memberToken'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/push', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/push')>()
  return {
    ...orig,
    sendAdminPushNotification: vi.fn().mockResolvedValue(undefined),
    sendAdminRedemptionPushNotification: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock('@/lib/memberToken', () => ({
  verifyMemberToken: vi.fn(),
}))

vi.mock('@/lib/apiAuth', () => ({
  getSessionUser: vi.fn().mockResolvedValue(null),
  requireAuth: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/plans', () => ({
  canAccess: vi.fn().mockReturnValue(true),
  LOYALTY_MEMBER_LIMIT: { full: 10000 },
}))

vi.mock('@/lib/events-server', () => ({
  writeCustomerEvent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/walletService', () => ({
  syncWalletPoints: vi.fn().mockResolvedValue(undefined),
}))

const SLUG = 'push-tenant'
const PHONE = '+5491177778888'

let tenant: Awaited<ReturnType<typeof Tenant.create>>
let member: Awaited<ReturnType<typeof LoyaltyMember.create>>
let item: Awaited<ReturnType<typeof StoreItem.create>>

const pushMock = vi.mocked(sendAdminRedemptionPushNotification)

beforeAll(async () => {
  // Fuera de la transacción: la colección y los índices deben existir ANTES
  // del primer txn ("catalog changes" / LockTimeout de autoIndex en memoria).
  await mongoose.connection.createCollection('storeredemptions').catch(() => {})
  await Promise.all([Tenant.init(), LoyaltyMember.init(), StoreItem.init(), StoreRedemption.init()])
})

beforeEach(async () => {
  vi.clearAllMocks()

  tenant = await Tenant.create({
    name: 'Push Tenant',
    slug: SLUG,
    plan: 'full',
    status: 'active',
    isActive: true,
    pointsConfig: { welcomePoints: 100 },
    store: { enabled: true, redemptionExpiryHours: 24 },
  })
  member = await LoyaltyMember.create({
    tenantId: tenant._id,
    name: 'María',
    phone: PHONE,
    phoneHash: hashPhone(PHONE),
    email: 'maria@test.com',
    status: 'active',
    loyalty: { points: 500 },
  })
  item = await StoreItem.create({
    tenantId: tenant._id,
    name: 'Cachapa',
    category: 'food',
    description: 'Deliciosa cachapa',
    imageUrl: 'https://example.com/cachapa.jpg',
    pointsCost: 100,
    cashValue: 2000,
    isActive: true,
    stock: 5,
  })

  vi.mocked(verifyMemberToken).mockResolvedValue({
    valid: true,
    payload: {
      tenantId: tenant._id.toString(),
      memberId: member._id.toString(),
      phoneHash: hashPhone(PHONE),
      version: 1,
    },
  })
})

function makePost(body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/${SLUG}/store/redemptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-member-token': 'fake-jwt' },
    body: JSON.stringify(body),
  })
}

describe('Push de "nuevo canje" al admin', () => {
  it('canje standalone: emite el push UNA vez; el mismo doc con orderId queda suprimido', async () => {
    const { POST } = await import('@/app/api/[tenant]/store/redemptions/route')
    const { shouldSendAdminRedemptionPush } = await import('@/lib/push')

    // El replset en memoria tira TransientTransactionError (LockTimeout) de
    // forma intermitente; reintento estándar de transacciones MongoDB.
    let res: Response | undefined
    for (let attempt = 0; attempt < 3 && (res?.status ?? 0) !== 200; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 400))
      res = await POST(makePost({ storeItemId: item._id.toString() }), {
        params: Promise.resolve({ tenant: SLUG }),
      })
    }
    expect(res!.status, await res!.clone().text()).toBe(200)

    // Un solo canje → un solo push, con los datos del canje
    expect(pushMock).toHaveBeenCalledTimes(1)
    expect(pushMock).toHaveBeenCalledWith(
      tenant._id.toString(),
      'full',
      'Push Tenant',
      SLUG,
      expect.any(String),
      'María',
      'Cachapa',
      100
    )

    const red = await StoreRedemption.findOne({ storeItemId: item._id })
    expect(red!.source).toBe('standalone')
    expect(red!.orderId).toBeFalsy()

    // Guard contra el doc real: standalone → emite; con orderId (como lo
    // crea el checkout en orders/route) → suprime el push.
    expect(shouldSendAdminRedemptionPush(red!.toObject())).toBe(true)
    expect(shouldSendAdminRedemptionPush({ ...red!.toObject(), orderId: red!._id })).toBe(false)
  })
})
