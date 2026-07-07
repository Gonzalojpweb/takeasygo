import { Router } from "express"
import type { Server as SocketServer } from "socket.io"
import Redis from "ioredis"
import {
  validate,
  pairingPublishSchema,
  pairingClaimSchema,
  pairingApproveSchema,
} from "../middleware/validation"
import { config } from "../config"

const PAIRING_CODE_TTL_SECONDS = 300
const PAIRING_NONCE_TTL_SECONDS = 300
const DEVICE_SECRET_KEY_PREFIX = "deviceSecret:"

let redis: Redis | null = null

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    })
    redis.on("error", (err) => console.error("[pairing/redis] error:", err.message))
  }
  return redis
}

process.on("SIGTERM", () => {
  if (redis) {
    redis.quit()
    redis = null
  }
})

function generatePairingCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let code = ""
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export function pairingRouter(io: SocketServer): Router {
  const router = Router()

  router.post(
    "/hub-publish",
    validate(pairingPublishSchema),
    async (req, res) => {
      try {
        const auth = req.auth!
        const { hubId, nonce, hubIp, hubPort, pubKey } = req.body
        const r = getRedis()

        const nonceKey = `pairingNonce:${auth.tenantId}:${nonce}`
        const nonceExists = await r.exists(nonceKey)
        if (nonceExists) {
          res.status(409).json({ error: "Nonce already used" })
          return
        }

        const code = generatePairingCode()

        const pairingData = JSON.stringify({
          hubId,
          tenantId: auth.tenantId,
          code,
          nonce,
          hubIp,
          hubPort,
          pubKey,
          createdAt: new Date().toISOString(),
        })

        await r.set(`pairing:${auth.tenantId}:${code}`, pairingData, "EX", PAIRING_CODE_TTL_SECONDS)
        await r.set(nonceKey, "1", "EX", PAIRING_NONCE_TTL_SECONDS)

        res.json({
          code,
          expiresAt: Math.floor(Date.now() / 1000) + PAIRING_CODE_TTL_SECONDS,
        })
      } catch (err) {
        console.error("[pairing] hub-publish error:", err)
        res.status(500).json({ error: "Internal server error" })
      }
    }
  )

  router.post(
    "/spoke-claim",
    validate(pairingClaimSchema),
    async (req, res) => {
      try {
        const { code, nonce, deviceId, deviceName, fingerprint } = req.body
        const r = getRedis()

        const keys = await r.keys("pairing:*:" + code)
        if (keys.length === 0) {
          res.status(404).json({
            error: "Invalid or expired pairing code",
            code: "invalid_code",
          })
          return
        }

        const pairingKey = keys[0]
        const raw = await r.get(pairingKey)
        if (!raw) {
          res.status(404).json({
            error: "Invalid or expired pairing code",
            code: "invalid_code",
          })
          return
        }
        const pairingData = JSON.parse(raw) as {
          tenantId: string
          hubId: string
          hubIp: string
          hubPort: number
          pubKey: string
        }

        const nonceKey = `pairingClaimNonce:${pairingData.tenantId}:${deviceId}:${nonce}`
        const nonceExists = await r.exists(nonceKey)
        if (nonceExists) {
          res.status(409).json({ error: "Nonce already used" })
          return
        }
        await r.set(nonceKey, "1", "EX", PAIRING_NONCE_TTL_SECONDS)

        io.to(`tenant:${pairingData.tenantId}:hub`).emit("pairing:request", {
          code,
          tenantId: pairingData.tenantId,
          deviceId,
          deviceName,
          fingerprint,
          timestamp: new Date().toISOString(),
        })

        const spokeKey = `pairingSpoke:${pairingData.tenantId}:${deviceId}`
        await r.set(spokeKey, JSON.stringify({ code, nonce, deviceId, deviceName, fingerprint }), "EX", PAIRING_CODE_TTL_SECONDS)

        res.json({
          status: "pending",
          message: "Pairing request sent to hub",
        })
      } catch (err) {
        console.error("[pairing] spoke-claim error:", err)
        res.status(500).json({ error: "Internal server error" })
      }
    }
  )

  router.post(
    "/approve",
    validate(pairingApproveSchema),
    async (req, res) => {
      try {
        const auth = req.auth!
        const { code, deviceId, deviceSecret } = req.body
        const r = getRedis()

        const pairingKey = `pairing:${auth.tenantId}:${code}`
        const pairingData = await r.get(pairingKey)
        if (!pairingData) {
          res.status(404).json({
            error: "Invalid or expired pairing code",
            code: "invalid_code",
          })
          return
        }

        const parsed = JSON.parse(pairingData)
        if (parsed.hubId !== auth.sub) {
          res.status(403).json({ error: "Not your pairing code" })
          return
        }

        const deviceSecretKey = `${DEVICE_SECRET_KEY_PREFIX}${auth.tenantId}`
        await r.set(deviceSecretKey, deviceSecret)

        const spokeKey = `pairingSpoke:${auth.tenantId}:${deviceId}`
        const spokeData = await r.get(spokeKey)
        if (spokeData) {
          const spoke = JSON.parse(spokeData) as { deviceName: string }

          io.to(`tenant:${auth.tenantId}:spoke`).emit("pairing:approved", {
            tenantId: auth.tenantId,
            deviceId,
            deviceName: spoke.deviceName,
            hubId: auth.sub,
            timestamp: new Date().toISOString(),
          })
        }

        await r.del(pairingKey)
        await r.del(spokeKey)

        res.json({ status: "approved", deviceId })
      } catch (err) {
        console.error("[pairing] approve error:", err)
        res.status(500).json({ error: "Internal server error" })
      }
    }
  )

  return router
}

export async function getDeviceSecret(tenantId: string): Promise<string | null> {
  const r = getRedis()
  return r.get(`${DEVICE_SECRET_KEY_PREFIX}${tenantId}`)
}
