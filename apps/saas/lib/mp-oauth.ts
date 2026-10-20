// ============================================================================
// mp-oauth.ts — Salud y renovación de tokens OAuth de Mercado Pago
// ============================================================================
// Contexto (doc oficial MP, oauth/token + renewal):
//   - El access_token de un flujo authorization_code dura 180 días
//     (expires_in = 15552000 s por defecto).
//   - El refresh flow (grant_type=refresh_token) devuelve access_token
//     NUEVO y refresh_token NUEVO: hay que guardar ambos; el refresh_token
//     viejo queda invalidado.
//   - Requiere que la app haya sido autorizada con offline_access.
//   - Si el refresh_token venció/perdió, hay que repetir la autorización
//     completa (botón Reconectar).
//
// Reglas del executor (patrón Google Contacts portado):
//   1. Un solo ejecutor por proceso + candado cross-instancia (PlatformConfig).
//   2. Cifrar los tokens NUEVOS antes de tocar la DB.
//   3. Guardar el nuevo antes de descartar el viejo: un solo update atómico
//      con los valores ya validados/cifrados (si algo falla antes, no se toca
//      nada y el viejo sigue vigente).
//   4. Nunca guardar vacío: access_token ausente/vacío ⇒ abort.
//   5. Nunca pisar si falla: HTTP no-OK / red / encrypt ⇒ sin escritura.
//   6. Mail de aviso al superadmin si la renovación falla.
// ============================================================================

import { decrypt, encrypt } from '@/lib/crypto'
import { sendEmail } from '@/lib/email'
import Tenant from '@/models/Tenant'
import PlatformConfig from '@/models/PlatformConfig'

/** Duración documentada del access_token OAuth de MP (segundos → días). */
export const MP_OAUTH_TOKEN_TTL_DAYS = 180
const DEFAULT_EXPIRES_IN_SEC = MP_OAUTH_TOKEN_TTL_DAYS * 24 * 60 * 60

/** Ventana con la que el cron considera "vence pronto" y renueva. */
export const RENEW_WINDOW_DAYS = 30

export type OauthTokenStatus = 'valid' | 'soon' | 'expired' | 'unknown'

export interface OauthHealth {
  status: OauthTokenStatus
  expiresAt: Date | null
  /** Días restantes redondeados hacia abajo; null si no hay fecha. */
  daysRemaining: number | null
}

/**
 * Clasifica el vencimiento del access_token OAuth.
 * - expired: fecha pasó.
 * - soon:    vence dentro de `windowDays` (default 30).
 * - valid:   vence a más de `windowDays`.
 * - unknown: sin fecha (legacy: se trata como válido, igual que isOAuthValid).
 */
export function classifyOauthExpiry(
  expiresAt: Date | string | null | undefined,
  now: Date = new Date(),
  windowDays: number = RENEW_WINDOW_DAYS
): OauthTokenStatus {
  if (!expiresAt) return 'unknown'
  const exp = new Date(expiresAt)
  if (Number.isNaN(exp.getTime())) return 'unknown'
  const msLeft = exp.getTime() - now.getTime()
  if (msLeft <= 0) return 'expired'
  if (msLeft <= windowDays * 24 * 60 * 60 * 1000) return 'soon'
  return 'valid'
}

/** Salud de un token OAuth a partir de un string cifrado (o null). */
export function getOauthHealth(
  oauthAccessTokenEnc: string | null | undefined,
  oauthExpiresAt: Date | string | null | undefined,
  now: Date = new Date()
): OauthHealth {
  if (!oauthAccessTokenEnc) {
    return { status: 'unknown', expiresAt: null, daysRemaining: null }
  }
  const exp = oauthExpiresAt ? new Date(oauthExpiresAt) : null
  const validExp = exp && !Number.isNaN(exp.getTime()) ? exp : null
  return {
    status: classifyOauthExpiry(validExp, now),
    expiresAt: validExp,
    daysRemaining: validExp
      ? Math.max(0, Math.floor((validExp.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
      : null,
  }
}

// ── Credenciales de la app OAuth de la plataforma ────────────────────────────

export interface MpPlatformOAuthCreds {
  appId: string
  appSecret: string // ya descifrada
}

/** Extrae un mensaje legible de un error desconocido. */
function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Carga appId + appSecret (descifrado) desde PlatformConfig. null si falta. */
export async function loadPlatformOAuthCreds(): Promise<MpPlatformOAuthCreds | null> {
  const cfg = await PlatformConfig.findById('platform').lean()
  const appId = cfg?.mpOAuth?.appId
  const encSecret = cfg?.mpOAuth?.appSecret
  if (!appId || !encSecret) return null
  let appSecret: string
  try {
    appSecret = decrypt(encSecret)
  } catch {
    return null
  }
  if (!appSecret) return null
  return { appId, appSecret }
}

// ── Respuesta del endpoint de token de MP ────────────────────────────────────

export interface MpTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  scope?: string
  user_id?: number
}

/**
 * Intercambia un refresh_token por access_token + refresh_token nuevos.
 * Solo hace la llamada y valida la respuesta: NO escribe en DB.
 * Lanza con mensaje claro si MP falla o devuelve un token vacío.
 */
export async function requestTokenRefresh(
  creds: MpPlatformOAuthCreds,
  refreshToken: string,
  fetchFn: typeof fetch = fetch
): Promise<MpTokenResponse> {
  if (!refreshToken) throw new Error('mp_oauth: refresh_token vacío')
  const res = await fetchFn('https://api.mercadopago.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: creds.appId,
      client_secret: creds.appSecret,
      refresh_token: refreshToken,
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`mp_oauth: refresh HTTP ${res.status} ${detail.slice(0, 200)}`)
  }
  const data = (await res.json()) as MpTokenResponse
  // Nunca avanzar con un access_token vacío (regla: no guardar vacío).
  if (!data?.access_token) {
    throw new Error('mp_oauth: respuesta sin access_token')
  }
  return data
}

// ── Ejecución segura de la renovación ────────────────────────────────────────

export type RefreshScope = 'account' | 'legacy'

export interface RefreshResult {
  ok: boolean
  scope: RefreshScope
  accountId: string | null
  reason?: string
  newExpiresAt?: Date
}

type TenantDoc = {
  _id: unknown
  mpAccounts?: Array<{
    _id?: { toString(): string }
    oauthRefreshToken?: string | null
  }>
  mpOAuth?: { refreshToken?: string | null }
}

/**
 * Renueva el OAuth de UNA cuenta (mpAccounts[i]) o del legacy mpOAuth.
 * Cumple las reglas 2-5 del encabezado. `fetchFn` es inyectable para tests.
 */
export async function refreshOAuthForTenant(
  tenant: TenantDoc,
  scope: RefreshScope,
  accountId: string | null,
  creds: MpPlatformOAuthCreds,
  fetchFn: typeof fetch = fetch
): Promise<RefreshResult> {
  // ── Leer el refresh_token actual (cifrado) ──
  let currentRefreshEnc: string | null = null
  if (scope === 'account') {
    const acc = tenant.mpAccounts?.find(
      (a) => a._id?.toString() === accountId
    )
    if (!acc) {
      return { ok: false, scope, accountId, reason: 'cuenta_no_encontrada' }
    }
    currentRefreshEnc = acc.oauthRefreshToken ?? null
  } else {
    currentRefreshEnc = tenant.mpOAuth?.refreshToken ?? null
  }
  if (!currentRefreshEnc) {
    return { ok: false, scope, accountId, reason: 'sin_refresh_token' }
  }

  let refreshToken: string
  try {
    refreshToken = decrypt(currentRefreshEnc)
  } catch {
    return { ok: false, scope, accountId, reason: 'refresh_token_no_descifra' }
  }

  // ── Llamar a MP (sin escribir nada) ──
  let tokenData: MpTokenResponse
  try {
    tokenData = await requestTokenRefresh(creds, refreshToken, fetchFn)
  } catch (err) {
    return { ok: false, scope, accountId, reason: errMsg(err) }
  }

  // ── Cifrar ANTES de asignar: si encrypt falla, no se pisa nada ──
  let encAccess: string
  let encRefresh: string | null = null
  try {
    encAccess = encrypt(tokenData.access_token)
    // MP rota el refresh_token en cada refresh: guardamos el nuevo si viene;
    // si no viene, conservamos el actual (no descartamos sin reemplazo).
    encRefresh = tokenData.refresh_token ? encrypt(tokenData.refresh_token) : null
  } catch (err) {
    return {
      ok: false, scope, accountId,
      reason: `encrypt_failed: ${errMsg(err)}`,
    }
  }

  const expiresInSec =
    typeof tokenData.expires_in === 'number' && tokenData.expires_in > 0
      ? tokenData.expires_in
      : DEFAULT_EXPIRES_IN_SEC
  const newExpiresAt = new Date(Date.now() + expiresInSec * 1000)

  // ── Un solo update atómico con los valores nuevos ya validados ──
  // El token viejo se pisa recién acá, con el nuevo completo.
  try {
    if (scope === 'account') {
      const setFields: Record<string, unknown> = {
        'mpAccounts.$.oauthAccessToken': encAccess,
        'mpAccounts.$.oauthExpiresAt': newExpiresAt,
        'mpAccounts.$.oauthIsConnected': true,
        'mpAccounts.$.oauthLastRefreshedAt': new Date(),
      }
      if (encRefresh) setFields['mpAccounts.$.oauthRefreshToken'] = encRefresh
      await Tenant.updateOne(
        { _id: tenant._id, 'mpAccounts._id': accountId },
        { $set: setFields }
      )
    } else {
      const setFields: Record<string, unknown> = {
        'mpOAuth.accessToken': encAccess,
        'mpOAuth.expiresAt': newExpiresAt,
        'mpOAuth.isConnected': true,
        'mpOAuth.lastRefreshedAt': new Date(),
      }
      if (encRefresh) setFields['mpOAuth.refreshToken'] = encRefresh
      await Tenant.updateOne({ _id: tenant._id }, { $set: setFields })
    }
  } catch (err) {
    return {
      ok: false, scope, accountId,
      reason: `db_save_failed: ${errMsg(err)}`,
    }
  }

  return { ok: true, scope, accountId, newExpiresAt }
}

// ── Candidatos a renovación ──────────────────────────────────────────────────

export interface RenewCandidate {
  tenantId: string
  tenantSlug: string
  tenantName: string
  scope: RefreshScope
  accountId: string | null
  accountLabel: string
  health: OauthHealth
}

/**
 * Recorre los tenants activos con OAuth conectado y devuelve las cuentas
 * cuyo access_token está vencido o vence dentro de `windowDays` (o sin
 * fecha, que se trata como vencido para renovar de todos modos — si el
 * refresh sigue vivo, la renovación le pone fecha nueva).
 */
export async function findRenewCandidates(
  windowDays: number = RENEW_WINDOW_DAYS,
  now: Date = new Date()
): Promise<RenewCandidate[]> {
  const tenants = await Tenant.find({
    status: { $ne: 'suspended' },
    $or: [
      { 'mpAccounts.oauthIsConnected': true },
      { 'mpOAuth.isConnected': true },
    ],
  })
    .select('slug name mpAccounts mpOAuth flags')
    .lean()

  const candidates: RenewCandidate[] = []
  for (const t of tenants) {
    for (const acc of t.mpAccounts ?? []) {
      if (!acc.oauthIsConnected || !acc.oauthRefreshToken) continue
      const health = getOauthHealth(acc.oauthAccessToken, acc.oauthExpiresAt, now)
      const status = classifyOauthExpiry(health.expiresAt, now, windowDays)
      if (status === 'expired' || status === 'soon' || status === 'unknown') {
        candidates.push({
          tenantId: t._id,
          tenantSlug: t.slug,
          tenantName: t.name,
          scope: 'account',
          accountId: acc._id?.toString() ?? null,
          accountLabel: acc.label ?? 'Cuenta',
          health,
        })
      }
    }
    // Legacy mpOAuth solo si el tenant NO tiene mpAccounts (evitar duplicar
    // el mismo token cuando ya fue migrado a una cuenta).
    if ((!t.mpAccounts || t.mpAccounts.length === 0) && t.mpOAuth?.isConnected && t.mpOAuth?.refreshToken) {
      const health = getOauthHealth(t.mpOAuth.accessToken, t.mpOAuth.expiresAt, now)
      const status = classifyOauthExpiry(health.expiresAt, now, windowDays)
      if (status === 'expired' || status === 'soon' || status === 'unknown') {
        candidates.push({
          tenantId: t._id,
          tenantSlug: t.slug,
          tenantName: t.name,
          scope: 'legacy',
          accountId: null,
          accountLabel: 'OAuth legacy',
          health,
        })
      }
    }
  }
  return candidates
}

// ── Escaneo de salud (para superadmin / panel) ───────────────────────────────

export interface TenantTokenScan {
  tenantId: string
  slug: string
  name: string
  autoRenewFlag: boolean
  accounts: Array<{
    accountId: string | null
    label: string
    scope: RefreshScope
    isConnected: boolean
    hasRefreshToken: boolean
    health: OauthHealth
  }>
  expiredCount: number
  soonCount: number
  unknownCount: number
  validCount: number
  /** Próximo vencimiento entre las cuentas con fecha (null si ninguna). */
  nextExpiryAt: Date | null
}

/**
 * Escaneo por negocio: por cada tenant con OAuth, cuántos tokens están
 * vencidos, cuántos vencen pronto y cuándo es el próximo vencimiento.
 */
export async function scanTenantTokens(now: Date = new Date()): Promise<TenantTokenScan[]> {
  const tenants = await Tenant.find({
    status: { $ne: 'suspended' },
    $or: [
      { 'mpAccounts.oauthIsConnected': true },
      { 'mpOAuth.isConnected': true },
      { 'mpAccounts.oauthAccessToken': { $ne: null } },
      { 'mpOAuth.accessToken': { $ne: null } },
    ],
  })
    .select('slug name mpAccounts mpOAuth flags')
    .lean()

  const scans: TenantTokenScan[] = []
  for (const t of tenants) {
    const accounts: TenantTokenScan['accounts'] = []
    for (const acc of t.mpAccounts ?? []) {
      accounts.push({
        accountId: acc._id?.toString() ?? null,
        label: acc.label ?? 'Cuenta',
        scope: 'account',
        isConnected: !!acc.oauthIsConnected,
        hasRefreshToken: !!acc.oauthRefreshToken,
        health: getOauthHealth(acc.oauthAccessToken, acc.oauthExpiresAt, now),
      })
    }
    if ((!t.mpAccounts || t.mpAccounts.length === 0) && (t.mpOAuth?.accessToken || t.mpOAuth?.isConnected)) {
      accounts.push({
        accountId: null,
        label: 'OAuth legacy',
        scope: 'legacy',
        isConnected: !!t.mpOAuth?.isConnected,
        hasRefreshToken: !!t.mpOAuth?.refreshToken,
        health: getOauthHealth(t.mpOAuth.accessToken, t.mpOAuth.expiresAt, now),
      })
    }
    if (accounts.length === 0) continue

    let expiredCount = 0, soonCount = 0, unknownCount = 0, validCount = 0
    let nextExpiryAt: Date | null = null
    for (const a of accounts) {
      if (a.health.status === 'expired') expiredCount++
      else if (a.health.status === 'soon') soonCount++
      else if (a.health.status === 'unknown') unknownCount++
      else validCount++
      if (a.health.expiresAt) {
        if (!nextExpiryAt || a.health.expiresAt < nextExpiryAt) nextExpiryAt = a.health.expiresAt
      }
    }

    scans.push({
      tenantId: t._id?.toString() ?? '',
      slug: t.slug,
      name: t.name,
      autoRenewFlag: t.flags?.['mp.oauthAutoRenew'] === true,
      accounts,
      expiredCount,
      soonCount,
      unknownCount,
      validCount,
      nextExpiryAt,
    })
  }
  return scans.sort((a, b) => a.name.localeCompare(b.name))
}

// ── Mail de aviso de fallo ───────────────────────────────────────────────────

/** Destinatario del aviso de fallo de renovación (superadmin de plataforma). */
function alertRecipient(): string {
  return process.env.MP_ALERT_EMAIL ?? process.env.SMTP_FROM ?? process.env.SMTP_USER ?? ''
}

/**
 * Envía un mail de aviso si la renovación falla. Nunca lanza: un fallo de
 * envío no debe tumbar el cron (el error ya quedó en el resultado/log).
 */
export async function notifyRefreshFailure(result: {
  tenantSlug: string
  tenantName: string
  accountLabel: string
  reason: string
}): Promise<void> {
  const to = alertRecipient()
  if (!to) return
  try {
    await sendEmail(
      to,
      `Fallo renovación token Mercado Pago — ${result.tenantName}`,
      `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
        <h2 style="color:#c0392b;">No se pudo renovar el token OAuth de Mercado Pago</h2>
        <p><strong>Negocio:</strong> ${result.tenantName} (${result.tenantSlug})</p>
        <p><strong>Cuenta:</strong> ${result.accountLabel}</p>
        <p><strong>Motivo:</strong> ${result.reason}</p>
        <p style="color:#666; font-size:13px;">
          Si el motivo es un refresh_token inválido o vencido, hay que reconectar la cuenta
          desde el panel del negocio (Pasarela de Pagos → Conectar con MercadoPago).
          Hasta entonces los cobros usan el token manual si está disponible.
        </p>
      </div>
      `
    )
  } catch (err) {
    console.error('[mp-oauth] no se pudo enviar el mail de aviso de fallo:', err)
  }
}

// ── Candado cross-instancia ──────────────────────────────────────────────────

const LOCK_TTL_MS = 5 * 60 * 1000

/**
 * Adquiere un candado distribuido en PlatformConfig (TTL 5 min).
 * Devuelve true si se lo llevó este caller; false si otro ejecutor lo tiene.
 */
export async function acquireRefreshLock(owner: string): Promise<boolean> {
  const now = new Date()
  const res = await PlatformConfig.updateOne(
    {
      _id: 'platform',
      $or: [
        { 'mpOauthRenewLock.until': null },
        { 'mpOauthRenewLock.until': { $lte: now } },
      ],
    },
    {
      $set: {
        'mpOauthRenewLock.until': new Date(now.getTime() + LOCK_TTL_MS),
        'mpOauthRenewLock.owner': owner,
        'mpOauthRenewLock.acquiredAt': now,
      },
    }
  )
  return res.modifiedCount === 1
}

/** Libera el candado (solo si lo tiene este owner). */
export async function releaseRefreshLock(owner: string): Promise<void> {
  await PlatformConfig.updateOne(
    { _id: 'platform', 'mpOauthRenewLock.owner': owner },
    { $set: { 'mpOauthRenewLock.until': null } }
  )
}
