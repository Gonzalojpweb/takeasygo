import { InventoryStateModel } from "@takeasygo/db"
import { processInventoryEvent } from "./projector"
import { connectDB } from "../mongoose"

// ============================================================================
// Physical Count — Conteo físico y verificaciones
// FASE04 §3.5, Roadmap §6 Etapa 7
//
// Tres patrones de micro-interacción (~30 segundos):
// 1. Check binario (~10s): foto/estimación visual + [SÍ]/[NO]
// 2. Balanza conectada (~5s): peso automático, confianza máxima
// 3. OCR en recepción (~15s): foto de factura, resalta desviaciones
// ============================================================================

interface PhysicalCountInput {
  tenantId: string
  skuId: string
  storageLocationId: string
  observedQuantity: number
  unit: string
  observationMethod: "connected_scale" | "manual_scale" | "visual_count" | "estimation"
  actorId?: string
  notes?: string
}

/**
 * Registra un conteo físico y actualiza el estado del inventario.
 * El State Projector ajusta μ y σ según el método de observación.
 */
export async function capturePhysicalCount(
  input: PhysicalCountInput
): Promise<{
  success: boolean
  eventId?: string
  previousEstimate?: { mu: number; sigma: number }
  difference?: number
  uncertaintyReduction?: number
  error?: string
}> {
  await connectDB()

  try {
    // 1. Obtener estado actual
    const state = await InventoryStateModel.findOne({
      tenantId: input.tenantId,
      skuId: input.skuId,
      storageLocationId: input.storageLocationId,
    })

    const previousMu = state?.estimateMu ?? 0
    const previousSigma = state?.estimateSigma ?? 0

    // 2. Calcular diferencia
    const difference = input.observedQuantity - previousMu

    // 3. Generar evento PhysicalCountObserved
    const eventId = `pc-${input.skuId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    const result = await processInventoryEvent({
      eventId,
      tenantId: input.tenantId,
      skuId: input.skuId,
      storageLocationId: input.storageLocationId,
      eventType: "PhysicalCountObserved",
      occurredAt: new Date(),
      recordedAt: new Date(),
      actorId: input.actorId,
      source: "manual",
      observationMethod: input.observationMethod,
      confidence: getConfidenceForMethod(input.observationMethod),
      payload: {
        observedQuantity: input.observedQuantity,
        unit: input.unit as any,
        previousEstimateMu: previousMu,
        previousEstimateSigma: previousSigma,
        difference,
      },
    })

    // 4. Calcular reducción de incertidumbre
    const uncertaintyReduction = previousSigma > 0
      ? ((previousSigma - (input.observedQuantity * getSigmaFactor(input.observationMethod))) / previousSigma) * 100
      : 0

    return {
      success: result.success,
      eventId,
      previousEstimate: { mu: previousMu, sigma: previousSigma },
      difference,
      uncertaintyReduction: Math.max(uncertaintyReduction, 0),
      error: result.error,
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    }
  }
}

/**
 * Obtiene SKUs priorizados por EER para verificación selectiva.
 * Retorna los SKUs con mayor riesgo económico para que el usuario
 * verifique solo lo que importa (no lista plana de todos los productos).
 */
export async function getSKUsForVerification(
  tenantId: string,
  limit: number = 8
): Promise<Array<{
  skuId: string
  skuName: string
  category: string
  estimateMu: number
  estimateSigma: number
  confidenceLevel: string
  daysSinceObservation: number
  hypothesisFlags: string[]
}>> {
  await connectDB()

  // Buscar estados con mayor incertidumbre y que no hayan sido observados recientemente
  const states = await InventoryStateModel.find({
    tenantId,
    daysSinceObservation: { $gte: 1 }, // Al menos 1 día sin observar
    confidenceLevel: { $in: ["low", "critical"] },
  })
    .sort({ estimateSigma: -1 }) // Mayor σ primero
    .limit(limit)
    .populate("skuId", "name category")
    .lean()

  return states.map((s) => ({
    skuId: (s.skuId as any)?._id?.toString() ?? s.skuId.toString(),
    skuName: (s.skuId as any)?.name ?? "Unknown",
    category: (s.skuId as any)?.category ?? "other",
    estimateMu: s.estimateMu,
    estimateSigma: s.estimateSigma,
    confidenceLevel: s.confidenceLevel,
    daysSinceObservation: s.daysSinceObservation,
    hypothesisFlags: s.hypothesisFlags as string[],
  }))
}

function getConfidenceForMethod(method: string): number {
  switch (method) {
    case "connected_scale": return 0.98
    case "manual_scale": return 0.90
    case "visual_count": return 0.70
    case "estimation": return 0.40
    default: return 0.50
  }
}

function getSigmaFactor(method: string): number {
  switch (method) {
    case "connected_scale": return 0.02
    case "manual_scale": return 0.05
    case "visual_count": return 0.15
    case "estimation": return 0.30
    default: return 0.20
  }
}
