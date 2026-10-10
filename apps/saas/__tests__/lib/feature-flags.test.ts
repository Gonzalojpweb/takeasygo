import { describe, it, expect, afterEach } from 'vitest'
import {
  getFlagMode,
  getStrictLocationIdMode,
  isFlagEnabled,
  isStrictLocationIdEnabled,
  FLAGS,
} from '@/lib/feature-flags'

const ENV_KEY = 'NEXT_PUBLIC_FF_' + FLAGS.STRICT_LOCATION_ID

afterEach(() => {
  delete process.env[ENV_KEY]
})

describe('getFlagMode / getStrictLocationIdMode (off|log|enforce)', () => {
  it('sin tenant y sin flag => off (sin cambio de comportamiento)', () => {
    expect(getStrictLocationIdMode(null)).toBe('off')
    expect(getFlagMode(undefined, FLAGS.STRICT_LOCATION_ID)).toBe('off')
  })

  it('boolean true => enforce (compatibilidad hacia atrás)', () => {
    expect(getStrictLocationIdMode({ flags: { [FLAGS.STRICT_LOCATION_ID]: true } })).toBe('enforce')
  })

  it('boolean false → off', () => {
    expect(getStrictLocationIdMode({ flags: { [FLAGS.STRICT_LOCATION_ID]: false } })).toBe('off')
  })

  it('string log → log', () => {
    expect(getStrictLocationIdMode({ flags: { [FLAGS.STRICT_LOCATION_ID]: 'log' } })).toBe('log')
  })

  it('string enforce/off se respetan', () => {
    expect(getFlagMode({ flags: { [FLAGS.STRICT_LOCATION_ID]: 'enforce' } }, FLAGS.STRICT_LOCATION_ID)).toBe('enforce')
    expect(getFlagMode({ flags: { [FLAGS.STRICT_LOCATION_ID]: 'off' } }, FLAGS.STRICT_LOCATION_ID)).toBe('off')
  })

  it('el default es off ante un valor no reconocido (sin-cambio)', () => {
    expect(getFlagMode({ flags: { [FLAGS.STRICT_LOCATION_ID]: 'banana' } }, FLAGS.STRICT_LOCATION_ID)).toBe('off')
  })

  it('el override de entorno gana sobre el tenant (log)', () => {
    process.env[ENV_KEY] = 'log'
    expect(getStrictLocationIdMode({ flags: { 'multisede.strictLocationId': true } })).toBe('log')
  })

  it('isStrictLocationIdEnabled: true en log/enforce, false en off', () => {
    expect(isStrictLocationIdEnabled({ flags: { [FLAGS.STRICT_LOCATION_ID]: 'log' } })).toBe(true)
    expect(isStrictLocationIdEnabled({ flags: { [FLAGS.STRICT_LOCATION_ID]: 'enforce' } })).toBe(true)
    expect(isStrictLocationIdEnabled({ flags: { [FLAGS.STRICT_LOCATION_ID]: 'off' } })).toBe(false)
    expect(isStrictLocationIdEnabled({ flags: {} })).toBe(false)
  })

  it('isFlagEnabled sigue funcionando para flags booleanas', () => {
    expect(isFlagEnabled({ flags: { 'config.layers': true } }, 'config.layers')).toBe(true)
    expect(isFlagEnabled({ flags: { 'config.layers': false } }, 'config.layers')).toBe(false)
    expect(isFlagEnabled({ flags: {} }, 'config.layers')).toBe(false)
  })
})
