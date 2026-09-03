import { NextRequest, NextResponse } from "next/server"
import { connectDB } from "@/lib/mongoose"
import Tenant from "@/models/Tenant"
import { captureGoodsReceived } from "@/lib/inventory"

// ============================================================================
// POST /api/[tenant]/inventory/goods-received — Recepción de mercadería
// FASE04 §4.1, Roadmap §6 Etapa 6
//
// Form simple: SKU + cantidad + unidad + costo + proveedor (opcional)
// Soporte OCR: confidence < 1.0 si viene de factura escaneada
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

    // Validación de campos requeridos
    const required = ["skuId", "storageLocationId", "quantity", "unit", "unitCostCents"]
    for (const field of required) {
      if (body[field] === undefined || body[field] === null) {
        return NextResponse.json(
          { error: `Campo requerido: ${field}` },
          { status: 400 }
        )
      }
    }

    // Validaciones de negocio
    if (typeof body.quantity !== "number" || body.quantity <= 0) {
      return NextResponse.json(
        { error: "quantity debe ser un número mayor a 0" },
        { status: 400 }
      )
    }

    if (typeof body.unitCostCents !== "number" || body.unitCostCents < 0) {
      return NextResponse.json(
        { error: "unitCostCents debe ser un número >= 0" },
        { status: 400 }
      )
    }

    // Validar unidad
    const validUnits = ["kg", "g", "l", "ml", "unit", "caja", "cajón", "paquete", "docena", "unidad"]
    if (!validUnits.includes(body.unit)) {
      return NextResponse.json(
        { error: `Unidad inválida: ${body.unit}. Válidas: ${validUnits.join(", ")}` },
        { status: 400 }
      )
    }

    // Umbral económico: si el monto total supera un umbral, sugerir verificación
    const totalCostCents = body.quantity * body.unitCostCents
    const HIGH_VALUE_THRESHOLD = 5000000 // $50.000 en centavos
    const requiresVerification = totalCostCents > HIGH_VALUE_THRESHOLD

    const result = await captureGoodsReceived({
      tenantId: tenant._id.toString(),
      skuId: body.skuId,
      storageLocationId: body.storageLocationId,
      quantity: body.quantity,
      unit: body.unit,
      unitCostCents: body.unitCostCents,
      supplierId: body.supplierId,
      invoiceRef: body.invoiceRef,
      notes: body.notes,
      actorId: body.actorId,
      confidence: body.confidence,
      observationMethod: body.observationMethod,
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      eventId: result.eventId,
      conversion: result.conversion,
      meta: {
        requiresVerification,
        totalCostCents,
        totalCostFormatted: `$${(totalCostCents / 100).toFixed(2)}`,
      },
    }, { status: 201 })
  } catch (error) {
    console.error("[inventory/goods-received POST]", error)
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    )
  }
}
