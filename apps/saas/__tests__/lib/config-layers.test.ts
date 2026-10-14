// ============================================================================
// config-layers.test.ts — Simulaciones config 3 capas (B5)
// ============================================================================
// Verifica que con el flag `config.layers`:
//   1. Flag OFF: location → system (sin tenant layer, comportamiento actual).
//   2. Flag ON: location → tenant → system, con origin tracking.
//   3. Timezone: heredado de sistema/tenant vs propio de la sede.
//   4. UI labels: "Heredado" vs "Propio".
//
// Ejecutar: npx vitest run __tests__/lib/config-layers.test.ts
// ============================================================================

import { describe, it, expect } from 'vitest'
import {
  resolveSetting,
  resolveLocationConfig,
  resolveTimezone,
  originLabel,
  SYSTEM_DEFAULTS,
} from '@/lib/config-layers'

describe('resolveSetting — Flag OFF (default)', () => {
  it('location seteado → location, inherited false', () => {
    const result = resolveSetting(false, 'default', 'tenant', 'location')
    expect(result.value).toBe('location')
    expect(result.origin).toBe('location')
    expect(result.inherited).toBe(false)
  })

  it('location null → system (ignora tenant)', () => {
    const result = resolveSetting(false, 'default', 'tenant', null)
    expect(result.value).toBe('default')
    expect(result.origin).toBe('system')
    expect(result.inherited).toBe(true)
  })

  it('location undefined → system (ignora tenant)', () => {
    const result = resolveSetting(false, 20, 30, undefined)
    expect(result.value).toBe(20)
    expect(result.origin).toBe('system')
  })

  it('flag OFF ignora tenant layer completamente', () => {
    const result = resolveSetting(false, 'sys', 'tenant-val', null)
    expect(result.origin).toBe('system')
    expect(result.value).toBe('sys')
  })
})

describe('resolveSetting — Flag ON', () => {
  it('location seteado → location, inherited false', () => {
    const result = resolveSetting(true, 'default', 'tenant', 'location')
    expect(result.value).toBe('location')
    expect(result.origin).toBe('location')
    expect(result.inherited).toBe(false)
  })

  it('location null + tenant seteado → tenant, inherited true', () => {
    const result = resolveSetting(true, 'default', 'tenant', null)
    expect(result.value).toBe('tenant')
    expect(result.origin).toBe('tenant')
    expect(result.inherited).toBe(true)
  })

  it('location null + tenant null → system, inherited true', () => {
    const result = resolveSetting(true, 'default', null, null)
    expect(result.value).toBe('default')
    expect(result.origin).toBe('system')
    expect(result.inherited).toBe(true)
  })

  it('location undefined + tenant undefined → system', () => {
    const result = resolveSetting(true, 20, undefined, undefined)
    expect(result.value).toBe(20)
    expect(result.origin).toBe('system')
  })

  it('booleans y números funcionan igual', () => {
    expect(resolveSetting(true, true, false, null).value).toBe(false)
    expect(resolveSetting(true, 20, 30, 40).value).toBe(40)
    expect(resolveSetting(true, 20, 30, null).value).toBe(30)
  })
})

describe('resolveLocationConfig', () => {
  it('flag OFF: solo location → system', () => {
    const result = resolveLocationConfig({
      flagEnabled: false,
      tenant: { timezone: 'America/Cordoba', settings: { acceptsOrders: false, estimatedPickupTime: 30 } },
      location: { timezone: null, settings: { acceptsOrders: null, estimatedPickupTime: null } },
    })

    // Todo cae al system default (tenant ignorado)
    expect(result.timezone.value).toBe(SYSTEM_DEFAULTS.timezone)
    expect(result.timezone.origin).toBe('system')
    expect(result.acceptsOrders.value).toBe(true)
    expect(result.estimatedPickupTime.value).toBe(20)
  })

  it('flag ON: 3 capas completas', () => {
    const result = resolveLocationConfig({
      flagEnabled: true,
      tenant: { timezone: 'America/Cordoba', settings: { acceptsOrders: false, estimatedPickupTime: 30 } },
      location: { timezone: null, settings: { acceptsOrders: null, estimatedPickupTime: null } },
    })

    // Timezone: tenant override
    expect(result.timezone.value).toBe('America/Cordoba')
    expect(result.timezone.origin).toBe('tenant')
    expect(result.timezone.inherited).toBe(true)

    // acceptsOrders: tenant override
    expect(result.acceptsOrders.value).toBe(false)
    expect(result.acceptsOrders.origin).toBe('tenant')

    // estimatedPickupTime: tenant override
    expect(result.estimatedPickupTime.value).toBe(30)
    expect(result.estimatedPickupTime.origin).toBe('tenant')
  })

  it('flag ON: location override gana sobre tenant', () => {
    const result = resolveLocationConfig({
      flagEnabled: true,
      tenant: { timezone: 'America/Cordoba', settings: { acceptsOrders: false, estimatedPickupTime: 30 } },
      location: { timezone: 'America/Buenos_Aires', settings: { acceptsOrders: true, estimatedPickupTime: 15 } },
    })

    expect(result.timezone.value).toBe('America/Buenos_Aires')
    expect(result.timezone.origin).toBe('location')
    expect(result.timezone.inherited).toBe(false)

    expect(result.acceptsOrders.value).toBe(true)
    expect(result.acceptsOrders.origin).toBe('location')

    expect(result.estimatedPickupTime.value).toBe(15)
    expect(result.estimatedPickupTime.origin).toBe('location')
  })

  it('flag ON: mix — algunos campos heredados, otros propios', () => {
    const result = resolveLocationConfig({
      flagEnabled: true,
      tenant: { timezone: 'America/Cordoba', settings: { acceptsOrders: false, estimatedPickupTime: null } },
      location: { timezone: null, settings: { acceptsOrders: null, estimatedPickupTime: 45 } },
    })

    // timezone: heredado del tenant
    expect(result.timezone.origin).toBe('tenant')
    expect(result.timezone.inherited).toBe(true)

    // acceptsOrders: heredado del tenant
    expect(result.acceptsOrders.origin).toBe('tenant')

    // estimatedPickupTime: propio de la sede
    expect(result.estimatedPickupTime.origin).toBe('location')
    expect(result.estimatedPickupTime.inherited).toBe(false)
  })

  it('flag ON: sin nada seteado → system defaults', () => {
    const result = resolveLocationConfig({
      flagEnabled: true,
      tenant: null,
      location: null,
    })

    expect(result.timezone.value).toBe(SYSTEM_DEFAULTS.timezone)
    expect(result.timezone.origin).toBe('system')
    expect(result.acceptsOrders.value).toBe(true)
    expect(result.estimatedPickupTime.value).toBe(20)
  })
})

describe('resolveTimezone', () => {
  it('flag OFF: location.timezone ?? default', () => {
    expect(resolveTimezone(null, { timezone: 'America/Cordoba' }, false).value).toBe('America/Cordoba')
    expect(resolveTimezone(null, { timezone: null }, false).value).toBe(SYSTEM_DEFAULTS.timezone)
    expect(resolveTimezone(null, {}, false).value).toBe(SYSTEM_DEFAULTS.timezone)
  })

  it('flag ON: location > tenant > system', () => {
    // Location seteado
    const r1 = resolveTimezone({ timezone: 'America/Cordoba' }, { timezone: 'America/Sao_Paulo' }, true)
    expect(r1.value).toBe('America/Sao_Paulo')
    expect(r1.origin).toBe('location')

    // Solo tenant
    const r2 = resolveTimezone({ timezone: 'America/Cordoba' }, { timezone: null }, true)
    expect(r2.value).toBe('America/Cordoba')
    expect(r2.origin).toBe('tenant')

    // Ninguno
    const r3 = resolveTimezone({ timezone: null }, { timezone: null }, true)
    expect(r3.value).toBe(SYSTEM_DEFAULTS.timezone)
    expect(r3.origin).toBe('system')
  })
})

describe('originLabel — UI labels', () => {
  it('location → "Propio"', () => {
    expect(originLabel('location')).toBe('Propio')
  })

  it('tenant → "Heredado"', () => {
    expect(originLabel('tenant')).toBe('Heredado')
  })

  it('system → "Heredado"', () => {
    expect(originLabel('system')).toBe('Heredado')
  })
})
