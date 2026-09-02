export interface Conflict {
  eventId: string
  tenantId: string
  type: string
  description: string
  timestamp: string
  resolved: boolean
  resolvedAt?: string
  resolvedBy?: string
}

interface ConflictEntry {
  conflict: Conflict
  createdAtMs: number
}

const conflictStore = new Map<string, ConflictEntry[]>()

const CONFLICT_TTL = 5 * 60 * 1000 // 5 minutes
const CLEANUP_INTERVAL = 2 * 60 * 1000 // every 2 minutes

function isExpired(entry: ConflictEntry): boolean {
  return Date.now() - entry.createdAtMs > CONFLICT_TTL
}

// Periodic cleanup of expired conflicts
setInterval(() => {
  let expired = 0
  for (const [key, entries] of conflictStore.entries()) {
    const before = entries.length
    const filtered = entries.filter((e) => !isExpired(e))
    expired += before - filtered.length
    if (filtered.length === 0) {
      conflictStore.delete(key)
    } else {
      conflictStore.set(key, filtered)
    }
  }
  if (expired > 0) {
    console.log(`[ConflictResolver] Expired ${expired} conflicts. Store size: ${conflictStore.size}`)
  }
}, CLEANUP_INTERVAL)

export function registerConflict(
  tenantId: string,
  conflict: Omit<Conflict, "resolved" | "resolvedAt" | "resolvedBy">
): void {
  const key = `tenant:${tenantId}`
  const list = conflictStore.get(key) ?? []
  list.push({ conflict: { ...conflict, resolved: false }, createdAtMs: Date.now() })
  conflictStore.set(key, list)
}

export function getTenantConflicts(
  tenantId: string
): Conflict[] {
  const entries = conflictStore.get(`tenant:${tenantId}`) ?? []
  // Filter out expired conflicts on read
  const now = Date.now()
  const valid = entries.filter((e) => now - e.createdAtMs <= CONFLICT_TTL)
  if (valid.length < entries.length) {
    conflictStore.set(`tenant:${tenantId}`, valid)
  }
  return valid.map((e) => e.conflict)
}

export function resolveConflict(
  tenantId: string,
  eventId: string,
  resolvedBy: string
): boolean {
  const key = `tenant:${tenantId}`
  const entries = conflictStore.get(key)
  if (!entries) return false

  const entry = entries.find((e) => e.conflict.eventId === eventId && !e.conflict.resolved)
  if (!entry) return false

  // Expired — remove it
  if (isExpired(entry)) {
    conflictStore.set(key, entries.filter((e) => e !== entry))
    return false
  }

  entry.conflict.resolved = true
  entry.conflict.resolvedAt = new Date().toISOString()
  entry.conflict.resolvedBy = resolvedBy
  return true
}
