import { Router } from "express"
import type { Response } from "express"
import mongoose from "mongoose"
import { signJwt, HUB_TOKEN_TTL_MS, HUB_SESSION_MAX_AGE_MS } from "@takeasygo/business/jwt"
import { SAAS_TO_POS_ROLE, VALID_DEVICE_ROLES } from "@takeasygo/business"
import { posPinLookup, resolvePosPinPepper } from "@takeasygo/business/pos-pin"
import { config } from "../config"
import { validate, loginSchema } from "../middleware/validation"
import {
  loginRateLimiter,
  recordLoginFailure,
  clearLoginFailures,
  checkAccountLock,
  recordAccountFailure,
  clearAccountFailures,
  checkLogoutSubLimit,
  checkRefreshSubLimit,
} from "../middleware/rate-limiter"
import { denyJti } from "../auth/jtiDenylist"
import { disconnectSocketsByJti } from "../socket/registry"
import { UserModel, LocationModel } from "@takeasygo/db"
import type { Role } from "@takeasygo/types"

export const authRouter = Router()

/** Usuarios legacy (PIN sin posPinLookup) que se prueban con bcrypt como máximo. */
const LEGACY_PIN_SCAN = 20
/** Fallos de PIN por tenant (en la ventana de config) antes del lock progresivo. */
const PIN_TENANT_FAIL_LIMIT = 20

/**
 * Valida que locationId sea una sede activa del tenant.
 * Devuelve el locationId string, null si el POS no eligió sede (legacy), o
 * undefined cuando el tenant necesita sede, para que el caller no continúe.
 */
async function resolveLocationId(
  tenantId: string,
  locationId: string | undefined,
  res: Response
): Promise<string | null | undefined> {
  if (!locationId) return undefined

  if (!mongoose.Types.ObjectId.isValid(locationId)) {
    res.status(400).json({ error: "Invalid locationId", code: "INVALID_LOCATION" })
    return null
  }

  const loc = await LocationModel.findOne({
    _id: locationId,
    tenantId,
    isActive: true,
    status: "active",
  }).select("_id name").lean()

  if (!loc) {
    res.status(400).json({ error: "Location not found for this tenant", code: "INVALID_LOCATION" })
    return null
  }

  return locationId
}

/** Responde 429 si la cuenta está lockeada. Devuelve true si respondió. */
async function rejectIfAccountLocked(res: Response, accountKey: string): Promise<boolean> {
  const lockedFor = await checkAccountLock(accountKey)
  if (lockedFor <= 0) return false
  res.setHeader("Retry-After", String(lockedFor))
  res.status(429).json({
    error: "Account temporarily locked",
    code: "account_locked",
    retryAfter: lockedFor,
  })
  return true
}

// loginRateLimiter va primero: corta por IP (req.ip, real gracias a trust
// proxy) antes de validate() y antes de consultar la base.
authRouter.post("/login", loginRateLimiter, validate(loginSchema), async (req, res) => {
  try {
    const data = req.body

    if (data.mode === "email") {
      const accountKey = `email:${String(data.email).trim().toLowerCase()}`
      if (await rejectIfAccountLocked(res, accountKey)) return

      const user = await UserModel.findOne({
        email: data.email.toLowerCase(),
        isActive: true,
      }).select("+password")

      if (!user || !user.password) {
        recordLoginFailure(req)
        await recordAccountFailure(accountKey)
        res.status(401).json({ error: "Invalid credentials" })
        return
      }

      const valid = await user.comparePassword(data.password)
      if (!valid) {
        recordLoginFailure(req)
        await recordAccountFailure(accountKey)
        res.status(401).json({ error: "Invalid credentials" })
        return
      }

      // Solo roles que pueden operar un hub (VALID_DEVICE_ROLES.hub): antes
      // a staff/seller se les emitía un token que después daba 403 en todo.
      const posRole = SAAS_TO_POS_ROLE[user.role]
      if (!posRole || !VALID_DEVICE_ROLES.hub.includes(posRole)) {
        res.status(403).json({ error: "Access denied", code: "ROLE_NOT_ALLOWED" })
        return
      }

      const tenantId = user.tenantId?.toString() ?? ""
      const locationId = await resolveLocationId(tenantId, data.locationId, res)
      if (locationId === null) return
      clearLoginFailures(req)
      await clearAccountFailures(accountKey)

      const token = signJwt(
        {
          sub: user._id?.toString() ?? user.email,
          tenantId,
          role: posRole as Role,
          deviceType: "hub",
          locationId,
          authTime: Math.floor(Date.now() / 1000),
        },
        config.jwtPrivateKey,
        HUB_TOKEN_TTL_MS
      )

      const expSeconds = Math.floor(Date.now() / 1000) + Math.floor(HUB_TOKEN_TTL_MS / 1000)

      res.json({
        accessToken: token,
        expiresAt: expSeconds,
        deviceType: "hub",
      })
      return
    }

    if (data.mode === "pin") {
      // ── PIN (Auditoría POS Online V1, validación) ─────────────────────
      // Antes: findOne({ tenantId, isActive }) devolvía UN usuario cualquiera
      // del tenant y el PIN se comparaba solo contra ése. Ahora:
      //   1. lookup HMAC(pepper, tenantId:pin) → usuario exacto (índice único)
      //   2. bcrypt contra su hash (defensa en profundidad)
      //   3. fallback legacy acotado para PINs anteriores al lookup (sin
      //      posPinLookup): bcrypt contra ≤ LEGACY_PIN_SCAN usuarios; si
      //      matchea, se escribe el lookup y no vuelve a pasar por acá.
      // Lock por TENANT además del de IP: un fallo de PIN no identifica a
      // nadie, así que el contador es del tenant (umbral holgado para que
      // el staff que se equivoca no bloquee el local).
      const tenantId = String(data.tenantId)
      if (!mongoose.Types.ObjectId.isValid(tenantId)) {
        recordLoginFailure(req)
        res.status(401).json({ error: "Invalid credentials" })
        return
      }
      const tenantKey = `pin-tenant:${tenantId}`
      if (await rejectIfAccountLocked(res, tenantKey)) return

      const pin = String(data.employeePin)
      const pepper = resolvePosPinPepper(process.env)
      let user: InstanceType<typeof UserModel> | null = null

      if (pepper) {
        const lookup = posPinLookup(pepper, tenantId, pin)
        const candidate = await UserModel.findOne({
          tenantId,
          posPinLookup: lookup,
          isActive: true,
        }).select("+pin")
        if (candidate && (await candidate.comparePin(pin))) user = candidate
      }

      if (!user) {
        const legacy = await UserModel.find({
          tenantId,
          isActive: true,
          pin: { $type: "string" },
          posPinLookup: { $exists: false },
        })
          .select("+pin")
          .limit(LEGACY_PIN_SCAN)
        for (const candidate of legacy) {
          if (await candidate.comparePin(pin)) {
            user = candidate
            if (pepper) {
              await UserModel.updateOne(
                { _id: candidate._id },
                { $set: { posPinLookup: posPinLookup(pepper, tenantId, pin) } }
              ).catch((err) => console.warn("[auth] backfill posPinLookup falló:", err?.message))
            }
            break
          }
        }
      }

      if (!user) {
        recordLoginFailure(req)
        await recordAccountFailure(tenantKey, PIN_TENANT_FAIL_LIMIT)
        res.status(401).json({ error: "Invalid credentials" })
        return
      }

      const posRole = SAAS_TO_POS_ROLE[user.role]
      if (!posRole || !VALID_DEVICE_ROLES.hub.includes(posRole)) {
        res.status(403).json({ error: "Access denied", code: "ROLE_NOT_ALLOWED" })
        return
      }

      const locationId = await resolveLocationId(tenantId, data.locationId, res)
      if (locationId === null) return
      clearLoginFailures(req)
      await clearAccountFailures(tenantKey)

      const token = signJwt(
        {
          sub: user._id?.toString() ?? user.email,
          tenantId,
          role: posRole as Role,
          deviceType: "hub",
          locationId,
          authTime: Math.floor(Date.now() / 1000),
        },
        config.jwtPrivateKey,
        HUB_TOKEN_TTL_MS
      )

      const expSeconds = Math.floor(Date.now() / 1000) + Math.floor(HUB_TOKEN_TTL_MS / 1000)

      res.json({
        accessToken: token,
        expiresAt: expSeconds,
        deviceType: "hub",
      })
      return
    }

    res.status(400).json({ error: "Invalid login mode" })
  } catch (err) {
    console.error("[auth] login error:", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

// ============================================================================
// Logout (S1-5) — SE MONTA DESPUÉS de authMiddleware (ver routes/index.ts):
// necesita req.auth (con jti/exp) que solo el middleware completo arma.
// El POS llama a sync Y a saas en el mismo logout: cada verificador tiene
// su propia denylist (Redis local acá, Upstash allá).
// ============================================================================
export const logoutRouter = Router()

logoutRouter.post("/logout", async (req, res) => {
  try {
    const auth = req.auth!

    // Límite por sub DESPUÉS de verificar (el por-IP ya corrió antes de
    // authMiddleware, ver routes/index.ts).
    if (!checkLogoutSubLimit(auth.sub)) {
      res.status(429).json({ error: "Too many logout requests", code: "rate_limited" })
      return
    }

    const ttl = Math.max(auth.exp - Math.floor(Date.now() / 1000), 0) + 60
    const ok = await denyJti(auth.jti, ttl)

    // Sockets: se tumban igual — denyJti escribió la memoria local de este
    // proceso, así que este instancia ya no acepta el token.
    const sockets = disconnectSocketsByJti(auth.jti)

    if (!ok) {
      // Redis no confirmó: el POS debe registrar la revocación como
      // PARCIAL (503) y reintentar. Este proceso quedó cubierto igual.
      console.error(`[auth] logout 503: denylist no confirmada | sub=${auth.sub} tenantId=${auth.tenantId} sockets=${sockets}`)
      res.status(503).json({ error: "Revocación no persistida", code: "revoke_unavailable" })
      return
    }

    console.log(`[auth] logout revocado | sub=${auth.sub} tenantId=${auth.tenantId} ttl=${ttl}s sockets=${sockets}`)
    res.json({ revoked: true })
  } catch (err) {
    console.error("[auth] logout error:", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

// ============================================================================
// Refresh — renueva el token del hub sin volver a pedir el PIN
// ============================================================================
// Auditoría POS Online V1 §1.4: el token vive 30 min y no había refresh → el
// cajero perdía la sesión a mitad de turno. Montado en logoutRouter (después
// de authMiddleware): el token que llega YA está verificado (firma, exp, jti
// y denylist).
//
// Security by design:
//   · Re-valida contra la base: usuario activo del MISMO tenant, rol con
//     acceso al POS y sede todavía activa. Un usuario dado de baja o una sede
//     cerrada no se pueden "estirar" con refresh.
//   · Tope absoluto: authTime (login original) + HUB_SESSION_MAX_AGE_MS. Un
//     token robado no se refresca para siempre. Tokens viejos sin authTime
//     cuentan desde su iat.
//   · Rotación: el jti viejo se veta acá (Redis local) por su vida restante.
//     El POS además lo revoca en el SaaS (Upstash) — ver services/auth-api.
//   · Rate limit 10/min por sub.
// ============================================================================
logoutRouter.post("/refresh", async (req, res) => {
  try {
    const auth = req.auth!

    if (!checkRefreshSubLimit(auth.sub)) {
      res.status(429).json({ error: "Too many refresh requests", code: "rate_limited" })
      return
    }

    const nowSec = Math.floor(Date.now() / 1000)
    const authTime = auth.authTime ?? auth.iat
    if (nowSec - authTime > Math.floor(HUB_SESSION_MAX_AGE_MS / 1000)) {
      res.status(401).json({ error: "Session expired", code: "session_max_age" })
      return
    }

    if (!mongoose.Types.ObjectId.isValid(auth.sub)) {
      res.status(401).json({ error: "Invalid session", code: "invalid_session" })
      return
    }
    const user = await UserModel.findOne({
      _id: auth.sub,
      tenantId: auth.tenantId,
      isActive: true,
    })
      .select("_id role tenantId")
      .lean()
    if (!user) {
      res.status(401).json({ error: "Invalid session", code: "invalid_session" })
      return
    }

    const posRole = SAAS_TO_POS_ROLE[user.role]
    if (!posRole) {
      res.status(403).json({ error: "Access denied", code: "ROLE_NOT_ALLOWED" })
      return
    }

    if (auth.locationId) {
      const loc = await LocationModel.findOne({
        _id: auth.locationId,
        tenantId: auth.tenantId,
        isActive: true,
        status: "active",
      })
        .select("_id")
        .lean()
      if (!loc) {
        res.status(401).json({ error: "Location no longer active", code: "location_inactive" })
        return
      }
    }

    const token = signJwt(
      {
        sub: auth.sub,
        tenantId: auth.tenantId,
        role: posRole as Role,
        deviceType: auth.deviceType,
        locationId: auth.locationId,
        authTime,
      },
      config.jwtPrivateKey,
      HUB_TOKEN_TTL_MS
    )
    const expSeconds = nowSec + Math.floor(HUB_TOKEN_TTL_MS / 1000)

    // Rotación: el token anterior deja de servir en el Sync (HTTP + socket).
    const ttl = Math.max(auth.exp - nowSec, 0) + 60
    const revoked = await denyJti(auth.jti, ttl)
    if (!revoked) {
      // No se corta el refresh: el viejo vence solo (≤30 min) y el POS ya
      // descarta su copia. Queda logueado para diagnóstico.
      console.warn(`[auth] refresh: denylist del token anterior no confirmada | sub=${auth.sub}`)
    }

    res.json({ accessToken: token, expiresAt: expSeconds, deviceType: auth.deviceType })
  } catch (err) {
    console.error("[auth] refresh error:", err)
    res.status(500).json({ error: "Internal server error" })
  }
})
