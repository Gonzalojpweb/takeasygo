import { NextRequest, NextResponse } from "next/server"
import { connectDB } from "@/lib/mongoose"
import Tenant from "@/models/Tenant"
import { captureSaleConsumed } from "@/lib/inventory"
import { requireAuth, getSessionUser } from "@/lib/apiAuth"

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

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    // El actor se deriva SIEMPRE del token: nunca del body del request.
    const sessionUser = await getSessionUser(request)
    const actorId: string | undefined = sessionUser?.id ?? undefined

    const body = await request.json()

    // Validación (ObjectId estricto: evita CastError de Mongoose → 500)
    const isObjectId = (v: unknown): v is string =>
      typeof v === "string" && /^[a-fA-F0-9]{24}$/.test(v)

    if (!isObjectId(body.orderId) || !Array.isArray(body.items) || !isObjectId(body.storageLocationId)) {
      return NextResponse.json(
        { error: "Se requiere: orderId, items[], storageLocationId" },
        { status: 400 }
      )
    }

    if (body.items.length > 200) {
      return NextResponse.json({ error: "Máximo 200 items por venta" }, { status: 400 })
    }

    for (const item of body.items) {
      if (!isObjectId(item.productId) || typeof item.quantity !== "number" || item.quantity <= 0) {
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
      actorId
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
