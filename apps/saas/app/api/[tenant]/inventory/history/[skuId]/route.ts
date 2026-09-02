import { NextRequest, NextResponse } from "next/server"
import { connectDB } from "@/lib/mongoose"
import { TenantModel, InventoryLedgerModel } from "@takeasygo/db"

// ============================================================================
// GET /api/[tenant]/inventory/history/:skuId — Historial de eventos de un SKU
// FASE04 §3.5 — Read del ledger con filtros
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; skuId: string }> }
) {
  try {
    const { tenant: tenantSlug, skuId } = await params
    await connectDB()

    const tenant = await TenantModel.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const storageLocationId = searchParams.get("storageLocationId")
    const eventType = searchParams.get("eventType")
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200)
    const offset = parseInt(searchParams.get("offset") || "0", 10)

    const query: Record<string, unknown> = {
      tenantId: tenant._id,
      skuId,
    }
    if (storageLocationId) query.storageLocationId = storageLocationId
    if (eventType) query.eventType = eventType

    const [events, total] = await Promise.all([
      InventoryLedgerModel.find(query)
        .sort({ occurredAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),
      InventoryLedgerModel.countDocuments(query),
    ])

    return NextResponse.json({
      tenantId: tenant._id.toString(),
      skuId,
      events,
      pagination: {
        total,
        offset,
        limit,
        hasMore: offset + limit < total,
      },
    })
  } catch (error) {
    console.error("[inventory/history GET]", error)
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    )
  }
}
