// ============================================================================
// Candado del split de MercadoPago — la comisión de TakeasyGO no se puede saltear
// ============================================================================
// Cómo funciona el split (MercadoPago Marketplace):
//   · El dueño del restaurante autoriza a la app de TakeasyGO en SU cuenta de
//     MercadoPago (OAuth). Eso genera un token APARTE (oauthAccessToken) que
//     se guarda junto a las credenciales que cargó el restaurante, sin
//     pisarlas, y que tiene que ser de la MISMA cuenta (callback valida user_id).
//   · Con ese token se crean los cobros con marketplace_fee: la plata cae en
//     la cuenta del restaurante y la comisión en la de TakeasyGO.
//
// El agujero que cierra este módulo: sin split válido, el sistema cobraba con
// las credenciales del restaurante SIN comisión. Al admin le alcanzaba con
// borrar la cuenta conectada, activar otra o reconectar con otra cuenta.
//
// Reglas (decisión 2026-10-23):
//   1. Candado: una vez conectado el split, queda «administrado por TakeasyGO».
//      locked null (comercios previos) = bloqueado si alguna vez se conectó.
//      Solo el superadmin lo puede abrir.
//   2. Con candado, MercadoPago SOLO cobra con split válido. Si la cuenta que
//      cobra no lo tiene (otra cuenta, vencido o permiso quitado), MercadoPago
//      se PAUSA en ese comercio (checkout, pedido, reserva) hasta reconectar.
//      Nunca se cobra sin comisión.
//   3. Con candado, el admin no puede reemplazar una conexión vigente ni
//      borrar la cuenta conectada. Sí puede reconectar una cuenta caída
//      (eso vuelve a activar la comisión).
//   4. El dueño siempre puede quitar el permiso desde su cuenta de
//      MercadoPago (no se puede impedir): se detecta (cron diario + error de
//      MP al cobrar), se marca la cuenta y se pausa MercadoPago (regla 2).
// ============================================================================

import crypto from 'crypto'
import type { Types } from 'mongoose'
import Tenant from '@/models/Tenant'
import SystemAnnouncement from '@/models/SystemAnnouncement'
import { decrypt } from '@/lib/crypto'
import { sendEmail } from '@/lib/email'
import { isOAuthValid, type ResolvedMpAccount } from '@/lib/mercadopago'

/** Lo que ve el cliente cuando MercadoPago está pausado (no expone el motivo). */
export const MP_PAUSED_CUSTOMER_MESSAGE = 'Este comercio no está recibiendo pagos con MercadoPago en este momento. Elegí otro medio de pago.'

interface MpAccountDoc {
  _id?: Types.ObjectId | string
  label?: string
  isActive?: boolean
  oauthAccessToken?: string | null
  oauthIsConnected?: boolean
  oauthAuthorizedAt?: Date | null
  oauthExpiresAt?: Date | null
  oauthRevokedAt?: Date | null
  oauthMpUserId?: number | null
}

export interface TenantMpLike {
  _id?: Types.ObjectId | string
  slug?: string
  name?: string
  mpSplitGuard?: { locked?: boolean | null; lockedAt?: Date | null; lockedBy?: string | null } | null
  mpOAuth?: { accessToken?: string | null; isConnected?: boolean; authorizedAt?: Date | null; expiresAt?: Date | null; revokedAt?: Date | null; mpUserId?: number | null } | null
  mpAccounts?: MpAccountDoc[] | null
}

/** ¿Alguna vez se conectó el split en este comercio? */
export function everConnected(tenant: TenantMpLike): boolean {
  return !!tenant.mpOAuth?.authorizedAt || (tenant.mpAccounts ?? []).some((a) => !!a.oauthAuthorizedAt)
}

/** ¿El split es obligatorio (candado puesto)? */
export function isSplitRequired(tenant: TenantMpLike): boolean {
  const locked = tenant.mpSplitGuard?.locked
  if (locked === true) return true
  if (locked === false) return false
  return everConnected(tenant)
}

/** ¿Se puede cobrar con MercadoPago con esta cuenta? (con candado: solo con split válido) */
export function canChargeWithMercadoPago(tenant: TenantMpLike, account: ResolvedMpAccount | null): boolean {
  if (!account) return false
  return !isSplitRequired(tenant) || isOAuthValid(account)
}

export type SplitAccountState = 'connected' | 'expired' | 'revoked' | 'not_connected'

function accountState(a: { oauthIsConnected?: boolean; oauthAccessToken?: string | null; oauthExpiresAt?: Date | null; oauthRevokedAt?: Date | null }): SplitAccountState {
  if (a.oauthIsConnected && a.oauthAccessToken) {
    if (a.oauthExpiresAt && new Date(a.oauthExpiresAt) <= new Date()) return 'expired'
    return 'connected'
  }
  return a.oauthRevokedAt ? 'revoked' : 'not_connected'
}

export interface SplitAccountView {
  accountId: string
  label: string
  isActive: boolean
  state: SplitAccountState
  authorizedAt: string | null
  expiresAt: string | null
  revokedAt: string | null
  mpUserId: number | null
}

/** Estado del split para los paneles (admin y superadmin). Sin secretos. */
export function splitOverview(tenant: TenantMpLike & { mercadopago?: { isConfigured?: boolean } | null }) {
  const accounts: SplitAccountView[] = (tenant.mpAccounts ?? []).map((a) => ({
    accountId: String(a._id ?? ''),
    label: a.label ?? 'Cuenta',
    isActive: !!a.isActive,
    state: accountState(a),
    authorizedAt: a.oauthAuthorizedAt ? new Date(a.oauthAuthorizedAt).toISOString() : null,
    expiresAt: a.oauthExpiresAt ? new Date(a.oauthExpiresAt).toISOString() : null,
    revokedAt: a.oauthRevokedAt ? new Date(a.oauthRevokedAt).toISOString() : null,
    mpUserId: a.oauthMpUserId ?? null,
  }))
  if (accounts.length === 0 && (tenant.mercadopago?.isConfigured || tenant.mpOAuth?.authorizedAt)) {
    const o = tenant.mpOAuth ?? {}
    accounts.push({
      accountId: 'legacy',
      label: 'Cuenta Principal',
      isActive: true,
      state: accountState({ oauthIsConnected: o.isConnected, oauthAccessToken: o.accessToken, oauthExpiresAt: o.expiresAt, oauthRevokedAt: o.revokedAt }),
      authorizedAt: o.authorizedAt ? new Date(o.authorizedAt).toISOString() : null,
      expiresAt: o.expiresAt ? new Date(o.expiresAt).toISOString() : null,
      revokedAt: o.revokedAt ? new Date(o.revokedAt).toISOString() : null,
      mpUserId: o.mpUserId ?? null,
    })
  }
  const required = isSplitRequired(tenant)
  const active = accounts.find((a) => a.isActive) ?? null
  return {
    required,
    lockedExplicitly: tenant.mpSplitGuard?.locked ?? null,
    lockedAt: tenant.mpSplitGuard?.lockedAt ? new Date(tenant.mpSplitGuard.lockedAt).toISOString() : null,
    accounts,
    /** Con candado y la cuenta que cobra sin split vigente: MercadoPago pausado. */
    mpPaused: required && !!active && active.state !== 'connected',
  }
}

/** ¿Esta cuenta tiene hoy una conexión vigente? (para impedir que el admin la reemplace) */
export function isAccountConnectedNow(tenant: TenantMpLike, accountId: string | null | undefined): boolean {
  if (!accountId || accountId === 'legacy' || !(tenant.mpAccounts ?? []).length) {
    const legacyOrActive = (tenant.mpAccounts ?? []).length ? (tenant.mpAccounts ?? []).find((a) => a.isActive) : null
    if (legacyOrActive) return accountState(legacyOrActive) === 'connected'
    const o = tenant.mpOAuth ?? {}
    return accountState({ oauthIsConnected: o.isConnected, oauthAccessToken: o.accessToken, oauthExpiresAt: o.expiresAt, oauthRevokedAt: o.revokedAt }) === 'connected'
  }
  const a = (tenant.mpAccounts ?? []).find((x) => String(x._id) === accountId)
  return !!a && accountState(a) === 'connected'
}

// ── Candado ────────────────────────────────────────────────────────────────

export async function setSplitLock(tenantId: Types.ObjectId | string, locked: boolean, by: string) {
  const now = new Date()
  await Tenant.updateOne(
    { _id: tenantId },
    locked
      ? { $set: { 'mpSplitGuard.locked': true, 'mpSplitGuard.lockedAt': now, 'mpSplitGuard.lockedBy': by } }
      : { $set: { 'mpSplitGuard.locked': false, 'mpSplitGuard.unlockedAt': now, 'mpSplitGuard.unlockedBy': by } },
  )
}

// ── Permiso quitado desde MercadoPago ──────────────────────────────────────

/** Consulta a MercadoPago con el token del split. 401/403 = el permiso ya no existe. */
export async function probeOAuthToken(token: string): Promise<'ok' | 'revoked' | 'unknown'> {
  try {
    const res = await fetch('https://api.mercadopago.com/users/me', { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) return 'ok'
    if (res.status === 401 || res.status === 403) return 'revoked'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * Marca la conexión como caída (idempotente: solo la primera vez avisa).
 * Con candado, eso pausa MercadoPago en el comercio hasta reconectar.
 */
export async function markSplitRevoked(tenantId: Types.ObjectId | string, accountId: string | null, source: 'cron' | 'cobro'): Promise<boolean> {
  const now = new Date()
  const res =
    accountId && accountId !== 'legacy'
      ? await Tenant.updateOne(
          { _id: tenantId, mpAccounts: { $elemMatch: { _id: accountId, oauthIsConnected: true } } },
          { $set: { 'mpAccounts.$.oauthIsConnected': false, 'mpAccounts.$.oauthRevokedAt': now } },
        )
      : await Tenant.updateOne({ _id: tenantId, 'mpOAuth.isConnected': true }, { $set: { 'mpOAuth.isConnected': false, 'mpOAuth.revokedAt': now } })
  if (res.modifiedCount === 0) return false

  const tenant = await Tenant.findById(tenantId).select('slug name mpSplitGuard mpOAuth mpAccounts').lean<TenantMpLike | null>()
  const paused = !!tenant && isSplitRequired(tenant)
  console.warn(`[mp-split-guard] split caído tenant=${tenant?.slug} cuenta=${accountId ?? 'legacy'} origen=${source} pausado=${paused}`)
  await SystemAnnouncement.create({
    title: paused ? 'MercadoPago pausado: hay que reconectar la cuenta' : 'Se desconectó tu cuenta de MercadoPago',
    content: paused
      ? 'MercadoPago avisó que se quitó el permiso de TakeasyGO en tu cuenta. Hasta reconectarla, tus clientes no pueden pagar con MercadoPago (sí con efectivo o transferencia). Reconectala desde Configuración → Pagos o pedile el link a TakeasyGO.'
      : 'MercadoPago avisó que se quitó el permiso de TakeasyGO en tu cuenta. Reconectala desde Configuración → Pagos.',
    type: 'alert',
    status: 'published',
    publishedAt: now,
    targetPlans: [],
    targetTenantIds: [tenantId],
    readBy: [],
    acceptances: [],
    requiresConsent: false,
    expiresAt: new Date(now.getTime() + 14 * 86_400_000),
  }).catch((err) => console.error('[mp-split-guard] no se pudo crear el aviso', err))

  const to = process.env.MP_ALERT_EMAIL ?? process.env.SMTP_FROM ?? process.env.SMTP_USER ?? ''
  if (to && tenant) {
    await sendEmail(
      to,
      `Split de MercadoPago caído — ${tenant.name ?? tenant.slug}`,
      `<div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
        <h2 style="color:#c0392b;">Se quitó el permiso del split de MercadoPago</h2>
        <p><strong>Negocio:</strong> ${tenant.name ?? ''} (${tenant.slug ?? ''})</p>
        <p><strong>Cuenta:</strong> ${accountId ?? 'principal'} · detectado por: ${source === 'cron' ? 'control diario' : 'un cobro rechazado'}</p>
        <p>${paused ? 'MercadoPago quedó <strong>pausado</strong> en el comercio hasta reconectar.' : 'El comercio no tiene candado: sigue cobrando sin comisión.'}</p>
        <p style="color:#666; font-size:13px;">Generá un link de autorización desde Superadmin → Comercios → Split de MercadoPago.</p>
      </div>`,
    ).catch((err) => console.error('[mp-split-guard] no se pudo enviar el mail', err))
  }
  return true
}

/** Control diario: prueba cada conexión vigente contra MercadoPago. */
export async function checkSplitHealth(tenant: TenantMpLike & { _id: Types.ObjectId }) {
  const results: Array<{ accountId: string; result: 'ok' | 'revoked' | 'unknown' }> = []
  const targets: Array<{ accountId: string; token: string | null | undefined }> = (tenant.mpAccounts ?? []).length
    ? (tenant.mpAccounts ?? []).filter((a) => a.oauthIsConnected && a.oauthAccessToken).map((a) => ({ accountId: String(a._id), token: a.oauthAccessToken }))
    : tenant.mpOAuth?.isConnected && tenant.mpOAuth.accessToken
      ? [{ accountId: 'legacy', token: tenant.mpOAuth.accessToken }]
      : []
  for (const t of targets) {
    let plain: string
    try {
      plain = decrypt(t.token!)
    } catch {
      results.push({ accountId: t.accountId, result: 'unknown' })
      continue
    }
    const result = await probeOAuthToken(plain)
    if (result === 'revoked') await markSplitRevoked(tenant._id, t.accountId, 'cron')
    results.push({ accountId: t.accountId, result })
  }
  return results
}

// ── Link de autorización para el restaurante ───────────────────────────────

export const SPLIT_LINK_TTL_MS = 48 * 60 * 60 * 1000

export function newSplitLinkToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(24).toString('base64url')
  return { token, hash: hashSplitLinkToken(token) }
}

export function hashSplitLinkToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}
