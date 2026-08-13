import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks (hoisted para que estén disponibles en las factory de vi.mock) ─────

const mocks = vi.hoisted(() => {
  const mockFindLean = vi.fn()
  const mockFind = vi.fn(() => ({ lean: mockFindLean }))
  const mockDeleteOne = vi.fn()
  const mockSendNotification = vi.fn()
  const mockSetVapidDetails = vi.fn()
  const mockCanAccess = vi.fn()
  const mockToPesos = vi.fn((cents: number) => cents / 100)
  return {
    mockFindLean,
    mockFind,
    mockDeleteOne,
    mockSendNotification,
    mockSetVapidDetails,
    mockCanAccess,
    mockToPesos,
  }
})

vi.mock('@/models/PushSubscription', () => ({
  default: {
    find: (q: any) => mocks.mockFind(q),
    deleteOne: (q: any) => mocks.mockDeleteOne(q),
  },
}))

vi.mock('web-push', () => ({
  default: {
    sendNotification: (...args: any[]) => mocks.mockSendNotification(...args),
    setVapidDetails: (...args: any[]) => mocks.mockSetVapidDetails(...args),
  },
}))

vi.mock('@/lib/plans', () => ({
  canAccess: (...args: any[]) => mocks.mockCanAccess(...args),
}))

vi.mock('@takeasygo/business', () => ({
  toPesos: (cents: number) => mocks.mockToPesos(cents),
}))

// ── Import after mocks ───────────────────────────────────────────────────────

import { sendAdminPushNotification } from '@/lib/push'

const TENANT_ID = '507f1f77bcf86cd799439011'

// ── Tests ────────────────────────────────────────────────────────────────────

describe('sendAdminPushNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockSetVapidDetails.mockReturnValue(undefined)
    mocks.mockDeleteOne.mockResolvedValue(undefined)
  })

  it('no consulta ni envía nada si el plan no incluye adminPushNotifications', async () => {
    mocks.mockCanAccess.mockReturnValue(false)
    mocks.mockFindLean.mockResolvedValue([])

    await sendAdminPushNotification(
      TENANT_ID, 'trial', 'Mi Local', 'milocal', 'ORD-123', 5000, 'Juan'
    )

    expect(mocks.mockFind).not.toHaveBeenCalled()
    expect(mocks.mockSendNotification).not.toHaveBeenCalled()
  })

  it('envía a todos los admins suscriptos cuando el plan lo permite', async () => {
    mocks.mockCanAccess.mockReturnValue(true)
    mocks.mockFindLean.mockResolvedValue([
      { _id: 's1', endpoint: 'e1', p256dh: 'p1', auth: 'a1' },
      { _id: 's2', endpoint: 'e2', p256dh: 'p2', auth: 'a2' },
    ])
    mocks.mockSendNotification.mockResolvedValue({ statusCode: 201 })

    await sendAdminPushNotification(
      TENANT_ID, 'buy', 'Mi Local', 'milocal', 'ORD-123', 5000, 'Juan'
    )

    // Busca suscripciones por tenantId
    expect(mocks.mockFind).toHaveBeenCalledWith({ tenantId: TENANT_ID })
    // Un push por suscripción
    expect(mocks.mockSendNotification).toHaveBeenCalledTimes(2)

    const callArgs = mocks.mockSendNotification.mock.calls[0]
    const payload = JSON.parse(callArgs[1])
    expect(payload.title).toBe('🔔 Nuevo pedido en Mi Local')
    expect(payload.body).toContain('#ORD-123')
    expect(payload.body).toContain('Juan')
    expect(payload.url).toBe('/milocal/admin/orders')
    expect(payload.tag).toBe('order-ORD-123')
    expect(payload.orderNumber).toBe('ORD-123')
  })

  it('elimina la suscripción si el push devuelve 410 (Gone)', async () => {
    mocks.mockCanAccess.mockReturnValue(true)
    mocks.mockFindLean.mockResolvedValue([
      { _id: 's1', endpoint: 'e1', p256dh: 'p1', auth: 'a1' },
    ])
    mocks.mockSendNotification.mockRejectedValue({ statusCode: 410 })

    await sendAdminPushNotification(
      TENANT_ID, 'buy', 'Mi Local', 'milocal', 'ORD-123', 5000, 'Juan'
    )

    expect(mocks.mockDeleteOne).toHaveBeenCalledWith({ _id: 's1' })
  })

  it('no envía nada si no hay suscripciones (early return)', async () => {
    mocks.mockCanAccess.mockReturnValue(true)
    mocks.mockFindLean.mockResolvedValue([])

    await sendAdminPushNotification(
      TENANT_ID, 'buy', 'Mi Local', 'milocal', 'ORD-123', 5000, 'Juan'
    )

    expect(mocks.mockSendNotification).not.toHaveBeenCalled()
  })
})
