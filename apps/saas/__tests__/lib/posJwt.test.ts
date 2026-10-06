import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { generateKeyPairSync, createHmac, createSign } from 'node:crypto'
import { signJwt, keyFingerprint } from '@takeasygo/business/jwt'
import {
  extractBearerToken,
  getPosJwtPublicKey,
  verifyPosToken,
  PosKeyConfigError,
  __resetPosJwtKeyCacheForTests,
  POS_PUBLIC_KEY_FALLBACK,
} from '@/lib/posJwt'

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
const PUBLIC_PEM = publicKey.export({ type: 'spki', format: 'pem' }) as string

const ORIGINAL_ENV = {
  POS_JWT_PUBLIC_KEY: process.env.POS_JWT_PUBLIC_KEY,
  SSO_JWT_PUBLIC_KEY: process.env.SSO_JWT_PUBLIC_KEY,
  NODE_ENV: process.env.NODE_ENV,
}

function restoreEnv() {
  if (ORIGINAL_ENV.POS_JWT_PUBLIC_KEY === undefined) delete process.env.POS_JWT_PUBLIC_KEY
  else process.env.POS_JWT_PUBLIC_KEY = ORIGINAL_ENV.POS_JWT_PUBLIC_KEY

  if (ORIGINAL_ENV.SSO_JWT_PUBLIC_KEY === undefined) delete process.env.SSO_JWT_PUBLIC_KEY
  else process.env.SSO_JWT_PUBLIC_KEY = ORIGINAL_ENV.SSO_JWT_PUBLIC_KEY

  if (ORIGINAL_ENV.NODE_ENV === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = ORIGINAL_ENV.NODE_ENV
}

const basePayload = {
  sub: '64b0000000000000000000a1',
  tenantId: '64b0000000000000000000b2',
  role: 'cashier' as const,
  deviceType: 'hub' as const,
  locationId: '64b0000000000000000000c3',
}

/** Token RS256 armado a mano: control total del header (kid, alg). */
function craftToken(
  header: Record<string, unknown>,
  payload: Record<string, unknown> = basePayload,
  privateKeyPem: string = PRIVATE_PEM
): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const data = `${b64(header)}.${b64(payload)}`
  const sig = createSign('RSA-SHA256').update(data).sign(privateKeyPem, 'base64url')
  return `${data}.${sig}`
}

beforeEach(() => {
  delete process.env.POS_JWT_PUBLIC_KEY
  delete process.env.SSO_JWT_PUBLIC_KEY
  __resetPosJwtKeyCacheForTests()
})

afterEach(() => {
  restoreEnv()
  __resetPosJwtKeyCacheForTests()
})

describe('extractBearerToken', () => {
  it('extrae el token de un header Bearer válido', () => {
    expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi')
  })

  it('devuelve null sin header', () => {
    expect(extractBearerToken(null)).toBeNull()
  })

  it('devuelve null si no es Bearer', () => {
    expect(extractBearerToken('Basic dXNlcjpwYXNz')).toBeNull()
    expect(extractBearerToken('bearer abc')).toBeNull()
  })

  it('devuelve null con Bearer vacío', () => {
    expect(extractBearerToken('Bearer    ')).toBeNull()
  })
})

describe('getPosJwtPublicKey', () => {
  it('el respaldo embebido es una clave RSA >= 2048 parseable (solo dev/test)', () => {
    const resolved = getPosJwtPublicKey()
    expect(resolved.source).toBe('fallback')
    expect(resolved.pem).toBe(POS_PUBLIC_KEY_FALLBACK.trim())
  })

  it('usa la env cuando es una clave válida', () => {
    process.env.POS_JWT_PUBLIC_KEY = PUBLIC_PEM
    __resetPosJwtKeyCacheForTests()
    const resolved = getPosJwtPublicKey()
    expect(resolved.source).toBe('env')
    expect(resolved.pem).toBe(PUBLIC_PEM.trim())
  })

  it('FAIL-CLOSED: si la env es un PEM corrupto, lanza y NO cae al respaldo', () => {
    // Regresión del bug real: un "clear" pegado dentro del base64 del PEM.
    // Antes esto degradaba en silencio a la clave embebida; ahora es error.
    const corrupt = PUBLIC_PEM.replace('MII', 'MIIclear', 1)
    expect(corrupt).toContain('BEGIN PUBLIC KEY')
    expect(corrupt).toContain('END PUBLIC KEY')

    process.env.SSO_JWT_PUBLIC_KEY = corrupt
    __resetPosJwtKeyCacheForTests()

    expect(() => getPosJwtPublicKey()).toThrow(PosKeyConfigError)
  })

  it('FAIL-CLOSED: si la env es basura, lanza', () => {
    process.env.POS_JWT_PUBLIC_KEY = 'no-es-una-clave'
    __resetPosJwtKeyCacheForTests()
    expect(() => getPosJwtPublicKey()).toThrow(PosKeyConfigError)
  })

  it('si POS está corrupta pero SSO es válida, usa SSO (no lanza)', () => {
    process.env.POS_JWT_PUBLIC_KEY = 'garbage'
    process.env.SSO_JWT_PUBLIC_KEY = PUBLIC_PEM
    __resetPosJwtKeyCacheForTests()
    const resolved = getPosJwtPublicKey()
    expect(resolved.source).toBe('env')
    expect(resolved.pem).toBe(PUBLIC_PEM.trim())
  })

  it('prefiere POS_JWT_PUBLIC_KEY sobre SSO_JWT_PUBLIC_KEY', () => {
    process.env.POS_JWT_PUBLIC_KEY = PUBLIC_PEM
    process.env.SSO_JWT_PUBLIC_KEY = 'garbage'
    __resetPosJwtKeyCacheForTests()
    expect(getPosJwtPublicKey().source).toBe('env')
  })

  it('FAIL-CLOSED en producción: sin env definida lanza (sin respaldo)', () => {
    process.env.NODE_ENV = 'production'
    __resetPosJwtKeyCacheForTests()
    expect(() => getPosJwtPublicKey()).toThrow(PosKeyConfigError)
  })

  it('en producción con env válida funciona normal', () => {
    process.env.NODE_ENV = 'production'
    process.env.POS_JWT_PUBLIC_KEY = PUBLIC_PEM
    __resetPosJwtKeyCacheForTests()
    expect(getPosJwtPublicKey().source).toBe('env')
  })
})

describe('keyFingerprint', () => {
  it('da la misma huella derivando de la pública y de la privada (base del kid)', () => {
    expect(keyFingerprint(PUBLIC_PEM)).toBe(keyFingerprint(PRIVATE_PEM))
  })

  it('es hex de 32 caracteres y distinta entre claves', () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const a = keyFingerprint(PUBLIC_PEM)
    const b = keyFingerprint(other.publicKey.export({ type: 'spki', format: 'pem' }) as string)
    expect(a).toMatch(/^[0-9a-f]{32}$/)
    expect(a).not.toBe(b)
  })
})

describe('verifyPosToken', () => {
  it('verifica un token emitido con la clave configurada y exige su kid', () => {
    process.env.POS_JWT_PUBLIC_KEY = PUBLIC_PEM
    __resetPosJwtKeyCacheForTests()

    const token = signJwt(basePayload, PRIVATE_PEM)
    const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf-8'))
    expect(header.kid).toBe(keyFingerprint(PUBLIC_PEM))

    const payload = verifyPosToken(token)

    expect(payload).not.toBeNull()
    expect(payload!.sub).toBe(basePayload.sub)
    expect(payload!.tenantId).toBe(basePayload.tenantId)
    expect(payload!.role).toBe('cashier')
    expect(payload!.locationId).toBe(basePayload.locationId)
  })

  it('rechaza un token firmado por otra clave', () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const token = signJwt(
      basePayload,
      other.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
    )
    expect(verifyPosToken(token)).toBeNull()
  })

  it('rechaza un token expirado', () => {
    process.env.POS_JWT_PUBLIC_KEY = PUBLIC_PEM
    __resetPosJwtKeyCacheForTests()
    const token = signJwt(basePayload, PRIVATE_PEM, -1000)
    expect(verifyPosToken(token)).toBeNull()
  })

  it('rechaza un payload manipulado (firma rota)', () => {
    process.env.POS_JWT_PUBLIC_KEY = PUBLIC_PEM
    __resetPosJwtKeyCacheForTests()

    const token = signJwt(basePayload, PRIVATE_PEM)
    const [header, payload, signature] = token.split('.')
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), role: 'admin' })
    ).toString('base64url')

    expect(verifyPosToken(`${header}.${forged}.${signature}`)).toBeNull()
  })

  it('rechaza un token vacío o malformado', () => {
    expect(verifyPosToken('')).toBeNull()
    expect(verifyPosToken('un-token')).toBeNull()
    expect(verifyPosToken('a.b.c')).toBeNull()
  })

  it('rechaza un token HS256 (no RS256) aunque la clave fuera la misma', () => {
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const data = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(basePayload)}`
    const sig = createHmac('sha256', PUBLIC_PEM).update(data).digest('base64url')
    expect(verifyPosToken(`${data}.${sig}`)).toBeNull()
  })

  it('FAIL-CLOSED (kid): rechaza un token SIN kid aunque la firma sea válida', () => {
    process.env.POS_JWT_PUBLIC_KEY = PUBLIC_PEM
    __resetPosJwtKeyCacheForTests()

    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const data = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(basePayload)}`
    const sig = createSign('RSA-SHA256').update(data).sign(PRIVATE_PEM, 'base64url')

    expect(verifyPosToken(`${data}.${sig}`)).toBeNull()
  })

  it('FAIL-CLOSED (kid): rechaza kid distinto aunque la firma sea válida', () => {
    process.env.POS_JWT_PUBLIC_KEY = PUBLIC_PEM
    __resetPosJwtKeyCacheForTests()

    const token = craftToken({
      alg: 'RS256',
      typ: 'JWT',
      kid: 'deadbeefdeadbeefdeadbeefdeadbeef',
    })
    expect(verifyPosToken(token)).toBeNull()
  })

  it('FAIL-CLOSED (env): con la env corrupta devuelve null en vez de usar el respaldo', () => {
    process.env.POS_JWT_PUBLIC_KEY = PUBLIC_PEM.replace('MII', 'MIIclear', 1)
    __resetPosJwtKeyCacheForTests()

    const token = signJwt(basePayload, PRIVATE_PEM)
    expect(verifyPosToken(token)).toBeNull()
  })

  it('FAIL-CLOSED (prod): sin env en producción devuelve null', () => {
    process.env.NODE_ENV = 'production'
    __resetPosJwtKeyCacheForTests()

    const token = signJwt(basePayload, PRIVATE_PEM)
    expect(verifyPosToken(token)).toBeNull()
  })
})
