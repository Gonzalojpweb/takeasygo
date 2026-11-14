import { NextResponse } from 'next/server'
import { inventoryRoute, InventoryError } from '@/lib/inventory/route'
import { loadCoach } from '@/lib/inventory/coach/load'

/**
 * GET /api/[tenant]/inventory/coach?locationId= (capture)
 * Guía en vivo: etapa del recorrido, próximo paso y lo que se detectó en los
 * datos reales de la sede (con números, causa y arreglo). Sin montos en pesos.
 */
export const GET = inventoryRoute('capture', async (ctx) => {
  const locationId = ctx.request.nextUrl.searchParams.get('locationId')
  if (!locationId) throw InventoryError.validation('locationId requerido')
  return NextResponse.json(await loadCoach(ctx, locationId))
})
