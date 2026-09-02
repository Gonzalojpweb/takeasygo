import type { Request, Response, NextFunction } from "express"
import { config } from "../config"

const tokenBuckets = new Map<string, { count: number; resetAt: number }>()
const tenantBuckets = new Map<string, { count: number; resetAt: number }>()

const CLEANUP_INTERVAL = 5 * 60 * 1000 // every 5 minutes

function cleanupBuckets(buckets: Map<string, { count: number; resetAt: number }>): number {
  const now = Date.now()
  let cleaned = 0
  for (const [key, bucket] of buckets.entries()) {
    if (now > bucket.resetAt) {
      buckets.delete(key)
      cleaned++
    }
  }
  return cleaned
}

// Periodic cleanup to prevent memory leak from expired entries
setInterval(() => {
  const t = cleanupBuckets(tokenBuckets)
  const tn = cleanupBuckets(tenantBuckets)
  if (t + tn > 0) {
    console.log(`[rateLimit] Cleaned ${t} token + ${tn} tenant expired entries. Sizes: token=${tokenBuckets.size} tenant=${tenantBuckets.size}`)
  }
}, CLEANUP_INTERVAL)

function checkBucket(
  buckets: Map<string, { count: number; resetAt: number }>,
  key: string,
  limit: number,
  windowMs: number
): boolean {
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (bucket.count >= limit) return false
  bucket.count++
  return true
}

export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  const token =
    (req.headers.authorization?.slice(7) ?? "") || (req.ip ?? "unknown")
  const tenantId = req.auth?.tenantId ?? "unknown"

  if (!checkBucket(tokenBuckets, token, config.rateLimitToken, 60_000)) {
    res.status(429).json({ error: "Rate limit exceeded", code: "rate_limited" })
    return
  }

  if (!checkBucket(tenantBuckets, tenantId, config.rateLimitTenant, 60_000)) {
    res.status(429).json({ error: "Tenant rate limit exceeded", code: "rate_limited" })
    return
  }

  next()
}
