import type { Request, Response, NextFunction } from "express"
import { verifyJwt } from "@takeasygo/business/jwt"
import { SAAS_TO_POS_ROLE, VALID_DEVICE_ROLES } from "@takeasygo/business"
import { config } from "../config"
import { isJtiDenied } from "./jtiDenylist"
import type { Role, DeviceType } from "@takeasygo/types"

export interface AuthPayload {
  sub: string
  tenantId: string
  role: Role
  deviceType: DeviceType
  posRole: string
  /** Sede del POS (multi-sede). Ausente en POS single-sede (legacy). */
  locationId?: string
  /** Identificador único del token — con él se revoca en logout (S1-5). */
  jti: string
  /** Expiración (epoch s) — para calcular el TTL del veto al revocar. */
  exp: number
}

declare global {
  // La augmentación de Express exige namespace (patrón oficial de tipos).
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthPayload
    }
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const header = req.headers.authorization
    if (!header?.startsWith("Bearer ")) {
      // Nunca imprimir el valor del header: si no es "Bearer …" puede ser
      // un credential header completo (Basic, etc.) — filtraría secretos.
      console.warn(`[auth] Missing/invalid header | path=${req.path} header=${header ? "presente" : "ausente"}`)
      res.status(401).json({
        error: "Missing or invalid authorization header",
        requestId: req.id,
      })
      return
    }

    const token = header.slice(7)
    const payload = verifyJwt(token, config.jwtPublicKey)
    if (!payload) {
      console.warn(`[auth] JWT verification failed | path=${req.path} tokenLen=${token.length} tokenFirst4="${token.slice(0, 4)}" pubKeyLen=${config.jwtPublicKey.length}`)
      res.status(401).json({
        error: "Invalid or expired token",
        requestId: req.id,
      })
      return
    }

    // S1-5: sin jti no hay forma de revocarlo (token pre-S1-5) → 401, y si
    // el jti está en la denylist el logout ya lo revocó → también 401.
    if (!payload.jti) {
      console.warn(`[auth] Token sin jti (pre-S1-5) | path=${req.path} sub=${payload.sub} tenantId=${payload.tenantId}`)
      res.status(401).json({
        error: "Invalid or expired token",
        requestId: req.id,
      })
      return
    }
    if (await isJtiDenied(payload.jti)) {
      console.warn(`[auth] Token revocado (denylist) | path=${req.path} sub=${payload.sub} tenantId=${payload.tenantId}`)
      res.status(401).json({
        error: "Invalid or expired token",
        requestId: req.id,
      })
      return
    }

    const posRole = SAAS_TO_POS_ROLE[payload.role]
    if (!posRole) {
      console.warn(`[auth] Role not allowed | path=${req.path} role="${payload.role}" sub=${payload.sub} tenantId=${payload.tenantId}`)
      res.status(403).json({
        error: "Access denied",
        code: "ROLE_NOT_ALLOWED",
        requestId: req.id,
      })
      return
    }

    if (!VALID_DEVICE_ROLES[payload.deviceType]?.includes(posRole)) {
      console.warn(`[auth] Device/role mismatch | path=${req.path} deviceType="${payload.deviceType}" posRole="${posRole}"`)
      res.status(403).json({
        error: "deviceType/role mismatch",
        code: "DEVICE_ROLE_MISMATCH",
        requestId: req.id,
      })
      return
    }

    req.auth = {
      sub: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
      deviceType: payload.deviceType,
      posRole,
      locationId: payload.locationId,
      jti: payload.jti,
      exp: payload.exp,
    }

    next()
  } catch (err) {
    console.error(`[auth] middleware error | path=${req.path}:`, err)
    next(err)
  }
}
