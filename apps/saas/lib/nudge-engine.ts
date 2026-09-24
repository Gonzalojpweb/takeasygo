/**
 * Nudge Engine — evaluates nudge rules against tenant data.
 *
 * Each rule has a condition (checkType) that is evaluated against the tenant's
 * current state. If the condition is met and the frequency allows triggering,
 * the nudge is included in the result set.
 */

import { connectDB } from "@/lib/mongoose"
import Tenant from "@/models/Tenant"
import Location from "@/models/Location"
import { getFeatureUsageStats } from "@/lib/feature-usage"
import { NudgeRuleModel, DEFAULT_NUDGE_RULES, type INudgeRuleDocument, type INudgeCondition } from "@takeasygo/db/models/nudge-rule"
import type { Types } from "mongoose"

export interface TriggeredNudge {
  _id: string
  slug: string
  type: string
  title: string
  description: string
  icon: string
  ctaLabel?: string
  ctaHref?: string
  channel: string
  triggeredAt: Date
}

interface LeanTenant {
  _id: Types.ObjectId
  plan?: string
  features?: Record<string, { enabled?: boolean } | undefined> & {
    reservations?: boolean
    hiddenRewards?: { enabled?: boolean }
  }
  loyalty?: { enabled?: boolean }
  transferAccounts?: Array<{ updatedAt?: Date | string }>
  recommendedDishes?: unknown[]
}

interface LeanLocation {
  timezone?: string
  serviceHours?: Record<string, unknown[]>
  settings?: Record<string, unknown>
  [field: string]: unknown
}

/**
 * Evaluate all active nudge rules for a tenant and return triggered nudges.
 * @param tenantId - The tenant to evaluate for
 * @param timeSensitiveOnly - If true, only evaluate time-sensitive rules
 */
export async function evaluateNudges(
  tenantId: string,
  timeSensitiveOnly = false
): Promise<TriggeredNudge[]> {
  await connectDB()

  const tenant = await Tenant.findById(tenantId).lean<LeanTenant>()
  if (!tenant) return []

  // Get location for the tenant (first active location)
  const location = await Location.findOne({ tenantId: tenant._id, isActive: true })
    .select("settings serviceHours timezone")
    .lean<LeanLocation>()

  // Lazily seed global default rules if none exist yet (DEFAULT_NUDGE_RULES is code-only)
  const globalCount = await NudgeRuleModel.countDocuments({ tenantId: null })
  if (globalCount === 0) {
    await NudgeRuleModel.insertMany(
      DEFAULT_NUDGE_RULES.map((r) => ({ ...r, tenantId: null }))
    )
  }

  // Get tenant-level nudges + global platform nudges
  const rules = await NudgeRuleModel.find({
    $or: [
      { tenantId: tenant._id, active: true },
      { tenantId: null, active: true },
    ],
    timeSensitive: timeSensitiveOnly,
  }).lean()

  const triggered: TriggeredNudge[] = []

  for (const rule of rules) {
    if (rule.planRequired && tenant.plan !== rule.planRequired) continue

    const shouldTrigger = await evaluateCondition(rule.condition, tenant, location)
    if (!shouldTrigger) continue

    // Check frequency
    if (!checkFrequency(rule)) continue

    triggered.push({
      _id: rule._id.toString(),
      slug: rule.slug,
      type: rule.type,
      title: rule.content.title,
      description: rule.content.description,
      icon: rule.content.icon,
      ctaLabel: rule.content.ctaLabel,
      ctaHref: rule.content.ctaHref,
      channel: rule.channel,
      triggeredAt: new Date(),
    })
  }

  return triggered
}

/**
 * Mark a nudge as triggered (updates lastTriggeredAt).
 */
export async function markNudgeTriggered(nudgeId: string): Promise<void> {
  await NudgeRuleModel.updateOne(
    { _id: nudgeId },
    { $set: { lastTriggeredAt: new Date() } }
  )
}

/**
 * Dismiss a nudge for a tenant (stores in a simple collection).
 */
export async function dismissNudge(tenantId: string, nudgeId: string): Promise<void> {
  const db = (await import("mongoose")).default.connection.db!
  await db.collection("nudge_dismissals").updateOne(
    { tenantId, nudgeId },
    { $setOnInsert: { tenantId, nudgeId, createdAt: new Date() } },
    { upsert: true }
  )
}

/**
 * Get active (non-dismissed) nudges for a tenant.
 */
export async function getActiveNudges(tenantId: string): Promise<TriggeredNudge[]> {
  const allNudges = await evaluateNudges(tenantId, false)

  const db = (await import("mongoose")).default.connection.db!
  const dismissals = await db
    .collection("nudge_dismissals")
    .find({ tenantId })
    .toArray()

  const dismissedIds = new Set(dismissals.map((d) => d.nudgeId.toString()))
  return allNudges.filter((n) => !dismissedIds.has(n._id))
}

// ── Condition evaluators ─────────────────────────────────────────────────────

async function evaluateCondition(
  condition: INudgeCondition,
  tenant: LeanTenant,
  location: LeanLocation | null
): Promise<boolean> {
  switch (condition.checkType) {
    case "field_missing":
      return evaluateFieldMissing(condition, location)
    case "field_empty":
      return evaluateFieldEmpty(condition, location)
    case "no_activity_days":
      return evaluateNoActivity(condition, tenant)
    case "day_of_week_hour":
      return evaluateDayOfWeekHour(condition, location)
    case "feature_unused":
      return evaluateFeatureUnused(condition, tenant)
    case "feature_not_configured":
      return evaluateFeatureNotConfigured(condition, tenant, location)
    default:
      return false
  }
}

function evaluateFieldMissing(condition: INudgeCondition, location: LeanLocation | null): boolean {
  if (!condition.targetField) return false
  // Check at location level first, then tenant level
  const value = location?.[condition.targetField] ?? location?.settings?.[condition.targetField]
  return value === undefined || value === null
}

function evaluateFieldEmpty(condition: INudgeCondition, location: LeanLocation | null): boolean {
  if (!condition.targetField) return false
  const value = location?.[condition.targetField] ?? location?.settings?.[condition.targetField]
  if (value === undefined || value === null) return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === "object") return Object.keys(value).length === 0
  return false
}

async function evaluateNoActivity(
  condition: INudgeCondition,
  tenant: LeanTenant
): Promise<boolean> {
  const thresholdDays = condition.thresholdDays ?? 30
  const cutoff = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000)

  if (condition.targetField === "transferAccounts") {
    // Check if any transfer account was recently updated
    const accounts = tenant.transferAccounts || []
    if (accounts.length === 0) return true
    const lastUpdate = accounts.reduce((latest, a) => {
      const updated = a.updatedAt ? new Date(a.updatedAt) : new Date(0)
      return updated > latest ? updated : latest
    }, new Date(0))
    return lastUpdate < cutoff
  }

  return false
}

function evaluateDayOfWeekHour(condition: INudgeCondition, location: LeanLocation | null): boolean {
  if (condition.dayOfWeek === undefined || condition.hourOfDay === undefined) return false

  const timezone = location?.timezone || "America/Argentina/Buenos_Aires"
  const now = new Date()
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "numeric",
    hour12: false,
  })
  const parts = formatter.formatToParts(now)
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

  const dayStr = parts.find((p) => p.type === "weekday")?.value ?? ""
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0"

  const currentDay = dayMap[dayStr] ?? -1
  const currentHour = parseInt(hourStr) || 0

  return currentDay === condition.dayOfWeek && currentHour === condition.hourOfDay
}

async function evaluateFeatureUnused(
  condition: INudgeCondition,
  tenant: LeanTenant
): Promise<boolean> {
  if (!condition.featureKey) return false
  const thresholdDays = condition.thresholdDays ?? 14
  const cutoff = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000)

  // Check if the feature is enabled but hasn't been used recently
  const featureEnabled =
    condition.featureKey === "club"
      ? tenant.loyalty?.enabled
      : tenant.features?.[condition.featureKey]?.enabled
  if (!featureEnabled) return false

  const usage = await getFeatureUsageStats(tenant._id)
  const stat = usage[condition.featureKey]
  if (!stat?.used) return true

  return stat.lastUsedAt ? stat.lastUsedAt < cutoff : true
}

function evaluateFeatureNotConfigured(
  condition: INudgeCondition,
  tenant: LeanTenant,
  location: LeanLocation | null
): boolean {
  if (!condition.featureKey) return false

  switch (condition.featureKey) {
    case "serviceHours":
      return !location?.serviceHours ||
        Object.values(location.serviceHours).every(
          (arr) => !arr || (Array.isArray(arr) && arr.length === 0)
        )
    case "recommendedDishes":
      return !tenant.recommendedDishes || tenant.recommendedDishes.length === 0
    case "hiddenRewards":
      return !tenant.features?.hiddenRewards?.enabled
    case "club":
      return !tenant.loyalty?.enabled
    default:
      return false
  }
}

// ── Frequency checker ────────────────────────────────────────────────────────

function checkFrequency(rule: INudgeRuleDocument): boolean {
  if (!rule.lastTriggeredAt) return true

  const now = new Date()
  const lastTriggered = new Date(rule.lastTriggeredAt)
  const hoursSince = (now.getTime() - lastTriggered.getTime()) / (1000 * 60 * 60)

  switch (rule.frequency) {
    case "once":
      return false // Already triggered once, never again
    case "daily":
      return hoursSince >= 24
    case "weekly":
      return hoursSince >= 168 // 7 days
    case "cooldown_days": {
      const cooldownHours = (rule.frequencyValue ?? 7) * 24
      return hoursSince >= cooldownHours
    }
    default:
      return true
  }
}
