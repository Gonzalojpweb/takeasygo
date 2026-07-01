import type { Request, Response, NextFunction } from "express"
import { verifyJwt } from "@takeasygo/business"
import { config } from "../config"
import type { Role, DeviceType } from "@takeasygo/types"

export interface AuthPayload {
  sub: string
  tenantId: string
  role: Role
  deviceType: DeviceType
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
    res.status(401).json({ error: "Missing or invalid authorization header" })
    return
  }

  const token = header.slice(7)
  const payload = verifyJwt(token, config.jwtPublicKey)
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" })
    return
  }

  req.auth = {
    sub: payload.sub,
    tenantId: payload.tenantId,
    role: payload.role,
    deviceType: payload.deviceType,
  }

  next()
}
