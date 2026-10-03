import { NextResponse } from "next/server"
import mongoose from "mongoose"
import { getActiveNudges, dismissNudge } from "@/lib/nudge-engine"
import { connectDB } from "@/lib/mongoose"

export const dynamic = "force-dynamic"

/**
 * `tenantSlug` puede venir como slug (`kekelarry`) o como ObjectId. La rama
 * `_id` solo se arma si es un ObjectId válido: meter un slug en `_id` hace
 * que Mongoose lance CastError y la ruta reviente con 500 sin body.
 */
function tenantFilter(tenantSlug: string) {
  return mongoose.isValidObjectId(tenantSlug)
    ? { $or: [{ slug: tenantSlug }, { _id: tenantSlug }] }
    : { slug: tenantSlug }
}

/**
 * GET: Get active nudges for the current tenant
 * POST: Dismiss a nudge
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params

    await connectDB()

    const { default: Tenant } = await import("@/models/Tenant")
    const tenantDoc = await Tenant.findOne(tenantFilter(tenantSlug))
      .select("_id")
      .lean()

    if (!tenantDoc) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
    }

    const nudges = await getActiveNudges(tenantDoc._id.toString())

    return NextResponse.json({ nudges })
  } catch (error) {
    console.error("[nudges/active] GET error:", error)
    return NextResponse.json({ error: "Error al obtener nudges" }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    const { nudgeId } = await request.json()

    if (!nudgeId) {
      return NextResponse.json({ error: "nudgeId is required" }, { status: 400 })
    }

    await connectDB()

    const { default: Tenant } = await import("@/models/Tenant")
    const tenantDoc = await Tenant.findOne(tenantFilter(tenantSlug))
      .select("_id")
      .lean()

    if (!tenantDoc) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
    }

    await dismissNudge(tenantDoc._id.toString(), nudgeId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[nudges/active] POST error:", error)
    return NextResponse.json({ error: "Error al procesar nudge" }, { status: 500 })
  }
}
