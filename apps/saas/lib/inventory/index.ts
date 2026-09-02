// ============================================================================
// @takeasygo/inventory — Servicios de inventario
// FASE04: Event Ledger + Estado derivado + EER + POS Capture + Recepciones
//         + Progressive Zero-Setup (Cold Start)
// ============================================================================

export { processInventoryEvent, projectEvent } from "./projector"
export {
  calculateEERForSKU,
  calculateConsumptionVelocity,
  getDailyPriorities,
} from "./eer-engine"
export type { EERResult, PrioritiesResponse } from "./eer-engine"
export { captureSaleConsumed, captureSaleConsumedOffline } from "./pos-capture"
export { captureGoodsReceived } from "./goods-received"
export { capturePhysicalCount, getSKUsForVerification } from "./physical-count"
export {
  inferSKUsFromMenu,
  confirmSKUs,
  ensureDefaultStorageLocations,
} from "./cold-start"
export type { InferredSKU, ColdStartResult } from "./cold-start"
export {
  createRecipeFromDeclaration,
  createRecipesBatch,
  getOnboardingStatus,
} from "./recipe-inference"
