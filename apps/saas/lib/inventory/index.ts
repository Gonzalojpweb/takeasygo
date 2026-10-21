// ============================================================================
// Servicios de inventario (SaaS) — v2
// ============================================================================
// La lógica pura (creencia μ±σ, consumo, reconciliación, prioridades) vive en
// @takeasygo/business/inventory. Acá: persistencia y reglas del SaaS.
// ============================================================================

export { appendEvents, rebuildAggregate, rebuildTenant, loadAggregateEvents, type NewLedgerEvent } from './projector'
export { inventoryRoute, InventoryError, type InventoryCapability, type InventoryContext } from './route'
