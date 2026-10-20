import { describe, it, expect } from 'vitest'
import {
  blockersForChanges,
  evaluateReadiness,
  flagOn,
  hasSharedMpAccount,
  normalizeBooleanFlag,
  normalizeModeValue,
  type ReadinessSignals,
} from '@/lib/multisede-readiness'

function baseSignals(overrides: Partial<ReadinessSignals> = {}): ReadinessSignals {
  return {
    flags: {},
    locations: { total: 2, activas: 2, sinPrefijo: [], dupPrefijos: [], sinTimezone: 0, sinCuentaMp: [] },
    cash: { total: 10, sinSede: 0 },
    mp: { sharedOk: true, cuentas: 1, pendingOrdersSinAccount: 0, pendingResSinAccount: 0 },
    ulr: { total: 3, activas: 3, usuariosActivos: 2 },
    shadowRecientes: 0,
    pedidosRecientesSinSede: 0,
    timezoneTenant: 'America/Argentina/Buenos_Aires',
    ventanaDias: 7,
    ...overrides,
  }
}

describe('flagOn / normalizadores', () => {
  it('interpreta booleanos y modos', () => {
    expect(flagOn({ 'mp.perLocation': true }, 'mp.perLocation')).toBe(true)
    expect(flagOn({ 'mp.perLocation': false }, 'mp.perLocation')).toBe(false)
    expect(flagOn({ 'rbac.sedeScope': 'log' }, 'rbac.sedeScope')).toBe(true)
    expect(flagOn({}, 'rbac.sedeScope')).toBe(false)
    expect(flagOn(null, 'rbac.sedeScope')).toBe(false)
  })

  it('normalizeModeValue acepta boolean, string y numérico', () => {
    expect(normalizeModeValue(true)).toBe('enforce')
    expect(normalizeModeValue(false)).toBe('off')
    expect(normalizeModeValue('log')).toBe('log')
    expect(normalizeModeValue('enforce')).toBe('enforce')
    expect(normalizeModeValue('off')).toBe('off')
    expect(normalizeModeValue(1)).toBe('enforce')
    expect(normalizeModeValue(undefined)).toBe('off')
    expect(normalizeModeValue('cualquiera')).toBe('off')
  })

  it('normalizeBooleanFlag', () => {
    expect(normalizeBooleanFlag('true')).toBe(true)
    expect(normalizeBooleanFlag(1)).toBe(true)
    expect(normalizeBooleanFlag('log')).toBe(false)
    expect(normalizeBooleanFlag(null)).toBe(false)
  })
})

describe('hasSharedMpAccount', () => {
  it('cuenta activa con token => true', () => {
    expect(hasSharedMpAccount({ _id: 'x', slug: 'a', mpAccounts: [{ isActive: true, accessToken: 'tok' }] })).toBe(true)
  })
  it('cuentas sin activa => false', () => {
    expect(hasSharedMpAccount({ _id: 'x', slug: 'a', mpAccounts: [{ isActive: false, accessToken: 'tok' }] })).toBe(false)
  })
  it('legacy configurado => true', () => {
    expect(hasSharedMpAccount({ _id: 'x', slug: 'a', mercadopago: { isConfigured: true, accessToken: 'tok' } })).toBe(true)
  })
  it('sin nada => false', () => {
    expect(hasSharedMpAccount({ _id: 'x', slug: 'a' })).toBe(false)
  })
})

describe('evaluateReadiness', () => {
  it('todo cumplido => sin blockers y verdicts LISTA', () => {
    const { checks, verdicts } = evaluateReadiness(baseSignals())
    expect(checks.filter(c => c.level === 'blocker')).toHaveLength(0)
    expect(verdicts['numbering.perLocation'].state).toBe('LISTA')
    expect(verdicts['multisede.cashSede'].state).toBe('LISTA')
    expect(verdicts['mp.perLocation'].state).toBe('LISTA')
    expect(verdicts['rbac.sedeScope'].state).toBe('LISTA')
  })

  it('sedes sin prefijo bloquean numbering.perLocation', () => {
    const { verdicts, checks } = evaluateReadiness(
      baseSignals({ locations: { total: 2, activas: 2, sinPrefijo: ['Sucursal Norte'], dupPrefijos: [], sinTimezone: 0, sinCuentaMp: [] } })
    )
    expect(verdicts['numbering.perLocation'].state).toBe('BLOCKED')
    expect(checks.find(c => c.id === 'prefix')?.level).toBe('blocker')
  })

  it('caja sin sede bloquea cashSede', () => {
    const { verdicts } = evaluateReadiness(baseSignals({ cash: { total: 5, sinSede: 2 } }))
    expect(verdicts['multisede.cashSede'].state).toBe('BLOCKED')
  })

  it('sin cuenta compartida bloquea mp.perLocation', () => {
    const { verdicts } = evaluateReadiness(
      baseSignals({ mp: { sharedOk: false, cuentas: 0, pendingOrdersSinAccount: 0, pendingResSinAccount: 0 } })
    )
    expect(verdicts['mp.perLocation'].state).toBe('BLOCKED')
  })

  it('sede sin cuenta MP asignada bloquea mp.perLocation', () => {
    const { verdicts, checks } = evaluateReadiness(
      baseSignals({ locations: { total: 2, activas: 2, sinPrefijo: [], dupPrefijos: [], sinTimezone: 0, sinCuentaMp: ['Caba'] } })
    )
    expect(verdicts['mp.perLocation'].state).toBe('BLOCKED')
    expect(checks.find(c => c.id === 'mp-sede')?.level).toBe('blocker')
  })

  it('pagos pendientes sin mpAccountId bloquea mp.perLocation', () => {
    const { verdicts } = evaluateReadiness(
      baseSignals({ mp: { sharedOk: true, cuentas: 1, pendingOrdersSinAccount: 3, pendingResSinAccount: 0 } })
    )
    expect(verdicts['mp.perLocation'].state).toBe('BLOCKED')
  })

  it('sin filas ULR: warn si el flag está off, blocker si está on', () => {
    const off = evaluateReadiness(baseSignals({ ulr: { total: 0, activas: 0, usuariosActivos: 0 } }))
    expect(off.checks.find(c => c.id === 'rbac-filas')?.level).toBe('warn')
    expect(off.verdicts['rbac.sedeScope'].state).toBe('LISTA')

    const on = evaluateReadiness(
      baseSignals({ flags: { 'rbac.sedeScope': 'log' }, ulr: { total: 0, activas: 0, usuariosActivos: 0 } })
    )
    expect(on.checks.find(c => c.id === 'rbac-filas')?.level).toBe('blocker')
    expect(on.verdicts['rbac.sedeScope'].state).toBe('YA ENCENDIDA')
    expect(on.verdicts['rbac.sedeScope'].detail).toContain('blockers')
  })

  it('flag encendida sin blockers => YA ENCENDIDA', () => {
    const { verdicts } = evaluateReadiness(baseSignals({ flags: { 'multisede.cashSede': true } }))
    expect(verdicts['multisede.cashSede'].state).toBe('YA ENCENDIDA')
  })

  it('prefijos duplicados bloquean numbering', () => {
    const { verdicts } = evaluateReadiness(
      baseSignals({ locations: { total: 3, activas: 3, sinPrefijo: [], dupPrefijos: [{ prefix: 'PIZ', count: 2 }], sinTimezone: 0, sinCuentaMp: [] } })
    )
    expect(verdicts['numbering.perLocation'].state).toBe('BLOCKED')
  })
})

describe('blockersForChanges', () => {
  it('no bloquea apagados ni flags sin condiciones', () => {
    const { checks } = evaluateReadiness(
      baseSignals({ locations: { total: 2, activas: 2, sinPrefijo: ['X'], dupPrefijos: [], sinTimezone: 0, sinCuentaMp: [] } })
    )
    expect(blockersForChanges(checks, [{ key: 'numbering.perLocation', next: false }])).toHaveLength(0)
    expect(blockersForChanges(checks, [{ key: 'config.layers', next: true }])).toHaveLength(0)
  })

  it('bloquea encender numbering sin prefijos', () => {
    const { checks } = evaluateReadiness(
      baseSignals({ locations: { total: 2, activas: 2, sinPrefijo: ['X'], dupPrefijos: [], sinTimezone: 0, sinCuentaMp: [] } })
    )
    const blockers = blockersForChanges(checks, [{ key: 'numbering.perLocation', next: true }])
    expect(blockers).toHaveLength(1)
    expect(blockers[0]).toContain('prefijo')
  })

  it('modo log cuenta como encendido para rbac', () => {
    const { checks } = evaluateReadiness(baseSignals({ ulr: { total: 0, activas: 0, usuariosActivos: 0 } }))
    expect(blockersForChanges(checks, [{ key: 'rbac.sedeScope', next: 'log' }])).toHaveLength(0)
    const off = blockersForChanges(checks, [{ key: 'rbac.sedeScope', next: 'off' }])
    expect(off).toHaveLength(0)
  })

  it('dedupe de mensajes', () => {
    const { checks } = evaluateReadiness(
      baseSignals({
        mp: { sharedOk: false, cuentas: 0, pendingOrdersSinAccount: 1, pendingResSinAccount: 0 },
      })
    )
    const blockers = blockersForChanges(checks, [{ key: 'mp.perLocation', next: true }])
    expect(new Set(blockers).size).toBe(blockers.length)
    expect(blockers.length).toBeGreaterThanOrEqual(2)
  })
})
