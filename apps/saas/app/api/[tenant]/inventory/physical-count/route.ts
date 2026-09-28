import { NextRequest, NextResponse } from "next/server"
import { connectDB } from "@/lib/mongoose"
import Tenant from "@/models/Tenant"
import { capturePhysicalCount, getSKUsForVerification } from "@/lib/inventory"
import { requireAuth, getSessionUser } from "@/lib/apiAuth"

// ============================================================================
// POST /api/[tenant]/inventory/physical-count — Registrar conteo físico
// FASE04 §3.5, Roadmap §6 Etapa 7
//
// Tres patrones de micro-interacción (~30 segundos):
// 1. Check binario (~10s)
// 2. Balanza conectada (~5s)
// 3. OCR en recepción (~15s)
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
    if (
      (typeof body.skuId !== "string" || !/^[a-fA-F0-9]{24}$/.test(body.skuId)) ||
      (typeof body.storageLocationId !== "string" || !/^[a-fA-F0-9]{24}$/.test(body.storageLocationId))
    ) {
      return NextResponse.json({ error: "skuId y storageLocationId deben ser ObjectIds válidos" }, { status: 400 })
    }

    // Validación
    const required = ["skuId", "storageLocationId", "observedQuantity", "unit", "observationMethod"]
    for (const field of required) {
      if (body[field] === undefined || body[field] === null) {
        return NextResponse.json(
          { error: `Campo requerido: ${field}` },
          { status: 400 }
        )
      }
    }

    if (typeof body.observedQuantity !== "number" || body.observedQuantity < 0) {
      return NextResponse.json(
        { error: "observedQuantity debe ser un número >= 0" },
        { status: 400 }
      )
    }

    const validMethods = ["connected_scale", "manual_scale", "visual_count", "estimation"]
    if (!validMethods.includes(body.observationMethod)) {
      return NextResponse.json(
        { error: `observationMethod inválido. Válidos: ${validMethods.join(", ")}` },
        { status: 400 }
      )
    }

    const result = await capturePhysicalCount({
      tenantId: tenant._id.toString(),
      skuId: body.skuId,
      storageLocationId: body.storageLocationId,
      observedQuantity: body.observedQuantity,
      unit: body.unit,
      observationMethod: body.observationMethod,
      actorId,
      notes: body.notes,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      eventId: result.eventId,
      previousEstimate: result.previousEstimate,
      difference: result.difference,
      uncertaintyReduction: result.uncertaintyReduction,
      feedback: result.difference !== undefined
        ? result.difference === 0
          ? "Inventario confirmado — sin desviación"
          : `Desviación detectada: ${result.difference > 0 ? "+" : ""}${result.difference.toFixed(2)} unidades`
        : undefined,
    }, { status: 201 })
  } catch (error) {
    console.error("[inventory/physical-count POST]", error)
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    )
  }
}

// ============================================================================
// GET /api/[tenant]/inventory/physical-count — SKUs para verificación
// Retorna los SKUs priorizados por EER para verificación selectiva
// ============================================================================

export async function GET(
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

    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get("limit") || "8", 10), 20)

    const skus = await getSKUsForVerification(tenant._id.toString(), limit)

    return NextResponse.json({
      tenantId: tenant._id.toString(),
      skus,
      meta: {
        count: skus.length,
        message: "Verificá estos ingredientes para reducir la incertidumbre",
      },
    })
  } catch (error) {
    console.error("[inventory/physical-count GET]", error)
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    )
  }
}
