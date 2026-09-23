import { NextResponse } from "next/server"
import { getActiveNudges, dismissNudge } from "@/lib/nudge-engine"
import { connectDB } from "@/lib/mongoose"

export const dynamic = "force-dynamic"

/**
 * GET: Get active nudges for the current tenant
 * POST: Dismiss a nudge
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tenant: string }> }
) {
  const { tenant: tenantSlug } = await params

  await connectDB()

  // Resolve tenant
  const { default: Tenant } = await import("@/models/Tenant")
  const tenantDoc = await Tenant.findOne({
    $or: [{ slug: tenantSlug }, { _id: tenantSlug }],
  })
    .select("_id")
    .lean()

  if (!tenantDoc) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
  }

  const nudges = await getActiveNudges(tenantDoc._id.toString())

  return NextResponse.json({ nudges })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenant: string }> }
) {
  const { tenant: tenantSlug } = await params
  const { nudgeId } = await request.json()

  if (!nudgeId) {
    return NextResponse.json({ error: "nudgeId is required" }, { status: 400 })
  }

  await connectDB()

  const { default: Tenant } = await import("@/models/Tenant")
  const tenantDoc = await Tenant.findOne({
    $or: [{ slug: tenantSlug }, { _id: tenantSlug }],
  })
    .select("_id")
    .lean()

  if (!tenantDoc) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
  }

  await dismissNudge(tenantDoc._id.toString(), nudgeId)

  return NextResponse.json({ success: true })
}
