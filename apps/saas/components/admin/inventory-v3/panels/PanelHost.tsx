'use client'

// ============================================================================
// PanelHost — un solo panel abierto a la vez
// ============================================================================
// Las vistas piden un panel (`ctx.open({...})`); acá se decide cuál. Cada
// pedido monta un panel nuevo (key) → estado limpio, y un panel puede pasar
// a otro (detalle → contar) sin volver a la lista.
// ============================================================================

import type { V3Context } from '../InventoryV3'
import CountPanel from './CountPanel'
import WastePanel from './WastePanel'
import ReceivePanel from './ReceivePanel'
import ProductPanel from './ProductPanel'
import RecipePanel from './RecipePanel'
import AdjustPanel from './AdjustPanel'
import TransferPanel from './TransferPanel'
import SkuSettingsPanel from './SkuSettingsPanel'
import LocationSettingsPanel from './LocationSettingsPanel'
import ModifierPanel from './ModifierPanel'
import PreparationPanel from './PreparationPanel'
import ProductionPanel from './ProductionPanel'

export type PanelRequest =
  | { type: 'receive'; skuId?: string }
  | { type: 'count'; skuId: string; storageLocationId?: string | null }
  | { type: 'waste'; skuId: string; storageLocationId?: string | null }
  | { type: 'product'; skuId: string; storageLocationId?: string | null }
  | { type: 'recipe'; menuItemId: string; variantName?: string | null }
  | { type: 'adjust'; skuId: string; storageLocationId?: string | null }
  | { type: 'transfer'; skuId: string; storageLocationId?: string | null }
  | { type: 'sku-settings'; skuId: string }
  | { type: 'location-settings' }
  | { type: 'modifier'; optionName: string }
  | { type: 'preparation'; recipeId?: string | null }
  | { type: 'production'; recipeId?: string | null }

export interface PanelProps {
  ctx: V3Context
  onClose: () => void
  onSwitch: (p: PanelRequest) => void
  /** Algo se registró: las vistas recargan. */
  onChanged: () => void
}

function keyOf(r: PanelRequest): string {
  switch (r.type) {
    case 'receive':
      return `receive:${r.skuId ?? ''}`
    case 'recipe':
      return `recipe:${r.menuItemId}:${r.variantName ?? ''}`
    case 'sku-settings':
      return `sku-settings:${r.skuId}`
    case 'location-settings':
      return 'location-settings'
    case 'modifier':
      return `modifier:${r.optionName}`
    case 'preparation':
    case 'production':
      return `${r.type}:${r.recipeId ?? ''}`
    default:
      return `${r.type}:${r.skuId}:${r.storageLocationId ?? ''}`
  }
}

export default function PanelHost({
  ctx,
  request,
  onClose,
  onSwitch,
  onChanged,
}: { request: PanelRequest | null } & PanelProps) {
  if (!request) return null
  // Si el catálogo llega con el panel abierto, se remonta con los datos del insumo.
  const k = `${keyOf(request)}|${ctx.catalogReady}`
  const common = { ctx, onClose, onSwitch, onChanged }
  switch (request.type) {
    case 'count':
      return <CountPanel key={k} {...common} skuId={request.skuId} storageLocationId={request.storageLocationId ?? null} />
    case 'waste':
      return <WastePanel key={k} {...common} skuId={request.skuId} storageLocationId={request.storageLocationId ?? null} />
    case 'receive':
      return <ReceivePanel key={k} {...common} skuId={request.skuId ?? null} />
    case 'product':
      return <ProductPanel key={k} {...common} skuId={request.skuId} storageLocationId={request.storageLocationId ?? null} />
    case 'recipe':
      return <RecipePanel key={k} {...common} menuItemId={request.menuItemId} variantName={request.variantName ?? null} />
    case 'adjust':
      return <AdjustPanel key={k} {...common} skuId={request.skuId} storageLocationId={request.storageLocationId ?? null} />
    case 'transfer':
      return <TransferPanel key={k} {...common} skuId={request.skuId} storageLocationId={request.storageLocationId ?? null} />
    case 'sku-settings':
      return <SkuSettingsPanel key={k} {...common} skuId={request.skuId} />
    case 'location-settings':
      return <LocationSettingsPanel key={k} {...common} />
    case 'modifier':
      return <ModifierPanel key={k} {...common} optionName={request.optionName} />
    case 'preparation':
      return <PreparationPanel key={k} {...common} recipeId={request.recipeId ?? null} />
    case 'production':
      return <ProductionPanel key={k} {...common} recipeId={request.recipeId ?? null} />
  }
}

/** Depósito por defecto para una acción: el pedido, o el de consumo de la sede. */
export function resolveStorage(ctx: V3Context, requested: string | null): string | null {
  if (requested && ctx.storages.some((s) => s._id === requested)) return requested
  return ctx.storages.find((s) => s.isDefaultConsumption)?._id ?? ctx.storages[0]?._id ?? null
}
