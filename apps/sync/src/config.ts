import { readFileSync } from "node:fs"
import { resolve } from "node:path"

declare const __dirname: string

function readPem(filename: string): string {
  const filepath = resolve(__dirname, "..", filename)
  return readFileSync(filepath, "utf-8").trim()
}

function validatePem(value: string, label: string): string {
  if (!value.includes("-----BEGIN ") || !value.includes("-----END ")) {
    throw new Error(
      `${label} no es una clave PEM válida. ` +
      `Debe contener -----BEGIN ... KEY----- y -----END ... KEY-----. ` +
      `Valor actual (primeros 40 chars): "${value.slice(0, 40)}..."`
    )
  }
  return value
}

export const config = {
  port: parseInt(process.env.SYNC_PORT ?? "3001", 10),
  env: process.env.NODE_ENV ?? "development",

  mongoUri: process.env.MONGODB_URI ?? "",

  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",

  jwtPrivateKey: validatePem(
    (process.env.JWT_PRIVATE_KEY ?? readPem("keys.private.pem")).replace(/\\n/g, "\n"),
    "JWT_PRIVATE_KEY"
  ),
  jwtPublicKey: validatePem(
    (process.env.JWT_PUBLIC_KEY ?? readPem("keys.public.pem")).replace(/\\n/g, "\n"),
    "JWT_PUBLIC_KEY"
  ),

  corsOrigin: (() => {
    const origins = (process.env.CORS_ORIGIN ?? "http://localhost:5173")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean)
    console.log(`[config] CORS_ORIGIN loaded: ${JSON.stringify(origins)}`)
    return origins
  })(),

  internalApiSecret: (() => {
    const val = process.env.INTERNAL_API_SECRET ?? ""
    console.log(`[config] INTERNAL_API_SECRET loaded: length=${val.length}, first4="${val.slice(0, 4)}", last4="${val.slice(-4)}"`)
    return val
  })(),
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
