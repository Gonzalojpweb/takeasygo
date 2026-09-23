import { NextResponse } from "next/server"
import { connectDB } from "@/lib/mongoose"
import Tenant from "@/models/Tenant"
import { evaluateNudges, markNudgeTriggered } from "@/lib/nudge-engine"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Cron: nudge-time-sensitive
 * Runs every hour. Only evaluates time-sensitive nudges (e.g., weekend briefing).
 * For nudges triggered by dayOfWeek + hourOfDay conditions, the cron window
 * must overlap the target hour (Fri 7-9am).
 * Triggered nudges are stored so the restaurant admin sees them in NudgeFeed.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  await connectDB()
  const results = { tenantsProcessed: 0, nudgesTriggered: 0, errors: 0 }

  try {
    const tenants = await Tenant.find({}).select("_id").lean()

    for (const tenant of tenants) {
      try {
        const nudges = await evaluateNudges(tenant._id.toString(), true)

        for (const nudge of nudges) {
          await markNudgeTriggered(nudge._id)
          results.nudgesTriggered++
        }

        results.tenantsProcessed++
      } catch {
        results.errors++
      }
    }
  } catch {
    results.errors++
  }

  return NextResponse.json(results)
}
