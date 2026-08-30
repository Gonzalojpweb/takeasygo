import type { Request, Response, NextFunction } from "express"
import { verifyJwt, SAAS_TO_POS_ROLE, VALID_DEVICE_ROLES } from "@takeasygo/business"
import { config } from "../config"
import type { Role, DeviceType } from "@takeasygo/types"

export interface AuthPayload {
  sub: string
  tenantId: string
  role: Role
  deviceType: DeviceType
  posRole: string
  /** Sede del POS (multi-sede). Ausente en POS single-sede (legacy). */
  locationId?: string
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload
    }
  }
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization
  if (!header?.startsWith("Bearer ")) {
    console.warn(`[auth] Missing/invalid header | path=${req.path} header="${header ?? "(none)"}"`)
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
  }

  next()
}
