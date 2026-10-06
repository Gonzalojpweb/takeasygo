import { Router, type Response } from "express"
import mongoose from "mongoose"
import { signJwt, HUB_TOKEN_TTL_MS } from "@takeasygo/business/jwt"
import { SAAS_TO_POS_ROLE } from "@takeasygo/business"
import { config } from "../config"
import { validate, loginSchema } from "../middleware/validation"
import {
  loginRateLimiter,
  recordLoginFailure,
  clearLoginFailures,
  checkLogoutSubLimit,
} from "../middleware/rate-limiter"
import { denyJti } from "../auth/jtiDenylist"
import { disconnectSocketsByJti } from "../socket/registry"
import { UserModel, LocationModel } from "@takeasygo/db"
import type { Role } from "@takeasygo/types"

export const authRouter = Router()

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

// loginRateLimiter va primero: corta por IP (req.ip, real gracias a trust
// proxy) antes de validate() y antes de consultar la base.
authRouter.post("/login", loginRateLimiter, validate(loginSchema), async (req, res) => {
  try {
    const data = req.body

    if (data.mode === "email") {
      const user = await UserModel.findOne({
        email: data.email.toLowerCase(),
        isActive: true,
      }).select("+password")

      if (!user || !user.password) {
        recordLoginFailure(req)
        res.status(401).json({ error: "Invalid credentials" })
        return
      }

      const valid = await user.comparePassword(data.password)
      if (!valid) {
        recordLoginFailure(req)
        res.status(401).json({ error: "Invalid credentials" })
        return
      }

      const posRole = SAAS_TO_POS_ROLE[user.role]
      if (!posRole) {
        res.status(403).json({ error: "Access denied", code: "ROLE_NOT_ALLOWED" })
        return
      }

      const tenantId = user.tenantId?.toString() ?? ""
      const locationId = await resolveLocationId(tenantId, data.locationId, res)
      if (locationId === null) return
      clearLoginFailures(req)

      const token = signJwt(
        {
          sub: user._id?.toString() ?? user.email,
          tenantId,
          role: posRole as Role,
          deviceType: "hub",
          locationId,
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
      const user = await UserModel.findOne({
        tenantId: data.tenantId,
        isActive: true,
      }).select("+pin")

      if (!user || !user.pin) {
        recordLoginFailure(req)
        res.status(401).json({ error: "Invalid credentials" })
        return
      }

      const valid = await user.comparePin(data.employeePin)
      if (!valid) {
        recordLoginFailure(req)
        res.status(401).json({ error: "Invalid credentials" })
        return
      }

      const posRole = SAAS_TO_POS_ROLE[user.role]
      if (!posRole) {
        res.status(403).json({ error: "Access denied", code: "ROLE_NOT_ALLOWED" })
        return
      }

      const tenantId = user.tenantId?.toString() ?? data.tenantId
      const locationId = await resolveLocationId(tenantId, data.locationId, res)
      if (locationId === null) return
      clearLoginFailures(req)

      const token = signJwt(
        {
          sub: user._id?.toString() ?? user.email,
          tenantId,
          role: posRole as Role,
          deviceType: "hub",
          locationId,
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
