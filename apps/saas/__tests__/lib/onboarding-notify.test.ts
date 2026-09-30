/**
 * __tests__/lib/onboarding-notify.test.ts
 *
 * notify.ts — quién recibe el mail de revisión y qué recibe el prospecto
 * cuando superadmin aprueba/rechaza su onboarding.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  notifyReviewSubmission,
  notifyOnboardingDecision,
} from '@/lib/onboarding/notify'

const { sendEmail, sendOnboardingApprovedEmail, sendOnboardingRejectedEmail } = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  sendOnboardingApprovedEmail: vi.fn(),
  sendOnboardingRejectedEmail: vi.fn(),
}))

vi.mock('@/lib/email', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/email')>()
  return {
    ...actual, // escapeHtml / safeHeader se testean reales
    sendEmail,
    sendOnboardingApprovedEmail,
    sendOnboardingRejectedEmail,
  }
})

const tenant = { name: 'Pastrami', slug: 'pastrami' }
const FALLBACK = 'takeasygo.latam@gmail.com'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('APP_URL', 'https://takeasygo.com')
  vi.stubEnv('ADMIN_EMAIL', 'gonzalo@takeasygo.com')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

// ── Destinatario del mail de revisión ─────────────────────────────────────────

describe('notifyReviewSubmission — destinatario', () => {
  it('usa ADMIN_EMAIL cuando está definida', async () => {
    await notifyReviewSubmission(tenant)
    expect(sendEmail).toHaveBeenCalledWith(
      'gonzalo@takeasygo.com',
      expect.any(String),
      expect.any(String)
    )
  })

  it('cae al hardcodeado si ADMIN_EMAIL está vacía', async () => {
    vi.stubEnv('ADMIN_EMAIL', '   ')
    await notifyReviewSubmission(tenant)
    expect(sendEmail.mock.calls[0][0]).toBe(FALLBACK)
  })

  it('cae al hardcodeado si ADMIN_EMAIL no existe', async () => {
    delete process.env.ADMIN_EMAIL
    await notifyReviewSubmission(tenant)
    expect(sendEmail.mock.calls[0][0]).toBe(FALLBACK)
  })

  it('arma el link del superadmin con APP_URL', async () => {
    await notifyReviewSubmission(tenant)
    const html = sendEmail.mock.calls[0][2] as string
    expect(html).toContain('https://takeasygo.com/superadmin/tenants')
  })

  it('nunca lanza si el SMTP falla', async () => {
    sendEmail.mockRejectedValueOnce(new Error('smtp down'))
    await expect(notifyReviewSubmission(tenant)).resolves.toBeUndefined()
  })
})

// ── Aviso al prospecto al decidir ─────────────────────────────────────────────

describe('notifyOnboardingDecision', () => {
  it('al aprobar, linkea al panel del tenant', async () => {
    await notifyOnboardingDecision(tenant, 'prospecto@mail.com', 'approved')
    expect(sendOnboardingApprovedEmail).toHaveBeenCalledTimes(1)
    expect(sendOnboardingApprovedEmail).toHaveBeenCalledWith(
      'prospecto@mail.com',
      'https://takeasygo.com/pastrami/admin'
    )
    expect(sendOnboardingRejectedEmail).not.toHaveBeenCalled()
  })

  it('al rechazar, linkea a la pantalla de estado con el motivo', async () => {
    await notifyOnboardingDecision(tenant, 'prospecto@mail.com', 'rejected', 'Falta el logo')
    expect(sendOnboardingRejectedEmail).toHaveBeenCalledWith(
      'prospecto@mail.com',
      'Falta el logo',
      'https://takeasygo.com/pastrami/admin/onboarding/estado'
    )
    expect(sendOnboardingApprovedEmail).not.toHaveBeenCalled()
  })

  it('rechazo sin motivo usa un texto por defecto', async () => {
    await notifyOnboardingDecision(tenant, 'prospecto@mail.com', 'rejected', '  ')
    expect(sendOnboardingRejectedEmail.mock.calls[0][1]).toBe('No especificado')
  })

  it('no hace nada sin destinatario', async () => {
    await notifyOnboardingDecision(tenant, '', 'approved')
    expect(sendOnboardingApprovedEmail).not.toHaveBeenCalled()
    expect(sendOnboardingRejectedEmail).not.toHaveBeenCalled()
  })

  it('nunca lanza si el SMTP falla (la revisión no se rompe)', async () => {
    sendOnboardingApprovedEmail.mockRejectedValueOnce(new Error('smtp down'))
    await expect(
      notifyOnboardingDecision(tenant, 'prospecto@mail.com', 'approved')
    ).resolves.toBeUndefined()
  })

  it('respeta APP_URL de staging', async () => {
    vi.stubEnv('APP_URL', 'https://staging.takeasygo.com')
    await notifyOnboardingDecision(tenant, 'prospecto@mail.com', 'approved')
    expect(sendOnboardingApprovedEmail.mock.calls[0][1]).toBe(
      'https://staging.takeasygo.com/pastrami/admin'
    )
  })
})

// ── Fotos del menú en el mail de revisión ────────────────────────────────────

describe('notifyReviewSubmission — fotos del menú', () => {
  const withPhotos = (...urls: string[]) => ({
    ...tenant,
    onboarding: { menuPhotos: urls },
  })

  it('embebe cada foto como thumbnail linkeado', async () => {
    await notifyReviewSubmission(
      withPhotos('https://cdn/a.jpg', 'https://cdn/b.jpg')
    )
    const html = sendEmail.mock.calls[0][2] as string
    expect(html).toContain('https://cdn/a.jpg')
    expect(html).toContain('https://cdn/b.jpg')
    expect(html).toContain('<img')
    expect(html).toContain('Fotos del menú que subió el solicitante (2)')
  })

  it('no muestra la sección si no hay fotos', async () => {
    await notifyReviewSubmission(withPhotos())
    const html = sendEmail.mock.calls[0][2] as string
    expect(html).not.toContain('Fotos del menú que subió el solicitante')
    expect(html).not.toContain('<img')
  })

  it('no muestra la sección si el campo ni existe (tenant precargado)', async () => {
    await notifyReviewSubmission(tenant)
    const html = sendEmail.mock.calls[0][2] as string
    expect(html).not.toContain('Fotos del menú que subió el solicitante')
  })
})

// ── Texto libre sin romper el HTML del mail ──────────────────────────────────

describe('notifyReviewSubmission — nombres hostiles', () => {
  it('escapa el HTML del nombre del negocio', async () => {
    await notifyReviewSubmission({
      name: '<script>alert(1)</script> & Cía.',
      slug: 'cia',
    })
    const html = sendEmail.mock.calls[0][2] as string
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&amp; Cía.')
  })

  it('saca saltos de línea del asunto (inyección de headers)', async () => {
    await notifyReviewSubmission({
      name: 'Pizzería\r\nBcc: victima@mail.com',
      slug: 'pizzeria',
    })
    const subject = sendEmail.mock.calls[0][1] as string
    expect(subject).not.toMatch(/[\r\n]/)
    expect(subject).toContain('Pizzería Bcc: victima@mail.com')
  })
})
