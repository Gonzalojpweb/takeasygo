import { Router } from "express"
import { randomUUID } from "node:crypto"
import Redis from "ioredis"
import { signJwt } from "@takeasygo/business"
import { config } from "../config"

const SSO_TOKEN_TTL_MS = 60_000
const SSO_REDIS_PREFIX = "ssoToken:"

let redis: Redis | null = null

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    })
    redis.on("error", (err) => console.error("[sso/redis] error:", err.message))
  }
  return redis
}

process.on("SIGTERM", () => {
  if (redis) {
    redis.quit()
    redis = null
  }
})

export function ssoRouter(): Router {
  const router = Router()

  router.post("/sso-token", async (req, res) => {
    try {
      const auth = req.auth!
      const r = getRedis()
      const jti = randomUUID()

      const ssoToken = signJwt(
        {
          sub: auth.sub,
          tenantId: auth.tenantId,
          role: auth.role,
          deviceType: "hub",
        },
        config.jwtPrivateKey,
        SSO_TOKEN_TTL_MS
      )

      const ttlSeconds = Math.floor(SSO_TOKEN_TTL_MS / 1000)
      const redisKey = `${SSO_REDIS_PREFIX}${jti}`
      await r.set(redisKey, JSON.stringify({ ssoToken, consumed: false }), "EX", ttlSeconds)

      const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds

      res.json({ ssoToken, jti, expiresAt })
    } catch (err) {
      console.error("[sso] token error:", err)
      res.status(500).json({ error: "Internal server error" })
    }
  })

  return router
}
