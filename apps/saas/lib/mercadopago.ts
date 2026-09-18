import { MercadoPagoConfig } from 'mercadopago'
import { decrypt } from '@/lib/crypto'
import { connectDB } from '@/lib/mongoose'
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
 * Resolves the MP account for a specific location.
 *
 * Priority:
 *  1. locationMpAccountId → look up that exact account in tenant.mpAccounts[]
 *  2. null/undefined → fallback to getActiveMpAccount(tenant)
 *  3. Account not found → null (fail closed, caller must handle)
 */
export function getMpAccountForLocation(
  tenant: any,
  locationMpAccountId?: string | null
): ResolvedMpAccount | null {
  // Explicit account override on the location
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

  // No override: use tenant-level active account
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
