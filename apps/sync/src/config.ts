import { readFileSync } from "node:fs"
import { resolve } from "node:path"

declare const __dirname: string

function readPem(filename: string): string {
  const filepath = resolve(__dirname, "..", filename)
  return readFileSync(filepath, "utf-8").trim()
}

export const config = {
  port: parseInt(process.env.SYNC_PORT ?? "3001", 10),
  env: process.env.NODE_ENV ?? "development",

  mongoUri: process.env.MONGODB_URI ?? "",

  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",

  jwtPrivateKey: process.env.JWT_PRIVATE_KEY ?? readPem("keys.private.pem"),
  jwtPublicKey: process.env.JWT_PUBLIC_KEY ?? readPem("keys.public.pem"),

  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",

  internalApiSecret: process.env.INTERNAL_API_SECRET ?? "",
  saasBaseUrl: process.env.SAAS_BASE_URL ?? "http://localhost:3000",

  rateLimitToken: parseInt(process.env.RATE_LIMIT_TOKEN ?? "100", 10),
  rateLimitTenant: parseInt(process.env.RATE_LIMIT_TENANT ?? "1000", 10),
  rateLimitLogin: parseInt(process.env.RATE_LIMIT_LOGIN ?? "10", 10),

  pairingCodeTTL: parseInt(process.env.PAIRING_CODE_TTL ?? "300", 10),

  offlineTimeoutMs: parseInt(process.env.OFFLINE_TIMEOUT_MS ?? "180000", 10),

  eventMaxAgeDays: parseInt(process.env.EVENT_MAX_AGE_DAYS ?? "7", 10),
  eventMaxQueueSize: parseInt(process.env.EVENT_MAX_QUEUE_SIZE ?? "1000", 10),

  socketMaxConnectionsPerHub: parseInt(
    process.env.SOCKET_MAX_CONNECTIONS ?? "10",
    10
  ),
  socketHeartbeatInterval: parseInt(
    process.env.SOCKET_HEARTBEAT_INTERVAL ?? "30000",
    10
  ),
  socketHeartbeatTimeout: parseInt(
    process.env.SOCKET_HEARTBEAT_TIMEOUT ?? "90000",
    10
  ),
}
