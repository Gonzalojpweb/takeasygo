import { NextResponse } from 'next/server'
import { inventoryRoute, InventoryError } from '@/lib/inventory/route'
import { loadConsumptionCost } from '@/lib/inventory/read'

/**
 * GET /api/[tenant]/inventory/costs?locationId=&from=&to= (read)
 * Costo teórico de lo vendido en el período (consumo por receta × costo
 * promedio) y porciones vendidas sin receta.
 */
export const GET = inventoryRoute('read', async (ctx) => {
  const sp = ctx.request.nextUrl.searchParams
  const to = sp.get('to') ? new Date(sp.get('to')!) : new Date()
  const from = sp.get('from') ? new Date(sp.get('from')!) : new Date(to.getTime() - 7 * 86_400_000)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) throw InventoryError.validation('Rango de fechas inválido')
  if (to.getTime() - from.getTime() > 92 * 86_400_000) throw InventoryError.validation('El rango máximo es de 92 días')
  return NextResponse.json({ from, to, ...(await loadConsumptionCost(ctx, sp.get('locationId'), from, to)) })
})
