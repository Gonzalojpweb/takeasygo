import { NextResponse } from "next/server"
import { connectDB } from "@/lib/mongoose"
import Tenant from "@/models/Tenant"
import { evaluateNudges, markNudgeTriggered } from "@/lib/nudge-engine"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Cron: nudge-evaluate
 * Runs every 6 hours to evaluate general nudge rules for all tenants.
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
        const nudges = await evaluateNudges(tenant._id.toString(), false)

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
