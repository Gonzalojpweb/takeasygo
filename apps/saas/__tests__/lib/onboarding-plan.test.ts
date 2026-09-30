/**
 * __tests__/lib/onboarding-plan.test.ts
 *
 * Picker de plan del onboarding (Fase 9.1):
 * - resolveInitialPlan() SIEMPRE corre en el server y es la autoridad
 * - 'demo' nunca puede terminar en un plan pago
 * - el registro guarda selectedPlan sin tocar tenant.plan
 */

import { resolveInitialPlan, SELECTABLE_PLANS, type SelectablePlan } from '@/lib/plans'
import { onboardingRegisterSchema } from '@/lib/schemas'
import Tenant from '@/models/Tenant'

// ── resolveInitialPlan ────────────────────────────────────────────────────────

describe('resolveInitialPlan', () => {
  it('acepta los cuatro planes seleccionables', () => {
    for (const p of SELECTABLE_PLANS) {
      expect(resolveInitialPlan(p, null)).toBe(p)
    }
  })

  it('no deja elegir anfitrion (asignación interna)', () => {
    expect(resolveInitialPlan('anfitrion', null)).toBe('trial')
  })

  it('cae a trial con plan desconocido o inventado', () => {
    expect(resolveInitialPlan('banana', null)).toBe('trial')
    expect(resolveInitialPlan('premium-pro', 'organic')).toBe('trial')
    expect(resolveInitialPlan('', null)).toBe('trial')
    expect(resolveInitialPlan(null, null)).toBe('trial')
    expect(resolveInitialPlan(undefined, undefined)).toBe('trial')
  })

  it('fuerza trial cuando el origen es demo, aunque el cliente pida otro', () => {
    expect(resolveInitialPlan('full', 'demo')).toBe('trial')
    expect(resolveInitialPlan('buy', 'demo')).toBe('trial')
    expect(resolveInitialPlan('trial', 'demo')).toBe('trial')
    expect(resolveInitialPlan('anfitrion', 'demo')).toBe('trial')
  })

  it('ignora origenes distintos de demo', () => {
    expect(resolveInitialPlan('buy', 'landing')).toBe('buy')
    expect(resolveInitialPlan('full', 'whatsapp')).toBe('full')
    expect(resolveInitialPlan('full', '')).toBe('full')
  })

  it('SELECTABLE_PLANS no expone anfitrion', () => {
    expect(SELECTABLE_PLANS).not.toContain('anfitrion')
    expect(SELECTABLE_PLANS).toEqual(['trial', 'try', 'buy', 'full'])
  })

  it('el tipo devuelto es siempre un plan seleccionable', () => {
    const p: SelectablePlan = resolveInitialPlan('cualquiera', 'demo')
    expect(SELECTABLE_PLANS).toContain(p)
  })
})

// ── onboardingRegisterSchema ──────────────────────────────────────────────────

describe('onboardingRegisterSchema — selectedPlan / origen', () => {
  const base = {
    name: 'Ñandú Café',
    slug: '',
    email: 'dueno@ejemplo.com',
  }

  it('preselecciona trial cuando no mandan nada', () => {
    const parsed = onboardingRegisterSchema.parse(base)
    expect(parsed.selectedPlan).toBe('trial')
    expect(parsed.origen).toBe('')
  })

  it('acepta los cuatro planes seleccionables', () => {
    for (const p of SELECTABLE_PLANS) {
      expect(onboardingRegisterSchema.parse({ ...base, selectedPlan: p }).selectedPlan).toBe(p)
    }
  })

  it('rechaza anfitrion y planes inventados', () => {
    expect(onboardingRegisterSchema.safeParse({ ...base, selectedPlan: 'anfitrion' }).success).toBe(false)
    expect(onboardingRegisterSchema.safeParse({ ...base, selectedPlan: 'banana' }).success).toBe(false)
    expect(onboardingRegisterSchema.safeParse({ ...base, selectedPlan: 123 }).success).toBe(false)
  })

  it('valida el origen como texto corto', () => {
    expect(onboardingRegisterSchema.parse({ ...base, origen: 'demo' }).origen).toBe('demo')
    expect(
      onboardingRegisterSchema.safeParse({ ...base, origen: 'x'.repeat(41) }).success
    ).toBe(false)
  })

  it('no rompe con los campos viejos (retrocompatible)', () => {
    const parsed = onboardingRegisterSchema.parse(base)
    expect(parsed.name).toBe('Ñandú Café')
    expect(parsed.email).toBe('dueno@ejemplo.com')
  })
})

// ── Modelo Tenant ─────────────────────────────────────────────────────────────

describe('Tenant.onboarding.selectedPlan', () => {
  it('nace en trial aunque no se mande', () => {
    const t = new Tenant({ name: 'X', slug: 'x' })
    expect(t.onboarding.selectedPlan).toBe('trial')
    expect(t.onboarding.origen).toBe(null)
  })

  it('persiste el plan elegido', () => {
    const t = new Tenant({
      name: 'X',
      slug: 'x',
      onboarding: { selectedPlan: 'buy' as const, origen: 'landing' },
    })
    expect(t.onboarding.selectedPlan).toBe('buy')
    expect(t.onboarding.origen).toBe('landing')
  })

  it('rechaza planes fuera del enum', () => {
    const t = new Tenant({
      name: 'X',
      slug: 'x',
      onboarding: { selectedPlan: 'banana' as unknown as 'trial' },
    })
    expect(t.validateSync()?.errors?.['onboarding.selectedPlan']).toBeDefined()
  })

  it('el plan real del tenant sigue en trial hasta la aprobación', () => {
    const t = new Tenant({
      name: 'X',
      slug: 'x',
      plan: 'trial',
      onboarding: { selectedPlan: 'full' as const },
    })
    expect(t.plan).toBe('trial')
    expect(t.onboarding.selectedPlan).toBe('full')
  })
})
