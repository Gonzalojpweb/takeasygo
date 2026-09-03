import InventoryState from "@/models/InventoryState"
import InventorySKU from "@/models/InventorySKU"
import InventoryLedger from "@/models/InventoryLedger"
import { connectDB } from "../mongoose"

// ============================================================================
// EER Engine — Expected Economic Risk
// FASE04 §3.6, Roadmap §6 Etapa 4
//
// EER_i(t) = σ_i(t) × CostoUnitario_i × Velocidad_i(7d) × BusinessImpact_i
//
// ⚠️ EER es una heurística V1, NO una ley del sistema.
//    Debe estar claramente marcado como EER_V1 y ser calibrable.
//    Los pesos de businessImpact NO están hardcodeados — se leen de config.
// ============================================================================

// ── Configuración de pesos (calibrable, NO hardcodeado en la fórmula) ────────

interface EERConfig {
  /** Peso de BusinessImpact en la fórmula. Clave = nivel de impacto. */
  businessImpactWeights: Record<string, number>
  /** Índice de costo de interrupción por hora del día (0-23). 1.0 = base. */
  interruptionCostByHour: number[]
  /** Peso del costo de interrupción (0-1). 0 = ignorar IC, 1 = peso completo. */
  icWeight: number
}

const DEFAULT_EER_CONFIG: EERConfig = {
  businessImpactWeights: {
    critical: 4.0,
    high: 2.0,
    medium: 1.0,
    low: 0.5,
  },
  // IC más alto en hora pico (11-14, 19-22)
  interruptionCostByHour: [
    0.3, 0.3, 0.2, 0.2, 0.2, 0.3, // 00-05
    0.5, 0.7, 0.8, 0.9, 1.0, 1.2, // 06-11
    1.3, 1.2, 1.0, 0.9, 0.8, 1.0, // 12-17
    1.2, 1.3, 1.2, 1.0, 0.7, 0.5, // 18-23
  ],
  icWeight: 0.3,
}

// ── Velocity (consumo rolling 7 días) ────────────────────────────────────────

export async function calculateConsumptionVelocity(
  tenantId: string,
  skuId: string,
  storageLocationId: string,
  days: number = 7
): Promise<number> {
  const since = new Date()
  since.setDate(since.getDate() - days)

  const result = await InventoryLedger.aggregate([
    {
      $match: {
        tenantId: skuId ? skuId : tenantId, // Will be fixed by actual ObjectId
        skuId,
        storageLocationId,
        eventType: "SaleConsumed",
        recordedAt: { $gte: since },
      },
    },
    {
      $group: {
        _id: null,
        totalConsumed: { $sum: "$payload.quantityConsumed" },
      },
    },
  ])

  if (!result.length) return 0
  return result[0].totalConsumed / days
}

// ── Interruption Cost (IC) ───────────────────────────────────────────────────

function getInterruptionCost(now: Date, config: EERConfig = DEFAULT_EER_CONFIG): number {
  const hour = now.getHours()
  return config.interruptionCostByHour[hour] ?? 1.0
}

// ── Business Impact Weight ───────────────────────────────────────────────────

function businessImpactWeight(
  impact: string,
  config: EERConfig = DEFAULT_EER_CONFIG
): number {
  return config.businessImpactWeights[impact] ?? 1.0
}

// ── Cálculo de EER para un SKU×ubicación ─────────────────────────────────────

export interface EERResult {
  skuId: string
  storageLocationId: string
  skuName: string
  category: string
  eerScore: number
  estimateMu: number
  estimateSigma: number
  confidenceLevel: string
  daysSinceObservation: number
  consumptionVelocity7d: number
  hypothesisFlags: string[]
}

export async function calculateEERForSKU(
  tenantId: string,
  skuId: string,
  storageLocationId: string,
  now: Date = new Date(),
  config: EERConfig = DEFAULT_EER_CONFIG
): Promise<EERResult | null> {
  const [state, sku] = await Promise.all([
    InventoryState.findOne({ tenantId, skuId, storageLocationId }),
    InventorySKU.findById(skuId),
  ])

  if (!state || !sku) return null

  // Calcular velocity al vuelo
  const velocity = await calculateConsumptionVelocity(tenantId, skuId, storageLocationId)

  // EER = σ × CostoUnitario × Velocidad × BusinessImpact - IC(t)
  const ic = getInterruptionCost(now, config)
  const eerScore =
    state.estimateSigma *
    sku.lastUnitCostCents *
    velocity *
    businessImpactWeight(sku.businessImpact, config) -
    ic * config.icWeight

  return {
    skuId: skuId.toString(),
    storageLocationId: storageLocationId.toString(),
    skuName: sku.name,
    category: sku.category,
    eerScore: Math.max(eerScore, 0), // Negativo = bajo riesgo
    estimateMu: state.estimateMu,
    estimateSigma: state.estimateSigma,
    confidenceLevel: state.confidenceLevel,
    daysSinceObservation: state.daysSinceObservation,
    consumptionVelocity7d: velocity,
    hypothesisFlags: state.hypothesisFlags as string[],
  }
}

// ── Ranking diario: TOP N SKUs por EER ───────────────────────────────────────

export async function getDailyPriorities(
  tenantId: string,
  topN: number = 8,
  now: Date = new Date(),
  config: EERConfig = DEFAULT_EER_CONFIG
): Promise<EERResult[]> {
  // Obtener todos los states activos del tenant
  const states = await InventoryState.find({ tenantId })

  if (!states.length) return []

  // Calcular EER para cada uno
  const results: EERResult[] = []
  for (const state of states) {
    const eer = await calculateEERForSKU(
      tenantId,
      state.skuId.toString(),
      state.storageLocationId.toString(),
      now,
      config
    )
    if (eer) results.push(eer)
  }

  // Ordenar por EER descendente y tomar top N
  return results
    .sort((a, b) => b.eerScore - a.eerScore)
    .slice(0, topN)
}

// ── API Response type ────────────────────────────────────────────────────────

export interface PrioritiesResponse {
  generatedAt: Date
  tenantId: string
  priorities: EERResult[]
  config: {
    icWeight: number
    currentHour: number
  }
}
