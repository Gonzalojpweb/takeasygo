import { NextResponse } from 'next/server'
import { inventoryRoute, InventoryError } from '@/lib/inventory/route'
import { loadOverview } from '@/lib/inventory/overview'

/**
 * GET /api/[tenant]/inventory/overview?locationId= (capture)
 * Centro "Ahora" de Inventario V3: estado de la sede, tareas con su acción y
 * cobertura real de recetas. Montos en pesos solo con `read`.
 */
export const GET = inventoryRoute('capture', async (ctx) => {
  const locationId = ctx.request.nextUrl.searchParams.get('locationId')
  if (!locationId) throw InventoryError.validation('locationId requerido')
  return NextResponse.json(await loadOverview(ctx, locationId))
})
