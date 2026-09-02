import { NextRequest, NextResponse } from "next/server"
import { connectDB } from "@/lib/mongoose"
import { TenantModel, InventoryStateModel, InventorySKUModel, InventoryStorageLocationModel } from "@takeasygo/db"

// ============================================================================
// GET /api/[tenant]/inventory/state/:skuId — Estado de inventario de un SKU
// FASE04 §3.6 — Read path del estado proyectado
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

    const query: Record<string, unknown> = {
      tenantId: tenant._id,
      skuId,
    }
    if (storageLocationId) {
      query.storageLocationId = storageLocationId
    }

    const states = await InventoryStateModel.find(query)
      .populate("skuId", "name skuCode category canonicalUnit lastUnitCostCents businessImpact")
      .populate("storageLocationId", "name type")

    return NextResponse.json({
      tenantId: tenant._id.toString(),
      skuId,
      states,
    })
  } catch (error) {
    console.error("[inventory/state GET]", error)
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    )
  }
}
