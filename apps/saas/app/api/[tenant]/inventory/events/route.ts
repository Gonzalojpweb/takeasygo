import { NextRequest, NextResponse } from "next/server"
import { connectDB } from "@/lib/mongoose"
import Tenant from "@/models/Tenant"
import { processInventoryEvent } from "@/lib/inventory"

// ============================================================================
// POST /api/[tenant]/inventory/events — Registrar evento de inventario
// FASE04 §4.1 — Flujo transaccional: insert ledger + update state
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
    const required = ["eventId", "skuId", "storageLocationId", "eventType", "occurredAt", "source", "confidence", "payload"]
    for (const field of required) {
      if (!body[field] && body[field] !== 0) {
        return NextResponse.json(
          { error: `Campo requerido: ${field}` },
          { status: 400 }
        )
      }
    }

    // ValidarEventType
    const validEventTypes = [
      "GoodsReceived", "SaleConsumed", "ProductionTransformed",
      "WasteRecorded", "PhysicalCountObserved", "AdjustmentApplied",
      "UnitEquivalenceLearned", "EvidenceRequested", "EvidenceIgnored",
      "ModelCalibrated",
    ]
    if (!validEventTypes.includes(body.eventType)) {
      return NextResponse.json(
        { error: `eventType inválido: ${body.eventType}` },
        { status: 400 }
      )
    }

    // Validar confidence range
    if (typeof body.confidence !== "number" || body.confidence < 0 || body.confidence > 1) {
      return NextResponse.json(
        { error: "confidence debe ser un número entre 0 y 1" },
        { status: 400 }
      )
    }

    // Gate duro: AdjustmentApplied solo admin/manager
    if (body.eventType === "AdjustmentApplied") {
      // TODO: Verificar rol del usuario autenticado
      // Por ahora, validamos que tenga reason descriptivo
      if (!body.payload?.reason || body.payload.reason.trim().length < 10) {
        return NextResponse.json(
          { error: "AdjustmentApplied requiere motivo descriptivo (mínimo 10 caracteres)" },
          { status: 400 }
        )
      }
    }

    const result = await processInventoryEvent({
      eventId: body.eventId,
      tenantId: tenant._id.toString(),
      skuId: body.skuId,
      storageLocationId: body.storageLocationId,
      eventType: body.eventType,
      eventVersion: body.eventVersion ?? 1,
      occurredAt: new Date(body.occurredAt),
      recordedAt: new Date(body.recordedAt ?? Date.now()),
      actorId: body.actorId,
      source: body.source,
      observationMethod: body.observationMethod,
      confidence: body.confidence,
      correlationId: body.correlationId,
      payload: body.payload,
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Error procesando evento" },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (error) {
    console.error("[inventory/events POST]", error)
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    )
  }
}
