import { canApproveDiscount, evaluateDiscount, isApproverRole, type DiscountAmounts, type DiscountPolicy } from "@takeasygo/business/browser"
import type { LoginResponse } from "../auth-api"
import { SESSION_CACHE_KEY, PosApiError } from "../pos-api"
import { requestManagerPin } from "../manager-approval"
import { isOfflineEnabled } from "./device"
import { offlineStore } from "./store"

// ============================================================================
// Ingreso y aprobación con PIN sin internet (POS offline V2 — etapa 7)
// ============================================================================
// Cada vez que alguien entra con su PIN CON internet en un equipo habilitado,
// el equipo guarda un VERIFICADOR del PIN (PBKDF2-SHA256, 150.000 vueltas,
// sal propia por usuario): nunca el PIN, nunca el token. Sin internet:
//
//   · Ingreso: el PIN se compara contra esos verificadores. Solo entran
//     usuarios que ya entraron en ESTE equipo con internet en los últimos 7
//     días (la misma ventana de confianza del equipo). El token del server
//     no existe en ese momento: al volver la red, el POS pide el PIN otra vez
//     para pedir uno real y recién ahí manda la cola.
//   · Aprobación del encargado (descuentos, quitar platos ya enviados): el
//     PIN se verifica contra los verificadores de encargados/admins. La
//     operación viaja con X-Pos-Offline-Approver y el server la acepta solo
//     si viene de un equipo habilitado y ese usuario sigue siendo encargado.
//   · 5 PIN errados seguidos bloquean el ingreso sin internet 5 minutos.
// ============================================================================

export const OFFLINE_LOGIN_TRUST_MS = 7 * 24 * 60 * 60 * 1000
const ITERATIONS = 150_000
const MAX_FAILS = 5
const LOCK_MS = 5 * 60 * 1000

export interface OfflineUser {
  userId: string
  name: string
  role: string
  locationId: string | null
  salt: string
  verifier: string
  /** Perfil para el encabezado (sin token). */
  profile: LoginResponse["profile"] | null
  /** ISO del último ingreso con internet. */
  savedAt: string
}

const usersKey = (tenantId: string) => `offlineUsers:${tenantId}`
const failsKey = (tenantId: string) => `offlineLoginFails:${tenantId}`

const hex = (bytes: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("")
const unhex = (s: string) => Uint8Array.from(s.match(/.{2}/g) ?? [], (h) => parseInt(h, 16))

async function derive(pin: string, saltHex: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"])
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unhex(saltHex), iterations: ITERATIONS }, key, 256)
  return hex(bits)
}

function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export function jwtSubject(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { sub?: unknown }
    return typeof payload.sub === "string" ? payload.sub : null
  } catch {
    return null
  }
}

async function listUsers(tenantId: string): Promise<OfflineUser[]> {
  return (await offlineStore().getMeta<OfflineUser[]>(usersKey(tenantId))) ?? []
}

/** Después de un ingreso con internet: guarda (o renueva) el verificador del usuario. */
export async function rememberOfflineUser(tenantId: string, pin: string, result: LoginResponse, locationId?: string | null): Promise<void> {
  if (!(await isOfflineEnabled(tenantId))) return
  const userId = jwtSubject(result.accessToken)
  if (!userId) return
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)))
  const user: OfflineUser = {
    userId,
    name: result.profile?.userName ?? "Usuario",
    role: result.profile?.role ?? "cashier",
    locationId: locationId ?? null,
    salt,
    verifier: await derive(pin, salt),
    profile: result.profile ?? null,
    savedAt: new Date().toISOString(),
  }
  const others = (await listUsers(tenantId)).filter((u) => u.userId !== userId)
  await offlineStore().setMeta(usersKey(tenantId), [...others, user])
}

/** Quita a todos los usuarios guardados (equipo revocado, cierre de sesión total). */
export async function forgetOfflineUsers(tenantId: string): Promise<void> {
  await offlineStore().deleteMeta(usersKey(tenantId))
}

export type OfflineLoginResult = { ok: true; user: OfflineUser } | { ok: false; reason: "not_enabled" | "no_users" | "locked" | "invalid"; retryAfter?: number }

/** Busca al dueño del PIN entre los usuarios que ya entraron en este equipo. */
async function matchPin(tenantId: string, pin: string, now: number): Promise<OfflineUser | null> {
  for (const user of await listUsers(tenantId)) {
    if (now - new Date(user.savedAt).getTime() > OFFLINE_LOGIN_TRUST_MS) continue
    if (sameHex(await derive(pin, user.salt), user.verifier)) return user
  }
  return null
}

export async function offlinePinLogin(tenantId: string, pin: string, now = Date.now()): Promise<OfflineLoginResult> {
  if (!(await isOfflineEnabled(tenantId, now))) return { ok: false, reason: "not_enabled" }
  const users = (await listUsers(tenantId)).filter((u) => now - new Date(u.savedAt).getTime() <= OFFLINE_LOGIN_TRUST_MS)
  if (users.length === 0) return { ok: false, reason: "no_users" }
  const fails = (await offlineStore().getMeta<{ count: number; until: number | null }>(failsKey(tenantId))) ?? { count: 0, until: null }
  if (fails.until && fails.until > now) return { ok: false, reason: "locked", retryAfter: Math.ceil((fails.until - now) / 1000) }

  const user = await matchPin(tenantId, pin, now)
  if (!user) {
    const count = fails.count + 1
    await offlineStore().setMeta(failsKey(tenantId), count >= MAX_FAILS ? { count: 0, until: now + LOCK_MS } : { count, until: null })
    return count >= MAX_FAILS ? { ok: false, reason: "locked", retryAfter: LOCK_MS / 1000 } : { ok: false, reason: "invalid" }
  }
  await offlineStore().setMeta(failsKey(tenantId), { count: 0, until: null })
  return { ok: true, user }
}

/** Sesión que arma el POS para un ingreso sin internet (sin token del server). */
export function offlineSessionFor(user: OfflineUser, hours = 8): LoginResponse & { offline: true; offlineUserId: string } {
  return {
    accessToken: "",
    expiresAt: Math.floor(Date.now() / 1000) + hours * 3600,
    deviceType: "hub",
    ...(user.profile ? { profile: user.profile } : {}),
    offline: true,
    offlineUserId: user.userId,
  }
}

/** Quién está operando ahora (id y rol), con o sin internet. */
export function currentPosUser(): { userId: string | null; role: string | null; offline: boolean } {
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY)
    if (!raw) return { userId: null, role: null, offline: false }
    const data = JSON.parse(raw) as { accessToken?: string; offlineUserId?: string; offline?: boolean; profile?: { role?: string } }
    return {
      userId: data.offlineUserId ?? (data.accessToken ? jwtSubject(data.accessToken) : null),
      role: data.profile?.role ?? null,
      offline: data.offline === true,
    }
  } catch {
    return { userId: null, role: null, offline: false }
  }
}

/**
 * Aprobación de encargado SIN internet. Si el que opera ya es encargado,
 * aprueba él. Si no, pide el PIN y lo verifica contra los encargados que ya
 * entraron en este equipo. Devuelve el header que viaja con la operación, o
 * lanza si se cancela o no hay encargado que lo pueda aprobar.
 */
export async function offlineApprovalHeaders(tenantId: string, message: string): Promise<Record<string, string>> {
  const me = currentPosUser()
  if (me.userId && isApproverRole(me.role)) return { "X-Pos-Offline-Approver": me.userId }
  const approvers = (await listUsers(tenantId)).filter((u) => isApproverRole(u.role) && Date.now() - new Date(u.savedAt).getTime() <= OFFLINE_LOGIN_TRUST_MS)
  if (approvers.length === 0) {
    throw new PosApiError("Sin internet solo puede aprobar un encargado que ya haya entrado en este equipo con internet.", "approval_required", 403)
  }
  let error: string | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    const pin = await requestManagerPin({ message: `${message} (sin internet)`, error })
    if (pin === null) throw new PosApiError("Operación cancelada: falta la aprobación del encargado", "approval_cancelled", 403)
    for (const user of approvers) {
      if (sameHex(await derive(pin, user.salt), user.verifier)) return { "X-Pos-Offline-Approver": user.userId }
    }
    error = "PIN incorrecto o de alguien que no es encargado"
  }
  throw new PosApiError("PIN del encargado incorrecto", "approval_invalid", 403)
}

/**
 * Descuento SIN internet con la política del comercio (14/11/2026). Decide
 * con la copia guardada en el equipo:
 *   · alcanza solo → no hace falta header (el server vuelve a evaluar);
 *   · supera el máximo del rol → no se aplica;
 *   · necesita autorización → PIN de OTRA persona cuya autonomía lo cubra
 *     (un encargado no se autoriza a sí mismo por encima de su límite).
 * Al volver la red el server reevalúa con la política vigente o con la que
 * regía en ese momento; una copia vieja o tocada en el equipo no habilita nada.
 */
export async function offlineDiscountApprovalHeaders(
  tenantId: string,
  policy: DiscountPolicy,
  amounts: DiscountAmounts
): Promise<Record<string, string>> {
  const me = currentPosUser()
  const decision = evaluateDiscount(policy, me.role, amounts)
  if (decision.kind === "allow") return {}
  if (decision.kind === "deny") throw new PosApiError(decision.message, "forbidden", 403)
  const approvers = (await listUsers(tenantId)).filter(
    (u) => u.userId !== me.userId && canApproveDiscount(policy, u.role, amounts) && Date.now() - new Date(u.savedAt).getTime() <= OFFLINE_LOGIN_TRUST_MS
  )
  if (approvers.length === 0) {
    throw new PosApiError("Sin internet solo puede autorizar este descuento alguien con permiso que ya haya entrado en este equipo con internet.", "approval_required", 403)
  }
  let error: string | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    const pin = await requestManagerPin({ message: `${decision.message} (sin internet)`, error })
    if (pin === null) throw new PosApiError("Operación cancelada: falta la autorización", "approval_cancelled", 403)
    for (const user of approvers) {
      if (sameHex(await derive(pin, user.salt), user.verifier)) return { "X-Pos-Offline-Approver": user.userId }
    }
    error = "PIN incorrecto o de alguien que no puede autorizar este descuento"
  }
  throw new PosApiError("PIN incorrecto", "approval_invalid", 403)
}
