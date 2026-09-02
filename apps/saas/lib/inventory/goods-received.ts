import { InventorySKUModel, InventoryUnitEquivalenceModel } from "@takeasygo/db"
import { processInventoryEvent } from "./projector"
import { connectDB } from "../mongoose"

// ============================================================================
// Goods Received Capture — Recepción de mercadería
// FASE04 §4.1, Roadmap §6 Etapa 6
//
// Flujo:
// 1. Recibe datos de recepción (SKU, cantidad, unidad, costo)
// 2. Si la unidad no es la canónica, busca/convierte equivalencia
// 3. Genera evento GoodsReceived en el ledger
// 4. El State Projector actualiza μ y σ
// ============================================================================

interface GoodsReceivedInput {
  tenantId: string
  skuId: string
  storageLocationId: string
  quantity: number
  unit: string
  /** @storedAs cents */
  unitCostCents: number
  supplierId?: string
  invoiceRef?: string
  notes?: string
  actorId?: string
  /** Confianza de la fuente (0-1). Default: 0.95 para recepción directa. */
  confidence?: number
  /** Método de observación si aplica */
  observationMethod?: "connected_scale" | "manual_scale" | "visual_count" | "estimation"
}

interface ConversionResult {
  convertedQuantity: number
  canonicalUnit: string
  factor: number
  confidence: number
}

/**
 * Convierte una cantidad de una unidad a la unidad canónica del SKU.
 * Si la unidad ya es canónica, retorna sin conversión.
 * Si existe una equivalencia aprendida, la usa.
 * Si no, usa el factor declarado.
 */
async function convertToCanonical(
  tenantId: string,
  skuId: string,
  quantity: number,
  fromUnit: string
): Promise<ConversionResult> {
  const sku = await InventorySKUModel.findById(skuId)
  if (!sku) throw new Error(`SKU no encontrado: ${skuId}`)

  // Si ya es la unidad canónica
  if (fromUnit === sku.canonicalUnit) {
    return {
      convertedQuantity: quantity,
      canonicalUnit: sku.canonicalUnit,
      factor: 1,
      confidence: 1,
    }
  }

  // Buscar equivalencia aprendida
  const equivalence = await InventoryUnitEquivalenceModel.findOne({
    tenantId,
    skuId,
    fromUnit,
    toUnit: sku.canonicalUnit,
    isActive: true,
  })

  if (equivalence) {
    // Usar factor observado si tiene suficiente confianza, sino el declarado
    const factor = equivalence.observedConfidence > 0.7 && equivalence.observedFactor
      ? equivalence.observedFactor
      : equivalence.declaredFactor

    return {
      convertedQuantity: quantity * factor,
      canonicalUnit: sku.canonicalUnit,
      factor,
      confidence: equivalence.observedConfidence,
    }
  }

  // Sin equivalencia conocida — registrar con confianza baja
  // y crear la equivalencia para que el sistema la aprenda
  return {
    convertedQuantity: quantity, // Asume 1:1 (incorrecto pero registra la evidencia)
    canonicalUnit: sku.canonicalUnit,
    factor: 1,
    confidence: 0.3,
  }
}

/**
 * Registra una recepción de mercadería.
 * Convierte unidades si es necesario y genera evento GoodsReceived.
 */
export async function captureGoodsReceived(
  input: GoodsReceivedInput
): Promise<{ success: boolean; eventId?: string; error?: string; conversion?: ConversionResult }> {
  await connectDB()

  try {
    // 1. Convertir a unidad canónica si es necesario
    const conversion = await convertToCanonical(
      input.tenantId,
      input.skuId,
      input.quantity,
      input.unit
    )

    // 2. Generar eventId único
    const eventId = `gr-${input.skuId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    // 3. Calcular confianza final (combina fuente + conversión)
    const finalConfidence = Math.min(
      input.confidence ?? 0.95,
      conversion.confidence
    )

    // 4. Registrar evento
    const result = await processInventoryEvent({
      eventId,
      tenantId: input.tenantId,
      skuId: input.skuId,
      storageLocationId: input.storageLocationId,
      eventType: "GoodsReceived",
      occurredAt: new Date(),
      recordedAt: new Date(),
      actorId: input.actorId,
      source: "manual",
      observationMethod: input.observationMethod,
      confidence: finalConfidence,
      payload: {
        quantity: conversion.convertedQuantity,
        unit: conversion.canonicalUnit as any,
        unitCostCents: input.unitCostCents,
        supplierId: input.supplierId,
        invoiceRef: input.invoiceRef,
        notes: input.notes,
      },
    })

    // 5. Si la conversión fue incierta, registrar equivalencia aprendida
    if (conversion.confidence < 0.7 && input.unit !== conversion.canonicalUnit) {
      await InventoryUnitEquivalenceModel.findOneAndUpdate(
        {
          tenantId: input.tenantId,
          skuId: input.skuId,
          fromUnit: input.unit,
          toUnit: conversion.canonicalUnit,
        },
        {
          $setOnInsert: {
            tenantId: input.tenantId,
            skuId: input.skuId,
            fromUnit: input.unit,
            toUnit: conversion.canonicalUnit,
            declaredFactor: conversion.factor,
            isActive: true,
          },
          $inc: { observationsCount: 1 },
          $set: {
            observedFactor: conversion.factor,
            observedConfidence: Math.min(conversion.confidence + 0.1, 1),
          },
        },
        { upsert: true }
      )
    }

    return {
      success: result.success,
      eventId,
      error: result.error,
      conversion,
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    }
  }
}
