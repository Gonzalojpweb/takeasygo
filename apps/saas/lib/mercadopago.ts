import { MercadoPagoConfig } from 'mercadopago'
import { decrypt } from '@/lib/crypto'
import { connectDB } from '@/lib/mongoose'
import { isFlagEnabled, FLAGS } from '@/lib/feature-flags'
import Tenant from '@/models/Tenant'

/**
 * Resolved MP account for a tenant — either from mpAccounts[] (new) or
 * legacy mercadopago/mpOAuth fields (fallback for unmigrated tenants).
 */
export interface ResolvedMpAccount {
  accountId: string           // _id of the mpAccounts entry (for saving to Order)
  accessToken: string       // encrypted — caller must decrypt()
  publicKey: string         // encrypted
  webhookSecret: string     // encrypted
  oauthAccessToken: string | null  // encrypted
  oauthIsConnected: boolean
  oauthExpiresAt: Date | null
  commissionPercent: number | null
  label: string
}

/**
 * Returns the active MP account for a tenant.
 *
 * Priority:
 *  1. mpAccounts[] — first entry where isActive === true
 *  2. Legacy fallback — mercadopago + mpOAuth fields (unmigrated tenants)
 *  3. null — no MP configured at all
 *
 * The legacy fallback exists so existing tenants work transparently
 * before running the one-off migration script.
 */
export function getActiveMpAccount(tenant: any): ResolvedMpAccount | null {
  // ── 1. New multi-account path ──
  if (tenant.mpAccounts?.length) {
    const active = tenant.mpAccounts.find((a: any) => a.isActive)
    if (active) {
      return {
        accountId: active._id?.toString() ?? '',
        accessToken: active.accessToken,
        publicKey: active.publicKey,
        webhookSecret: active.webhookSecret,
        oauthAccessToken: active.oauthAccessToken ?? null,
        oauthIsConnected: !!active.oauthIsConnected,
        oauthExpiresAt: active.oauthExpiresAt ?? null,
        commissionPercent: null, // global for now
        label: active.label,
      }
    }
    // mpAccounts exists but none is active — edge case, treat as unconfigured
    return null
  }

  // ── 2. Legacy fallback (unmigrated tenants) ──
  if (tenant.mercadopago?.isConfigured && tenant.mercadopago?.accessToken) {
    return {
      accountId: 'legacy',
      accessToken: tenant.mercadopago.accessToken,
      publicKey: tenant.mercadopago.publicKey,
      webhookSecret: tenant.mercadopago.webhookSecret,
      oauthAccessToken: tenant.mpOAuth?.accessToken ?? null,
      oauthIsConnected: !!tenant.mpOAuth?.isConnected,
      oauthExpiresAt: tenant.mpOAuth?.expiresAt ?? null,
      commissionPercent: tenant.mpOAuth?.commissionPercent ?? null,
      label: 'Cuenta Principal',
    }
  }

  return null
}

/**
 * Helper: is the OAuth for this account valid (connected + not expired)?
 */
export function isOAuthValid(account: ResolvedMpAccount): boolean {
  if (!account.oauthIsConnected || !account.oauthAccessToken) return false
  if (!account.oauthExpiresAt) return true // legacy: null = treat as valid
  return new Date(account.oauthExpiresAt) > new Date()
}

/**
 * ¿El tenant está 100% operativo para cobrar online? (mapa TGO)
 * = cuenta MP activa con token + split OAuth vigente.
 * Misma lógica que el checkout usa para enviar marketplace_fee:
 * si esto da false, el pin no debe mostrar «listo para pedidos».
 */
export function isFullyOperational(tenant: unknown): boolean {
  const account = getActiveMpAccount(tenant)
  return !!account && isOAuthValid(account)
}

/**
 * Resolves the MP account for a specific location.
 *
 * Comportamiento según flag `mp.perLocation` y `tenant.mpMode`:
 *  - Flag OFF (default): SIEMPRE cuenta activa del tenant (shared).
 *    El override de la sede se ignora — comportamiento idéntico al actual.
 *  - Flag ON + mpMode 'shared': cuenta activa del tenant (sin cambios).
 *  - Flag ON + mpMode 'perLocation':
 *      1. locationMpAccountId → esa cuenta exacta en tenant.mpAccounts[]
 *      2. Sin override → fallback a getActiveMpAccount(tenant)
 *      3. Cuenta no existe → null (fail closed)
 */
export function getMpAccountForLocation(
  tenant: any,
  locationMpAccountId?: string | null
): ResolvedMpAccount | null {
  const perLocationEnabled =
    isFlagEnabled(tenant, FLAGS.MP_PER_LOCATION) && tenant.mpMode === 'perLocation'

  // Flag OFF o modo shared: usar cuenta activa (ignorar override)
  if (!perLocationEnabled) {
    return getActiveMpAccount(tenant)
  }

  // Flag ON + perLocation: respetar override de la sede
  if (locationMpAccountId) {
    const match = tenant.mpAccounts?.find(
      (a: any) => a._id?.toString() === locationMpAccountId
    )
    if (!match) {
      // Fail closed: location points to non-existent account
      return null
    }
    return {
      accountId: match._id?.toString() ?? '',
      accessToken: match.accessToken,
      publicKey: match.publicKey,
      webhookSecret: match.webhookSecret,
      oauthAccessToken: match.oauthAccessToken ?? null,
      oauthIsConnected: !!match.oauthIsConnected,
      oauthExpiresAt: match.oauthExpiresAt ?? null,
      commissionPercent: null,
      label: match.label,
    }
  }

  // Sin override: fallback a cuenta activa del tenant
  return getActiveMpAccount(tenant)
}

/**
 * Finds a specific MP account by its _id within a tenant.
 * Used by webhook handler to resolve account from Order.payment.mpAccountId.
 * Returns null if not found (fail closed).
 */
export function findMpAccountById(
  tenant: any,
  accountId: string
): ResolvedMpAccount | null {
  const match = tenant.mpAccounts?.find(
    (a: any) => a._id?.toString() === accountId
  )
  if (!match) return null
  return {
    accountId: match._id?.toString() ?? '',
    accessToken: match.accessToken,
    publicKey: match.publicKey,
    webhookSecret: match.webhookSecret,
    oauthAccessToken: match.oauthAccessToken ?? null,
    oauthIsConnected: !!match.oauthIsConnected,
    oauthExpiresAt: match.oauthExpiresAt ?? null,
    commissionPercent: null,
    label: match.label,
  }
}

/**
 * Decisión de cuenta a usar al procesar un webhook de pago MP.
 *
 * Propiedad de seguridad (multisede): la FUENTE DE VERDAD es el
 * `payment.mpAccountId` guardado en la Order al crear la preferencia — NUNCA
 * se re-resuelve la cuenta por el modo/config actual del tenant. Esto evita
 * que un `external_reference` manipulado, un `?account=` falsificado o un
 * cambio de configuración posterior redirijan el pago a la cuenta equivocada.
 *
 * Orden de resolución:
 *   1. Order.payment.mpAccountId existe y la cuenta existe → esa cuenta.
 *   2. Order.payment.mpAccountId existe pero la cuenta fue borrada → 'orphan'
 *      (error de configuración permanente: 200 + alerta, reintentar no arregla).
 *   3. Order sin mpAccountId → cuenta cuya firma validó (fallback legado).
 */
export type WebhookAccountDecision =
  | {
      status: 'process'
      account: ResolvedMpAccount
      accountSource: 'order' | 'signature'
      hintMismatch: boolean
      orderNumber: string | null
    }
  | {
      status: 'orphan'
      accountId: string
      hintMismatch: boolean
      orderNumber: string | null
    }

export function resolveWebhookProcessAccount(params: {
  tenant: any
  orderMpAccountId: string | null
  orderNumber: string | null
  signatureMatchedAccount: ResolvedMpAccount
  urlAccount: string | null
}): WebhookAccountDecision {
  const { tenant, orderMpAccountId, orderNumber, signatureMatchedAccount, urlAccount } = params
  const hintMismatch = !!urlAccount && !!orderMpAccountId && urlAccount !== orderMpAccountId

  if (orderMpAccountId) {
    const orderAccount = findMpAccountById(tenant, orderMpAccountId)
    if (!orderAccount) {
      return { status: 'orphan', accountId: orderMpAccountId, hintMismatch, orderNumber }
    }
    return { status: 'process', account: orderAccount, accountSource: 'order', hintMismatch, orderNumber }
  }

  return { status: 'process', account: signatureMatchedAccount, accountSource: 'signature', hintMismatch, orderNumber }
}

/**
 * Returns a MercadoPagoConfig client using the active account's credentials.
 * Falls back to legacy mercadopago.accessToken for unmigrated tenants.
 */
export async function getMercadoPagoClient(tenantSlug: string) {
  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug })
  if (!tenant) throw new Error('Tenant no encontrado')

  const account = getActiveMpAccount(tenant)
  if (!account) throw new Error('MercadoPago no configurado para este tenant')

  const accessToken = decrypt(account.accessToken)
  const client = new MercadoPagoConfig({ accessToken })
  return { client, tenant }
}
