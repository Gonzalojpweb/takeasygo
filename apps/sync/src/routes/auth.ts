import { Router } from "express"
import { signJwt, HUB_TOKEN_TTL_MS } from "@takeasygo/business"
import { config } from "../config"
import { validate, loginSchema } from "../middleware/validation"
import { TenantModel } from "@takeasygo/db"

export const authRouter = Router()

authRouter.post("/login", validate(loginSchema), async (req, res) => {
  try {
    const { email } = req.body

    const tenant = await TenantModel.findOne({
      "users.email": email,
      isActive: true,
    })

    if (!tenant) {
      res.status(401).json({ error: "Invalid credentials" })
      return
    }

    const user = (tenant as any).users?.find(
      (u: any) => u.email === email
    )

    if (!user) {
      res.status(401).json({ error: "Invalid credentials" })
      return
    }

    const token = signJwt(
      {
        sub: user._id?.toString() ?? email,
        tenantId: tenant._id?.toString() ?? "",
        role: user.role ?? "cashier",
        deviceType: "hub",
      },
      config.jwtPublicKey,
      HUB_TOKEN_TTL_MS
    )

    const expSeconds = Math.floor(Date.now() / 1000) + Math.floor(HUB_TOKEN_TTL_MS / 1000)

    res.json({
      accessToken: token,
      expiresAt: expSeconds,
      deviceType: "hub",
    })
  } catch (err) {
    console.error("[auth] login error:", err)
    res.status(500).json({ error: "Internal server error" })
  }
})
