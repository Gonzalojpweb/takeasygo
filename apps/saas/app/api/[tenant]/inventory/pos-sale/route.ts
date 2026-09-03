import { NextRequest, NextResponse } from "next/server"
import { connectDB } from "@/lib/mongoose"
import Tenant from "@/models/Tenant"
import { captureSaleConsumed } from "@/lib/inventory"

// ============================================================================
// POST /api/[tenant]/inventory/pos-sale — Capturar venta POS → SaleConsumed
// FASE04 §4.1, Roadmap §6 Etapa 5
//
// Recibe una venta cerrada del POS y genera eventos SaleConsumed
// por cada ingrediente de las recetas asociadas.
// ============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 })
    }

    const body = await request.json()

    // Validación
    if (!body.orderId || !Array.isArray(body.items) || !body.storageLocationId) {
      return NextResponse.json(
        { error: "Se requiere: orderId, items[], storageLocationId" },
        { status: 400 }
      )
    }

    for (const item of body.items) {
      if (!item.productId || !item.quantity || item.quantity <= 0) {
        return NextResponse.json(
          { error: "Cada item debe tener productId y quantity > 0" },
          { status: 400 }
        )
      }
    }

    const result = await captureSaleConsumed(
      tenant._id.toString(),
      body.orderId,
      body.items,
      body.storageLocationId,
      body.actorId
    )

    return NextResponse.json({
      success: result.success,
      eventsCreated: result.eventsCreated,
      errors: result.errors,
    }, {
      status: result.success ? 201 : 207, // 207 Multi-Status si hay errores parciales
    })
  } catch (error) {
    console.error("[inventory/pos-sale POST]", error)
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    )
  }
}
