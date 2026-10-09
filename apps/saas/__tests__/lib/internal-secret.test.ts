import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  internalSecretValues,
  hasInternalSecretConfigured,
  matchesInternalSecret,
  matchesInternalBearer,
} from '@/lib/internal-secret'

const orig = {
  SYNC_LAYER_SECRET: process.env.SYNC_LAYER_SECRET,
  INTERNAL_API_SECRET: process.env.INTERNAL_API_SECRET,
}

function restoreEnv() {
  if (orig.SYNC_LAYER_SECRET === undefined) delete process.env.SYNC_LAYER_SECRET
  else process.env.SYNC_LAYER_SECRET = orig.SYNC_LAYER_SECRET
  if (orig.INTERNAL_API_SECRET === undefined) delete process.env.INTERNAL_API_SECRET
  else process.env.INTERNAL_API_SECRET = orig.INTERNAL_API_SECRET
}

function setEnv(sync?: string, internal?: string) {
  delete process.env.SYNC_LAYER_SECRET
  delete process.env.INTERNAL_API_SECRET
  if (sync !== undefined) process.env.SYNC_LAYER_SECRET = sync
  if (internal !== undefined) process.env.INTERNAL_API_SECRET = internal
}

beforeEach(() => {
  setEnv()
})

afterEach(() => {
  restoreEnv()
})

describe('internalSecretValues', () => {
  it('lee SYNC_LAYER_SECRET cuando es el único configurado', () => {
    setEnv('sec_sync')
    expect(internalSecretValues()).toEqual(['sec_sync'])
  })

  it('lee INTERNAL_API_SECRET cuando es el único configurado', () => {
    setEnv(undefined, 'sec_internal')
    expect(internalSecretValues()).toEqual(['sec_internal'])
  })

  it('une ambos nombres y deduplica valores iguales', () => {
    setEnv('sec_igual', 'sec_igual')
    expect(internalSecretValues()).toEqual(['sec_igual'])
  })

  it('ambos configurados con valores distintos: los acepta a los dos', () => {
    setEnv('sec_a', 'sec_b')
    expect(internalSecretValues()).toEqual(['sec_a', 'sec_b'])
    expect(matchesInternalSecret('sec_a')).toBe(true)
    expect(matchesInternalSecret('sec_b')).toBe(true)
  })
})

describe('hasInternalSecretConfigured', () => {
  it('false sin ningún secreto (fail-closed)', () => {
    expect(hasInternalSecretConfigured()).toBe(false)
  })

  it('false con strings vacíos (fail-closed)', () => {
    setEnv('', '')
    expect(hasInternalSecretConfigured()).toBe(false)
  })

  it('true con cualquiera de los dos nombres', () => {
    setEnv('sec_sync')
    expect(hasInternalSecretConfigured()).toBe(true)
    setEnv(undefined, 'sec_internal')
    expect(hasInternalSecretConfigured()).toBe(true)
  })
})

describe('matchesInternalSecret', () => {
  it('matchea con SYNC_LAYER_SECRET (nombre que usa confirm-internal/status)', () => {
    setEnv('sec_sync')
    expect(matchesInternalSecret('sec_sync')).toBe(true)
  })

  it('matchea con INTERNAL_API_SECRET (nombre que manda EC2)', () => {
    setEnv(undefined, 'sec_internal')
    expect(matchesInternalSecret('sec_internal')).toBe(true)
  })

  it('valor incorrecto → false (negativo)', () => {
    setEnv('sec_sync')
    expect(matchesInternalSecret('otro')).toBe(false)
  })

  it('sin secretos configurados → false aunque manden cualquier cosa (negativo)', () => {
    expect(matchesInternalSecret('sec_sync')).toBe(false)
    expect(matchesInternalSecret('')).toBe(false)
  })

  it('header ausente/vacío → false (negativo)', () => {
    setEnv('sec_sync')
    expect(matchesInternalSecret(null)).toBe(false)
    expect(matchesInternalSecret(undefined)).toBe(false)
    expect(matchesInternalSecret('')).toBe(false)
  })
})

describe('matchesInternalBearer', () => {
  it('Bearer <sec_sync> → true', () => {
    setEnv('sec_sync')
    expect(matchesInternalBearer('Bearer sec_sync')).toBe(true)
  })

  it('Bearer <sec_internal> → true', () => {
    setEnv(undefined, 'sec_internal')
    expect(matchesInternalBearer('Bearer sec_internal')).toBe(true)
  })

  it('Bearer con valor no-secreto → false (negativo)', () => {
    setEnv('sec_sync')
    expect(matchesInternalBearer('Bearer jwt-de-usuario')).toBe(false)
  })

  it('esquema distinto a Bearer → false (negativo)', () => {
    setEnv('sec_sync')
    expect(matchesInternalBearer('Basic sec_sync')).toBe(false)
  })

  it('Bearer vacío sin secretos → false (negativo)', () => {
    expect(matchesInternalBearer('Bearer ')).toBe(false)
    expect(matchesInternalBearer(null)).toBe(false)
  })
})
