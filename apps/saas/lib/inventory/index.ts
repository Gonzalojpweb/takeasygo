// ============================================================================
// @takeasygo/inventory — Servicios de inventario
// FASE04: Event Ledger + Estado derivado + EER + POS Capture + Recepciones
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
