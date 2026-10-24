import mongoose from 'mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { decrypt } from '@/lib/crypto'
import { getMpAccountForLocation, isOAuthValid } from '@/lib/mercadopago'

// ============================================================================
// MercadoPago Point — cobro con el posnet desde el POS (Fase 6, 2026-10)
// ============================================================================
// Docs: ADMIN/FASE6_ONLINE_POINT_CAEA_LIBRO_DIGITAL.md
//
// API de integración de Point (endpoints propios, NO toca el checkout online
// de MercadoPago ni su webhook):
//   · GET    /point/integration-api/devices                     dispositivos
//   · PATCH  /point/integration-api/devices/{id}                modo PDV
//   · POST   /point/integration-api/devices/{id}/payment-intents  cobrar
//   · GET    /point/integration-api/payment-intents/{id}         estado
//   · DELETE /point/integration-api/devices/{id}/payment-intents/{id} cancelar
//   · GET    /v1/payments/{id}                                   verificación
// Monto: entero en centavos. La plata va directo a la cuenta del comercio
// (su token); la comisión de plataforma en ventas POS es 0 (paymentPolicy).
// El cobro se da por bueno SOLO si /v1/payments confirma `approved` por el
// MISMO monto: el estado del intento no alcanza.
// ============================================================================

const MP_API = 'https://api.mercadopago.com'
const TIMEOUT_MS = 15_000

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

export class MpPointError extends Error {
  constructor(
    message: string,
    readonly status = 409
  ) {
    super(message)
    this.name = 'MpPointError'
  }
}

export interface PointDevice {
  id: string
  operatingMode: string
  posId: string | null
  storeId: string | null
}

export type PointIntentState = 'waiting' | 'approved' | 'rejected' | 'canceled' | 'error'

/** Token del comercio para la sede (cuenta propia; OAuth como respaldo). */
export async function pointTokenFor(tenantId: string, locationId: string): Promise<string> {
  const [tenant, location] = await Promise.all([
    Tenant.findById(tenantId).select('mpAccounts mercadopago mpOAuth mpMode featureFlags flags').lean(),
    Location.findOne({ _id: locationId, tenantId }).select('settings.mpAccountId').lean<{ settings?: { mpAccountId?: string | null } }>(),
  ])
  if (!tenant) throw new MpPointError('Comercio no encontrado', 404)
  const account = getMpAccountForLocation(tenant, location?.settings?.mpAccountId ?? null)
  if (!account) throw new MpPointError('El comercio no tiene MercadoPago conectado')
  const encrypted = account.accessToken || (isOAuthValid(account) ? account.oauthAccessToken : null)
  if (!encrypted) throw new MpPointError('El comercio no tiene MercadoPago conectado')
  try {
    return decrypt(encrypted)
  } catch {
    throw new MpPointError('No se pudo leer la credencial de MercadoPago')
  }
}

async function mp<T>(token: string, path: string, init: RequestInit = {}, fetchImpl: FetchLike = fetch): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let res: Response
  try {
    res = await fetchImpl(`${MP_API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      signal: controller.signal,
    })
  } catch {
    throw new MpPointError('MercadoPago no respondió', 502)
  } finally {
    clearTimeout(timer)
  }
  const body = (await res.json().catch(() => ({}))) as T & { message?: string }
  if (!res.ok) {
    throw new MpPointError(`MercadoPago: ${(body as { message?: string }).message ?? res.status}`, res.status === 404 ? 404 : 502)
  }
  return body
}

export async function listPointDevices(token: string, fetchImpl?: FetchLike): Promise<PointDevice[]> {
  const body = await mp<{ devices?: { id: string; operating_mode?: string; pos_id?: number | string; store_id?: string }[] }>(
    token,
    '/point/integration-api/devices',
    {},
    fetchImpl
  )
  return (body.devices ?? []).map((d) => ({
    id: d.id,
    operatingMode: d.operating_mode ?? 'UNKNOWN',
    posId: d.pos_id !== undefined ? String(d.pos_id) : null,
    storeId: d.store_id ?? null,
  }))
}

/** Pone el posnet en modo PDV (integrado): cobra lo que manda el POS. */
export async function setPointPdvMode(token: string, deviceId: string, fetchImpl?: FetchLike): Promise<void> {
  await mp(token, `/point/integration-api/devices/${encodeURIComponent(deviceId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ operating_mode: 'PDV' }),
  }, fetchImpl)
}

export async function createPointIntent(
  token: string,
  deviceId: string,
  input: { amountCents: number; externalReference: string; description: string },
  fetchImpl?: FetchLike
): Promise<string> {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 1) throw new MpPointError('Monto inválido', 400)
  const body = await mp<{ id: string }>(
    token,
    `/point/integration-api/devices/${encodeURIComponent(deviceId)}/payment-intents`,
    {
      method: 'POST',
      body: JSON.stringify({
        amount: input.amountCents,
        description: input.description.slice(0, 60),
        additional_info: { external_reference: input.externalReference, print_on_terminal: true },
      }),
    },
    fetchImpl
  )
  if (!body.id) throw new MpPointError('MercadoPago no devolvió el cobro', 502)
  return body.id
}

/**
 * Estado del cobro. `approved` solo si el pago existe, está aprobado y es por
 * el monto esperado (verificado en /v1/payments, no en el intento).
 */
export async function pointIntentStatus(
  token: string,
  intentId: string,
  expectedCents: number,
  fetchImpl?: FetchLike
): Promise<{ state: PointIntentState; paymentId: string | null; detail: string }> {
  const intent = await mp<{ state?: string; payment?: { id?: number | string } }>(
    token,
    `/point/integration-api/payment-intents/${encodeURIComponent(intentId)}`,
    {},
    fetchImpl
  )
  const raw = (intent.state ?? '').toUpperCase()
  if (raw === 'CANCELED' || raw === 'ABANDONED') return { state: 'canceled', paymentId: null, detail: 'Cobro cancelado' }
  if (raw === 'ERROR') return { state: 'error', paymentId: null, detail: 'El posnet informó un error' }
  const paymentId = intent.payment?.id !== undefined ? String(intent.payment.id) : null
  if (raw !== 'FINISHED' || !paymentId) return { state: 'waiting', paymentId: null, detail: 'Esperando la tarjeta' }

  const payment = await mp<{ status?: string; status_detail?: string; transaction_amount?: number }>(
    token,
    `/v1/payments/${encodeURIComponent(paymentId)}`,
    {},
    fetchImpl
  )
  const amountCents = Math.round((payment.transaction_amount ?? 0) * 100)
  if (payment.status === 'approved' && amountCents === expectedCents) {
    return { state: 'approved', paymentId, detail: 'Pago aprobado' }
  }
  if (payment.status === 'approved') return { state: 'error', paymentId, detail: 'El monto cobrado no coincide' }
  return { state: 'rejected', paymentId, detail: `Pago ${payment.status_detail ?? payment.status ?? 'rechazado'}` }
}

export async function cancelPointIntent(token: string, deviceId: string, intentId: string, fetchImpl?: FetchLike): Promise<void> {
  await mp(
    token,
    `/point/integration-api/devices/${encodeURIComponent(deviceId)}/payment-intents/${encodeURIComponent(intentId)}`,
    { method: 'DELETE' },
    fetchImpl
  ).catch(() => undefined)
}

/** Dispositivo Point configurado en la sede, o null. */
export async function pointDeviceFor(tenantId: string, locationId: string): Promise<string | null> {
  const loc = await Location.findOne({ _id: new mongoose.Types.ObjectId(locationId), tenantId })
    .select('settings.mpPointDeviceId')
    .lean<{ settings?: { mpPointDeviceId?: string | null } }>()
  return loc?.settings?.mpPointDeviceId ?? null
}
