import { NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'
import { inventoryRoute, InventoryError } from '@/lib/inventory/route'
import { rebuildTenant } from '@/lib/inventory/projector'

/**
 * POST /api/[tenant]/inventory/rebuild (manage, solo admin de comercio)
 * Recalcula TODO el estado de inventario desde el ledger (la fuente de
 * verdad). Se usa después de migrar a v2 o al cambiar parámetros del modelo
 * (calibración de la Fase V). No modifica el ledger.
 */
export const POST = inventoryRoute('manage', async (ctx) => {
  if (ctx.user.role !== 'admin' && ctx.user.role !== 'superadmin') throw InventoryError.forbidden('Solo un administrador puede recalcular el inventario')
  if (ctx.scopedLocationIds) throw InventoryError.forbidden('El recálculo es de nivel comercio')
  const aggregates = await rebuildTenant(ctx.tenantId)
  logAudit({ tenantId: ctx.tenantId, action: 'inventory.rebuild', entity: 'inventory', entityId: ctx.tenantId, details: { aggregates }, request: ctx.request })
  return NextResponse.json({ aggregates })
})
