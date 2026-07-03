import { Router } from "express"
import { signJwt, HUB_TOKEN_TTL_MS, SAAS_TO_POS_ROLE } from "@takeasygo/business"
import { config } from "../config"
import { validate, loginSchema } from "../middleware/validation"
import { UserModel } from "@takeasygo/db"
import type { Role } from "@takeasygo/types"

export const authRouter = Router()

authRouter.post("/login", validate(loginSchema), async (req, res) => {
  try {
    const data = req.body

    if (data.mode === "email") {
      const user = await UserModel.findOne({
        email: data.email.toLowerCase(),
        isActive: true,
      }).select("+password")

      if (!user || !user.password) {
        res.status(401).json({ error: "Invalid credentials" })
        return
      }

      const valid = await user.comparePassword(data.password)
      if (!valid) {
        res.status(401).json({ error: "Invalid credentials" })
        return
      }

      const posRole = SAAS_TO_POS_ROLE[user.role]
      if (!posRole) {
        res.status(403).json({ error: "Access denied", code: "ROLE_NOT_ALLOWED" })
        return
      }

      const token = signJwt(
        {
          sub: user._id?.toString() ?? user.email,
          tenantId: user.tenantId?.toString() ?? "",
          role: posRole as Role,
          deviceType: "hub",
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
        res.status(401).json({ error: "Invalid credentials" })
        return
      }

      const valid = await user.comparePin(data.employeePin)
      if (!valid) {
        res.status(401).json({ error: "Invalid credentials" })
        return
      }

      const posRole = SAAS_TO_POS_ROLE[user.role]
      if (!posRole) {
        res.status(403).json({ error: "Access denied", code: "ROLE_NOT_ALLOWED" })
        return
      }

      const token = signJwt(
        {
          sub: user._id?.toString() ?? user.email,
          tenantId: user.tenantId?.toString() ?? data.tenantId,
          role: posRole as Role,
          deviceType: "hub",
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
