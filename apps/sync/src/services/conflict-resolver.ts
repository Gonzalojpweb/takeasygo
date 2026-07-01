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

const conflictStore = new Map<string, Conflict[]>()

export function registerConflict(
  tenantId: string,
  conflict: Omit<Conflict, "resolved" | "resolvedAt" | "resolvedBy">
): void {
  const key = `tenant:${tenantId}`
  const list = conflictStore.get(key) ?? []
  list.push({ ...conflict, resolved: false })
  conflictStore.set(key, list)
}

export function getTenantConflicts(
  tenantId: string
): Conflict[] {
  return conflictStore.get(`tenant:${tenantId}`) ?? []
}

export function resolveConflict(
  tenantId: string,
  eventId: string,
  resolvedBy: string
): boolean {
  const key = `tenant:${tenantId}`
  const list = conflictStore.get(key)
  if (!list) return false

  const conflict = list.find((c) => c.eventId === eventId && !c.resolved)
  if (!conflict) return false

  conflict.resolved = true
  conflict.resolvedAt = new Date().toISOString()
  conflict.resolvedBy = resolvedBy
  return true
}
