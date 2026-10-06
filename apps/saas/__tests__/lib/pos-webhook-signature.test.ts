import { describe, it, expect } from 'vitest'
import {
  computePosWebhookSignature,
  verifyPosWebhookSignature,
  POS_WEBHOOK_TOLERANCE_SECONDS,
} from '@/lib/pos-webhook-signature'

const SECRET = 'webhook_secret_test'
const NOW = 1_800_000_000
const RAW_BODY = JSON.stringify({
  event: 'ORDER-CONFIRMED',
  externalOrderId: 'REST-123',
  timestamp: new Date(NOW * 1000).toISOString(),
})

function verify(overrides: Partial<Parameters<typeof verifyPosWebhookSignature>[0]> = {}) {
  return verifyPosWebhookSignature({
    rawBody: RAW_BODY,
    signature: computePosWebhookSignature(SECRET, RAW_BODY),
    timestamp: new Date(NOW * 1000).toISOString(),
    secret: SECRET,
    allowUnsigned: false,
    nowSeconds: NOW,
    ...overrides,
  })
}

describe('verifyPosWebhookSignature — casos válidos', () => {
  it('firma correcta + timestamp fresco (ISO) → ok', () => {
    expect(verify()).toEqual({ ok: true, unsigned: false })
  })

  it('acepta timestamp en unix seconds', () => {
    expect(verify({ timestamp: NOW })).toEqual({ ok: true, unsigned: false })
  })

  it('acepta timestamp en unix ms', () => {
    expect(verify({ timestamp: NOW * 1000 })).toEqual({ ok: true, unsigned: false })
  })

  it('acepta timestamp en string numérico', () => {
    expect(verify({ timestamp: String(NOW) })).toEqual({ ok: true, unsigned: false })
  })

  it('acepta firma en mayúsculas', () => {
    expect(
      verify({ signature: computePosWebhookSignature(SECRET, RAW_BODY).toUpperCase() })
    ).toEqual({ ok: true, unsigned: false })
  })

  it('límite exacto de la ventana (±tolerancia) → ok', () => {
    const older = NOW - POS_WEBHOOK_TOLERANCE_SECONDS
    const newer = NOW + POS_WEBHOOK_TOLERANCE_SECONDS
    expect(verify({ timestamp: older })).toEqual({ ok: true, unsigned: false })
    expect(verify({ timestamp: newer })).toEqual({ ok: true, unsigned: false })
  })
})

describe('verifyPosWebhookSignature — firma obligatoria (negativos)', () => {
  it('sin firma y sin flag → 401 Firma requerida', () => {
    const res = verify({ signature: null })
    expect(res).toEqual({ ok: false, status: 401, error: 'Firma requerida' })
  })

  it('firma vacía se trata como ausente → 401', () => {
    const res = verify({ signature: '' })
    expect(res).toEqual({ ok: false, status: 401, error: 'Firma requerida' })
  })

  it('firma de OTRO secreto → 401 Invalid signature', () => {
    const res = verify({ signature: computePosWebhookSignature('otro-secreto', RAW_BODY) })
    expect(res).toEqual({ ok: false, status: 401, error: 'Invalid signature' })
  })

  it('body alterado después de firmar → 401 Invalid signature', () => {
    const firmado = computePosWebhookSignature(SECRET, RAW_BODY)
    const alterado = RAW_BODY.replace('REST-123', 'REST-999')
    const res = verify({ rawBody: alterado, signature: firmado })
    expect(res).toEqual({ ok: false, status: 401, error: 'Invalid signature' })
  })

  it('firma no-hex → 401 sin lanzar', () => {
    const res = verify({ signature: 'z'.repeat(64) })
    expect(res).toEqual({ ok: false, status: 401, error: 'Invalid signature' })
  })

  it('firma de longitud distinta → 401 sin lanzar', () => {
    const res = verify({ signature: 'ab' })
    expect(res).toEqual({ ok: false, status: 401, error: 'Invalid signature' })
  })

  it('con allowUnsigned, una firma PRESENTE e inválida igual se rechaza', () => {
    const res = verify({
      signature: computePosWebhookSignature('otro-secreto', RAW_BODY),
      allowUnsigned: true,
    })
    expect(res).toEqual({ ok: false, status: 401, error: 'Invalid signature' })
  })
})

describe('verifyPosWebhookSignature — anti-replay por timestamp', () => {
  it('firma válida sin timestamp → 401 Falta timestamp', () => {
    const res = verify({ timestamp: undefined })
    expect(res).toEqual({ ok: false, status: 401, error: 'Falta timestamp' })
  })

  it('firma válida con timestamp no parseable → 401 Falta timestamp', () => {
    const res = verify({ timestamp: 'no-es-una-fecha' })
    expect(res).toEqual({ ok: false, status: 401, error: 'Falta timestamp' })
  })

  it('timestamp viejo (fuera de ventana por un segundo) → 401', () => {
    const res = verify({ timestamp: NOW - POS_WEBHOOK_TOLERANCE_SECONDS - 1 })
    expect(res).toEqual({ ok: false, status: 401, error: 'Timestamp fuera de ventana' })
  })

  it('timestamp futuro (fuera de ventana) → 401', () => {
    const res = verify({ timestamp: NOW + POS_WEBHOOK_TOLERANCE_SECONDS + 1 })
    expect(res).toEqual({ ok: false, status: 401, error: 'Timestamp fuera de ventana' })
  })

  it('replay de una captura vieja → 401', () => {
    const viejo = new Date((NOW - 4000) * 1000).toISOString()
    const cuerpoViejo = JSON.stringify({ event: 'ORDER-CONFIRMED', externalOrderId: 'REST-1', timestamp: viejo })
    const firmaVieja = computePosWebhookSignature(SECRET, cuerpoViejo)
    const res = verify({
      rawBody: cuerpoViejo,
      signature: firmaVieja,
      timestamp: viejo,
    })
    expect(res).toEqual({ ok: false, status: 401, error: 'Timestamp fuera de ventana' })
  })
})

describe('verifyPosWebhookSignature — flag sandbox', () => {
  it('sin firma + allowUnsigned → ok como unsigned (sin exigir timestamp)', () => {
    const res = verify({ signature: null, timestamp: undefined, allowUnsigned: true })
    expect(res).toEqual({ ok: true, unsigned: true })
  })

  it('computePosWebhookSignature es HMAC-SHA256 hex de 64 chars', () => {
    const sig = computePosWebhookSignature(SECRET, RAW_BODY)
    expect(sig).toMatch(/^[0-9a-f]{64}$/)
  })
})
