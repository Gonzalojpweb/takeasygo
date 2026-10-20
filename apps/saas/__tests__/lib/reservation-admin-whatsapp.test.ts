import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/whatsapp', () => ({ sendWhatsApp: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/location-resolvers', () => ({ resolveAdminWhatsApp: vi.fn() }))
vi.mock('@/models/User', () => ({
  default: { find: vi.fn(() => ({ lean: vi.fn().mockResolvedValue([]) })) },
}))
vi.mock('@/models/Tenant', () => ({ default: { findById: vi.fn() } }))

import { sendReservationConfirmation, sendReservationCancellation } from '@/lib/reservationNotifications'
import { sendWhatsApp } from '@/lib/whatsapp'
import { resolveAdminWhatsApp } from '@/lib/location-resolvers'
import Tenant from '@/models/Tenant'

const TENANT_ID = '64b000000000000000000001'
const ADMIN_WA = '+5491155554444'
const CLIENT_WA = '+5491122334455'

const TENANT_INFO = { name: 'Resto Test', slug: 'resto-test' }

const RESERVATION = {
  reservationNumber: 'R0042',
  name: 'María López',
  phone: CLIENT_WA,
  email: 'maria@test.com',
  date: '2026-10-25',
  time: '21:00',
  partySize: 4,
  notes: 'Sin gluten',
  status: 'confirmed',
  paymentAmountCents: 800000,
  spaceName: 'Terraza',
}

function adminWaTexts(): string[] {
  return vi.mocked(sendWhatsApp).mock.calls
    .filter(c => c[0] === ADMIN_WA)
    .map(c => String(c[1]))
}

function mockTenantNotifications(notifications: unknown) {
  vi.mocked(Tenant.findById).mockReturnValue({
    select: () => ({ lean: () => Promise.resolve({ notifications }) }),
  } as any)
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.WHAPI_TOKEN = 'test-token'
  vi.mocked(sendWhatsApp).mockResolvedValue(undefined)
  vi.mocked(resolveAdminWhatsApp).mockResolvedValue({
    phone: ADMIN_WA,
    notifyOnReservation: true,
    notifyOnOrder: true,
  })
  mockTenantNotifications({ whatsappPhone: ADMIN_WA, notifyOnReservation: true })
})

afterEach(() => {
  delete process.env.WHAPI_TOKEN
})

describe('WhatsApp admin — reserva confirmada', () => {
  it('envía al admin el texto completo: teléfono, sede, espacio, código, seña y notas', async () => {
    await sendReservationConfirmation(
      RESERVATION,
      TENANT_INFO,
      'Sede Centro',
      TENANT_ID
    )

    const texts = adminWaTexts()
    expect(texts).toHaveLength(1)
    const text = texts[0]
    expect(text).toContain('✅ *Reserva confirmada en Resto Test*')
    expect(text).toContain('👤 María López — 📱 +5491122334455')
    expect(text).toContain('25 de octubre de 2026')
    expect(text).toContain('21:00 hs')
    expect(text).toContain('4 pers')
    expect(text).toContain('📍 Sede Centro')
    expect(text).toContain('🪑 Terraza')
    expect(text).toContain('🔢 Código #R0042')
    expect(text).toContain('💰 Seña pagada: $8.000')
    expect(text).toContain('📝 Sin gluten')
  })

  it('sigue enviando el WhatsApp al admin aunque el tenant no tenga usuarios admin/manager', async () => {
    // User.find → [] (mock por defecto). Antes del fix, el early return
    // salteaba el bloque de WhatsApp.
    await sendReservationConfirmation(RESERVATION, TENANT_INFO, 'Sede Centro', TENANT_ID)
    expect(adminWaTexts()).toHaveLength(1)
  })

  it('omite la línea de seña cuando paymentAmountCents es 0', async () => {
    await sendReservationConfirmation(
      { ...RESERVATION, paymentAmountCents: 0 },
      TENANT_INFO,
      'Sede Centro',
      TENANT_ID
    )
    const texts = adminWaTexts()
    expect(texts).toHaveLength(1)
    expect(texts[0]).not.toContain('💰')
    expect(texts[0]).not.toContain('Seña')
  })

  it('omite la línea de espacio cuando no hay spaceName', async () => {
    await sendReservationConfirmation(
      { ...RESERVATION, spaceName: undefined },
      TENANT_INFO,
      'Sede Centro',
      TENANT_ID
    )
    expect(adminWaTexts()[0]).not.toContain('🪑')
  })

  it('no envía al admin si notifyOnReservation está en false', async () => {
    vi.mocked(resolveAdminWhatsApp).mockResolvedValue({
      phone: ADMIN_WA,
      notifyOnReservation: false,
    })
    await sendReservationConfirmation(RESERVATION, TENANT_INFO, 'Sede Centro', TENANT_ID)
    expect(adminWaTexts()).toHaveLength(0)
  })

  it('no envía al admin si no hay número configurado', async () => {
    vi.mocked(resolveAdminWhatsApp).mockResolvedValue({ phone: null, notifyOnReservation: true })
    await sendReservationConfirmation(RESERVATION, TENANT_INFO, 'Sede Centro', TENANT_ID)
    expect(adminWaTexts()).toHaveLength(0)
  })

  it('no revienta ni envía al admin si falta WHAPI_TOKEN', async () => {
    delete process.env.WHAPI_TOKEN
    await expect(
      sendReservationConfirmation(RESERVATION, TENANT_INFO, 'Sede Centro', TENANT_ID)
    ).resolves.not.toThrow()
    expect(adminWaTexts()).toHaveLength(0)
  })

  it('no revienta si resolveAdminWhatsApp explota', async () => {
    vi.mocked(resolveAdminWhatsApp).mockRejectedValue(new Error('boom'))
    await expect(
      sendReservationConfirmation(RESERVATION, TENANT_INFO, 'Sede Centro', TENANT_ID)
    ).resolves.not.toThrow()
  })
})

describe('WhatsApp admin — reserva cancelada (regresión)', () => {
  it('sigue enviando el mensaje de cancelación al admin', async () => {
    await sendReservationCancellation(RESERVATION, TENANT_INFO, TENANT_ID)
    const texts = adminWaTexts()
    expect(texts).toHaveLength(1)
    expect(texts[0]).toContain('❌ *Reserva cancelada en Resto Test*')
    expect(texts[0]).toContain('María López')
    expect(texts[0]).toContain('#R0042')
  })
})
