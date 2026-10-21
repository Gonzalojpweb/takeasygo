// ============================================================================
// @takeasygo/business/inventory — núcleo de dominio de TGO Inventory
// ============================================================================
// Puro (sin I/O): lo usan el SaaS en producción y el simulador de la Fase V
// (packages/inventory-eval). Una sola implementación de referencia.
// ============================================================================

export * from "./units"
export * from "./belief"
export * from "./aggregate-deltas"
export * from "./consumption"
export * from "./reconcile"
export * from "./priority"
export * from "./dish-dictionary"
