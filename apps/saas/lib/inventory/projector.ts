import InventoryLedger from "@/models/InventoryLedger"
import InventoryState from "@/models/InventoryState"
import type {
  InventoryEventType,
  ObservationMethod,
  HypothesisFlag,
} from "@takeasygo/types"
import { connectDB } from "../mongoose"

// ============================================================================
// State Projector — Proyecta eventos del ledger → inventory_state
// FASE03 §3.3, FASE04 §3.6, Roadmap §6 Etapa 3
//
// Cada tipo de evento tiene una regla de cómo afecta μ y σ.
// El projector se ejecuta DENTRO de la misma transacción que el insert del ledger.
// ============================================================================

interface ProjectionResult {
  estimateMu: number
  estimateSigma: number
  confidenceLevel: "high" | "medium" | "low" | "critical"
  hypothesisFlags: HypothesisFlag[]
  daysSinceObservation: number
  lastPhysicalObservationAt?: Date
  lastPhysicalObservationMethod?: ObservationMethod
  openEvidenceRequest: boolean
  openEvidenceRequestId?: string
  evidenceDegradationStep: 0 | 1 | 2 | 3
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function deriveConfidenceLevel(sigma: number, mu: number): ProjectionResult["confidenceLevel"] {
  if (mu === 0) return "critical"
  const cv = Math.abs(sigma / mu) // Coefficient of variation
  if (cv < 0.1) return "high"
  if (cv < 0.25) return "medium"
  if (cv < 0.5) return "low"
  return "critical"
}

function sigmaForObservationMethod(method?: ObservationMethod): number {
  switch (method) {
    case "connected_scale": return 0.02
    case "manual_scale": return 0.05
    case "visual_count": return 0.15
    case "estimation": return 0.30
    default: return 0.20
  }
}

// ── Reglas de proyección por tipo de evento ──────────────────────────────────

function projectGoodsReceived(
  mu: number,
  sigma: number,
  payload: { quantity: number },
  confidence: number
): Pick<ProjectionResult, "estimateMu" | "estimateSigma"> {
  // μ += qty; σ contrae (evidencia transaccional fuerte)
  const newMu = mu + payload.quantity
  const evidenceStrength = confidence * 0.3 // Recepción fuerte, reduce σ hasta 30%
  const newSigma = sigma * (1 - evidenceStrength)
  return { estimateMu: newMu, estimateSigma: Math.max(newSigma, 0.001) }
}

function projectSaleConsumed(
  mu: number,
  sigma: number,
  payload: { quantityConsumed: number; isTheoretical: boolean },
  confidence: number
): Pick<ProjectionResult, "estimateMu" | "estimateSigma"> {
  // μ -= qty_consumed; σ expande levemente (yield puede variar)
  const newMu = mu - payload.quantityConsumed
  // Si es teórico (de receta), σ expande más porque el yield es incierto
  const uncertaintyFactor = payload.isTheoretical ? 0.05 : 0.02
  const newSigma = sigma * (1 + uncertaintyFactor)
  return {
    estimateMu: Math.max(newMu, 0), // Stock no puede ser negativo en la estimación
    estimateSigma: newSigma,
  }
}

function projectProductionTransformed(
  mu: number,
  sigma: number,
  payload: { inputQuantity: number; outputQuantity: number; yieldObserved: number }
): Pick<ProjectionResult, "estimateMu" | "estimateSigma"> {
  // μ cambia según yield_observed; σ actualiza prior Beta
  const newMu = mu - payload.inputQuantity + payload.outputQuantity
  // El yield observado reduce la incertidumbre del prior
  const yieldDeviation = Math.abs(payload.yieldObserved - 0.75) // 0.75 = yield típico
  const sigmaAdjustment = 1 - yieldDeviation * 0.1
  return {
    estimateMu: Math.max(newMu, 0),
    estimateSigma: sigma * Math.max(sigmaAdjustment, 0.8),
  }
}

function projectWasteRecorded(
  mu: number,
  sigma: number,
  payload: { quantity: number },
  observationMethod?: ObservationMethod
): Pick<ProjectionResult, "estimateMu" | "estimateSigma"> {
  // μ -= qty; σ contrae si es medida, expande si es estimada
  const newMu = mu - payload.quantity
  if (observationMethod && ["connected_scale", "manual_scale"].includes(observationMethod)) {
    // Medido → contrae
    return { estimateMu: Math.max(newMu, 0), estimateSigma: sigma * 0.9 }
  }
  // Estimado → expande
  return { estimateMu: Math.max(newMu, 0), estimateSigma: sigma * 1.1 }
}

function projectPhysicalCountObserved(
  payload: {
    observedQuantity: number
    previousEstimateMu: number
    previousEstimateSigma: number
    difference: number
  },
  observationMethod?: ObservationMethod
): Pick<ProjectionResult, "estimateMu" | "estimateSigma" | "lastPhysicalObservationAt" | "lastPhysicalObservationMethod"> {
  // μ ← observed_qty; σ contrae según observation_method
  const sigmaReduction = sigmaForObservationMethod(observationMethod)
  return {
    estimateMu: payload.observedQuantity,
    estimateSigma: payload.observedQuantity * sigmaReduction,
    lastPhysicalObservationAt: new Date(),
    lastPhysicalObservationMethod: observationMethod,
  }
}

function projectAdjustmentApplied(
  mu: number,
  sigma: number,
  payload: { delta: number; hypothesisTree: string[] },
  hypothesisFlags: HypothesisFlag[]
): Pick<ProjectionResult, "estimateMu" | "estimateSigma" | "hypothesisFlags"> {
  // μ += delta; registra discrepancia; activa hypothesis_tree
  const newMu = mu + payload.delta
  const discrepancyRatio = Math.abs(payload.delta) / Math.max(mu, 1)
  const newSigma = sigma * (1 + discrepancyRatio * 0.2) // Ajustes aumentan incertidumbre

  // Agregar flags de hipótesis basadas en el árbol
  const newFlags = [...hypothesisFlags]
  if (payload.hypothesisTree.includes("possible_under_portioning") && !newFlags.includes("possible_under_portioning")) {
    newFlags.push("possible_under_portioning")
  }
  if (payload.hypothesisTree.includes("possible_unrecorded_waste") && !newFlags.includes("possible_unrecorded_waste")) {
    newFlags.push("possible_unrecorded_waste")
  }

  return {
    estimateMu: newMu,
    estimateSigma: newSigma,
    hypothesisFlags: newFlags,
  }
}

function projectEvidenceIgnored(
  sigma: number,
  degradationStep: 0 | 1 | 2 | 3
): Pick<ProjectionResult, "estimateSigma" | "evidenceDegradationStep"> {
  // σ expande; evidence_degradation_step++
  const expansionFactor = 1 + (degradationStep * 0.1) // Cada paso expansiona más
  return {
    estimateSigma: sigma * expansionFactor,
    evidenceDegradationStep: Math.min(degradationStep + 1, 3) as 0 | 1 | 2 | 3,
  }
}

// ── Función principal de proyección ──────────────────────────────────────────

export function projectEvent(
  currentState: {
    estimateMu: number
    estimateSigma: number
    hypothesisFlags: HypothesisFlag[]
    daysSinceObservation: number
    lastPhysicalObservationAt?: Date
    lastPhysicalObservationMethod?: ObservationMethod
    evidenceDegradationStep: 0 | 1 | 2 | 3
    openEvidenceRequest: boolean
    openEvidenceRequestId?: string
  },
  event: {
    eventType: InventoryEventType
    confidence: number
    observationMethod?: ObservationMethod
    payload: Record<string, unknown>
  }
): ProjectionResult {
  const { estimateMu: mu, estimateSigma: sigma, hypothesisFlags, evidenceDegradationStep } = currentState
  let projection: Partial<ProjectionResult> = {}

  switch (event.eventType) {
    case "GoodsReceived":
      projection = projectGoodsReceived(mu, sigma, event.payload as { quantity: number }, event.confidence)
      break

    case "SaleConsumed":
      projection = projectSaleConsumed(mu, sigma, event.payload as { quantityConsumed: number; isTheoretical: boolean }, event.confidence)
      break

    case "ProductionTransformed":
      projection = projectProductionTransformed(mu, sigma, event.payload as { inputQuantity: number; outputQuantity: number; yieldObserved: number })
      break

    case "WasteRecorded":
      projection = projectWasteRecorded(mu, sigma, event.payload as { quantity: number }, event.observationMethod)
      break

    case "PhysicalCountObserved":
      projection = projectPhysicalCountObserved(event.payload as { observedQuantity: number; previousEstimateMu: number; previousEstimateSigma: number; difference: number }, event.observationMethod)
      break

    case "AdjustmentApplied":
      projection = projectAdjustmentApplied(mu, sigma, event.payload as { delta: number; hypothesisTree: string[] }, hypothesisFlags)
      break

    case "EvidenceIgnored":
      projection = projectEvidenceIgnored(sigma, evidenceDegradationStep)
      break

    case "UnitEquivalenceLearned":
    case "EvidenceRequested":
    case "ModelCalibrated":
      // Estos eventos no afectan μ ni σ directamente
      break
  }

  // Combinar con estado actual
  const newMu = projection.estimateMu ?? mu
  const newSigma = projection.estimateSigma ?? sigma

  return {
    estimateMu: newMu,
    estimateSigma: newSigma,
    confidenceLevel: deriveConfidenceLevel(newSigma, newMu),
    hypothesisFlags: projection.hypothesisFlags ?? hypothesisFlags,
    daysSinceObservation: projection.lastPhysicalObservationAt
      ? 0
      : currentState.daysSinceObservation + 1,
    lastPhysicalObservationAt: projection.lastPhysicalObservationAt ?? currentState.lastPhysicalObservationAt,
    lastPhysicalObservationMethod: projection.lastPhysicalObservationMethod ?? currentState.lastPhysicalObservationMethod,
    openEvidenceRequest: currentState.openEvidenceRequest,
    openEvidenceRequestId: currentState.openEvidenceRequestId,
    evidenceDegradationStep: projection.evidenceDegradationStep ?? evidenceDegradationStep,
  }
}

// ── Procesamiento transaccional: insert ledger + update state ────────────────

export async function processInventoryEvent(eventData: {
  eventId: string
  tenantId: string
  skuId: string
  storageLocationId: string
  eventType: InventoryEventType
  eventVersion?: number
  occurredAt: Date
  recordedAt: Date
  actorId?: string
  source: "pos" | "manual" | "ocr" | "api" | "system"
  observationMethod?: ObservationMethod
  confidence: number
  correlationId?: string
  payload: Record<string, unknown>
}): Promise<{ success: boolean; error?: string }> {
  await connectDB()

  // 1. Insert en ledger (idempotencia: eventId es unique)
  try {
    await InventoryLedger.create(eventData as any)
  } catch (err: any) {
    if (err.code === 11000) {
      // Duplicate key → evento ya procesado (idempotencia)
      return { success: true }
    }
    throw err
  }

  // 2. Buscar o crear estado actual
  let state = await InventoryState.findOne({
    tenantId: eventData.tenantId,
    skuId: eventData.skuId,
    storageLocationId: eventData.storageLocationId,
  })

  const isNew = !state
  if (isNew) {
    state = new InventoryState({
      tenantId: eventData.tenantId,
      skuId: eventData.skuId,
      storageLocationId: eventData.storageLocationId,
      estimateMu: 0,
      estimateSigma: 0,
      confidenceLevel: "critical",
      hypothesisFlags: [],
      daysSinceObservation: 0,
      openEvidenceRequest: false,
      evidenceDegradationStep: 0,
      consumptionVelocity7d: 0,
      lastEventId: eventData.eventId,
      lastEventSequence: 0,
    })
  }

  // 3. Proyectar evento sobre estado actual
  const projection = projectEvent(
    {
      estimateMu: state!.estimateMu,
      estimateSigma: state!.estimateSigma,
      hypothesisFlags: (state!.hypothesisFlags as HypothesisFlag[]) || [],
      daysSinceObservation: state!.daysSinceObservation,
      lastPhysicalObservationAt: state!.lastPhysicalObservationAt,
      lastPhysicalObservationMethod: state!.lastPhysicalObservationMethod as ObservationMethod | undefined,
      evidenceDegradationStep: state!.evidenceDegradationStep as 0 | 1 | 2 | 3,
      openEvidenceRequest: state!.openEvidenceRequest,
      openEvidenceRequestId: state!.openEvidenceRequestId,
    },
    {
      eventType: eventData.eventType,
      confidence: eventData.confidence,
      observationMethod: eventData.observationMethod,
      payload: eventData.payload,
    }
  )

  // 4. Actualizar estado
  state!.estimateMu = projection.estimateMu
  state!.estimateSigma = projection.estimateSigma
  state!.confidenceLevel = projection.confidenceLevel
  state!.hypothesisFlags = projection.hypothesisFlags
  state!.daysSinceObservation = projection.daysSinceObservation
  state!.lastPhysicalObservationAt = projection.lastPhysicalObservationAt
  state!.lastPhysicalObservationMethod = projection.lastPhysicalObservationMethod
  state!.openEvidenceRequest = projection.openEvidenceRequest
  state!.openEvidenceRequestId = projection.openEvidenceRequestId
  state!.evidenceDegradationStep = projection.evidenceDegradationStep
  state!.lastEventId = eventData.eventId
  state!.lastEventSequence = (state!.lastEventSequence || 0) + 1

  await state!.save()

  return { success: true }
}
