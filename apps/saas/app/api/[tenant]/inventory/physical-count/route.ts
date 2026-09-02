import { NextRequest, NextResponse } from "next/server"
import { connectDB } from "@/lib/mongoose"
import { TenantModel } from "@takeasygo/db"
import { capturePhysicalCount, getSKUsForVerification } from "@/lib/inventory"

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

    const tenant = await TenantModel.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 })
    }

    const body = await request.json()

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
      actorId: body.actorId,
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

    const tenant = await TenantModel.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 })
    }

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
